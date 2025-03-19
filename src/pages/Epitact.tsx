import React, { useState, useEffect, useRef } from "react";
import productsData from "../../public/epitact.json";

// Définition des interfaces
interface Product {
  url: string;
  tab_description?: string | null;
  images?: Array<{
    src?: string | null;
    alt?: string | null;
    data_twic_src?: string | null;
  }> | null;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

// Questions prédéfinies pour le diagnostic
const diagnosticQuestions = [
  "Pouvez-vous préciser où se situe votre douleur au pied ? (gros orteil/hallux valgus, avant-pied/plante, talon, petits orteils, cheville...)",
  "Comment décririez-vous votre problème ? (douleur, cors/durillons, ampoules, ongles abîmés, déformation, sécheresse...)",
  "Quand ressentez-vous cette gêne ? (en marchant, au repos, pendant le sport, avec certaines chaussures...)",
  "Depuis combien de temps avez-vous ce problème et quelle est son intensité ? (récent/ancien, léger/sévère)",
];

const EpitactAI: React.FC = () => {
  const [query, setQuery] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content:
        "Bienvenue ! Je suis l'assistant Epitact. Je vais vous poser quelques questions pour mieux comprendre votre problème et vous recommander les produits adaptés.",
      timestamp: new Date().toLocaleTimeString(),
    },
    {
      role: "assistant",
      content: diagnosticQuestions[0],
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [diagnosticComplete, setDiagnosticComplete] = useState<boolean>(false);
  const [userResponses, setUserResponses] = useState<string[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // États pour le modal de partage
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>("");

  // Fonction pour extraire un nom de produit à partir de l'URL
  const getProductName = (url: string): string => {
    const parts = url.split("/");
    const lastPart = parts[parts.length - 1];
    return lastPart
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Fonction pour déterminer la catégorie d'un produit à partir de son URL
  const getCategoryFromUrl = (url: string): string => {
    if (url.includes("hallux")) return "Hallux Valgus";
    if (url.includes("quintus-varus")) return "Quintus Varus";
    if (url.includes("plantaire") || url.includes("metatars"))
      return "Douleurs plantaires";
    if (url.includes("cor") || url.includes("durillon"))
      return "Cors et durillons";
    if (url.includes("digitubes") || url.includes("doigtier"))
      return "Protection orteils";
    if (url.includes("separateur")) return "Séparateurs d'orteils";
    if (
      url.includes("orteil") ||
      url.includes("marteau") ||
      url.includes("griffe")
    )
      return "Orteils";
    if (url.includes("sport")) return "Sport";
    if (url.includes("cheville")) return "Cheville";
    if (url.includes("talon") || url.includes("calcan")) return "Talon";
    if (url.includes("ampoule")) return "Ampoules";
    if (url.includes("ongle")) return "Ongles";
    return "Autre";
  };

  // Fonction pour analyser les symptômes de l'utilisateur
  const analyzeUserSymptoms = (): Map<string, number> => {
    const combinedText = userResponses.join(" ").toLowerCase();
    const symptomScores = new Map<string, number>();

    // Dictionnaire de symptômes et leurs termes associés
    const symptomTerms: Record<string, string[]> = {
      "hallux valgus": ["hallux", "oignon", "gros orteil", "premier orteil"],
      "quintus varus": ["quintus", "petit orteil", "5e orteil", "5ème orteil"],
      cors: [
        "cor",
        "durillon",
        "callosité",
        "oeil de perdrix",
        "œil-de-perdrix",
      ],
      "orteil en marteau": [
        "orteil en griffe",
        "marteau",
        "griffe",
        "déformation orteil",
      ],
      ampoules: ["ampoule", "phlyctène", "frottement", "cloque"],
      "douleur plantaire": [
        "plantaire",
        "avant-pied",
        "métatarse",
        "voûte",
        "durillon",
      ],
      "épine calcanéenne": ["talon", "épine", "calcanéum", "aponévrosite"],
      "ongles incarnés": [
        "ongle incarné",
        "ongle qui rentre",
        "ongle douloureux",
      ],
      "ongles noirs": ["ongle noir", "ongle bleu", "hématome sous-unguéal"],
      "douleur genou": ["genou", "rotule", "rotulien", "ménisque", "ligament"],
      cheville: ["cheville", "malléole", "entorse", "instabilité"],
      "second orteil": [
        "second orteil",
        "2e orteil",
        "2ème orteil",
        "deuxième orteil",
      ],
      "troisième orteil": ["troisième orteil", "3e orteil", "3ème orteil"],
      "quatrième orteil": ["quatrième orteil", "4e orteil", "4ème orteil"],
    };

    // Parcourir tous les symptômes et calculer un score pour chacun
    for (const [symptom, terms] of Object.entries(symptomTerms)) {
      let score = 0;
      for (const term of terms) {
        if (combinedText.includes(term)) {
          score += 1;
        }
      }
      if (score > 0) {
        symptomScores.set(symptom, score);
      }
    }

    return symptomScores;
  };

  // Fonction pour calculer la pertinence d'un produit par rapport aux symptômes
  const calculateProductRelevance = (
    product: Product,
    symptoms: Map<string, number>
  ): number => {
    if (!product.tab_description) return 0;
    const description = product.tab_description.toLowerCase();
    const url = product.url.toLowerCase();

    let totalScore = 0;

    for (const [symptom, symptomScore] of symptoms.entries()) {
      // Liste des correspondances entre symptômes et produits
      if (
        symptom === "hallux valgus" &&
        (description.includes("hallux") || url.includes("hallux"))
      ) {
        totalScore += symptomScore * 2;
      } else if (
        symptom === "quintus varus" &&
        (description.includes("quintus") || url.includes("quintus"))
      ) {
        totalScore += symptomScore * 2;
      } else if (
        symptom === "cors" &&
        (description.includes("cor") ||
          description.includes("durillon") ||
          description.includes("œil-de-perdrix") ||
          url.includes("cor") ||
          url.includes("digitubes"))
      ) {
        totalScore += symptomScore * 1.5;
      } else if (
        (symptom === "second orteil" ||
          symptom === "troisième orteil" ||
          symptom === "quatrième orteil") &&
        (description.includes("doigtier") ||
          description.includes("digitubes") ||
          description.includes("séparateur") ||
          description.includes("barrette") ||
          url.includes("doigtier") ||
          url.includes("digitubes") ||
          url.includes("separateur") ||
          url.includes("barrette"))
      ) {
        totalScore += symptomScore * 2; // Priorité élevée pour les problèmes spécifiques d'orteils
      } else if (
        symptom === "orteil en marteau" &&
        (description.includes("orteil en marteau") ||
          description.includes("orteil en griffe") ||
          url.includes("marteau") ||
          url.includes("griffe"))
      ) {
        totalScore += symptomScore * 1.5;
      } else if (
        symptom === "ampoules" &&
        (description.includes("ampoule") ||
          url.includes("ampoule") ||
          url.includes("double-peau"))
      ) {
        totalScore += symptomScore * 1.5;
      } else if (
        symptom === "douleur plantaire" &&
        (description.includes("plantaire") ||
          description.includes("avant-pied") ||
          url.includes("plantaire") ||
          url.includes("avant-pied") ||
          url.includes("coussinet"))
      ) {
        totalScore += symptomScore;
      } else if (
        symptom === "épine calcanéenne" &&
        (description.includes("talon") ||
          description.includes("épine") ||
          description.includes("aponévrosite") ||
          url.includes("talon") ||
          url.includes("calcan"))
      ) {
        totalScore += symptomScore;
      } else if (
        symptom === "ongles incarnés" &&
        ((description.includes("ongle") && description.includes("incarné")) ||
          url.includes("ongle"))
      ) {
        totalScore += symptomScore;
      } else if (
        symptom === "ongles noirs" &&
        ((description.includes("ongle") &&
          (description.includes("noir") || description.includes("bleu"))) ||
          url.includes("ongle") ||
          url.includes("bleu"))
      ) {
        totalScore += symptomScore;
      } else if (
        symptom === "douleur genou" &&
        (description.includes("genou") ||
          url.includes("genou") ||
          url.includes("rotule") ||
          url.includes("physiostrap"))
      ) {
        totalScore += symptomScore;
      } else if (
        symptom === "cheville" &&
        (description.includes("cheville") ||
          description.includes("malléole") ||
          url.includes("cheville") ||
          url.includes("malleole"))
      ) {
        totalScore += symptomScore;
      }
    }

    return totalScore;
  };

  // Fonction pour valider les recommandations avant de les afficher
  const validateRecommendations = (aiResponse: string): boolean => {
    const userSymptoms = analyzeUserSymptoms();

    // Vérifiez si l'utilisateur a mentionné des orteils spécifiques autres que le gros orteil
    const hasOtherOrteils =
      userSymptoms.has("second orteil") ||
      userSymptoms.has("troisième orteil") ||
      userSymptoms.has("quatrième orteil");

    // Vérifiez si l'IA recommande des produits pour hallux valgus
    const recommendsHalluxValgus =
      aiResponse.toLowerCase().includes("hallux valgus") &&
      !aiResponse.toLowerCase().includes("ne convient pas pour") &&
      !aiResponse.toLowerCase().includes("ne sont pas adaptés");

    // Si l'utilisateur parle d'autres orteils mais que l'IA recommande hallux valgus
    if (hasOtherOrteils && recommendsHalluxValgus) {
      return false;
    }

    return true;
  };

  // Créer un contexte système enrichi avec les données des produits
  const createSystemPrompt = (): string => {
    // Analyser les symptômes de l'utilisateur
    const userSymptoms = analyzeUserSymptoms();
    let symptomsList = "";
    for (const [symptom, score] of userSymptoms.entries()) {
      symptomsList += `- ${symptom} (score de confiance: ${score})\n`;
    }

    // Extraire les informations essentielles des produits
    const productInfo = productsData
      .filter(
        (product: Product) =>
          product.tab_description && product.images && product.images.length > 0
      )
      .map((product: Product) => {
        const name = getProductName(product.url);
        // Limiter la description pour éviter un prompt trop long
        const description = product.tab_description
          ? product.tab_description.substring(0, 300) + "..."
          : "";
        const url = product.url;
        const category = getCategoryFromUrl(product.url);

        return `Produit: ${name}
Catégorie: ${category}
Description: ${description}
URL: ${url}
`;
      })
      .join("\n\n");

    return `Tu es un assistant spécialisé dans les produits Epitact pour les problèmes de pieds et de chevilles.
Ta mission est d'analyser avec précision les réponses du patient et de recommander UNIQUEMENT les produits les plus adaptés à son cas spécifique.

Voici les réponses du patient aux questions de diagnostic:
1. Où se situe la douleur ? ${userResponses[0] || "Non précisé"}
2. Type de problème ? ${userResponses[1] || "Non précisé"}
3. Contexte de la gêne ? ${userResponses[2] || "Non précisé"}
4. Durée et intensité ? ${userResponses[3] || "Non précisé"}

Analyse de symptômes détectés:
${symptomsList || "Aucun symptôme spécifique détecté."}

RÈGLES IMPORTANTES À RESPECTER:
- Si le patient mentionne le "second orteil", "2ème orteil", "3ème orteil", ou tout autre orteil SAUF le gros orteil, NE RECOMMANDE PAS de produits pour hallux valgus.
- Pour les problèmes des orteils autres que le gros orteil, recommande plutôt des produits comme: Digitubes, Doigtiers, Séparateurs d'orteils, Barrettes sous-diaphysaires.
- Si le patient mentionne le "gros orteil", propose des solutions pour hallux valgus.
- Si le patient mentionne le "petit orteil" (5ème orteil), examine si le produit pour quintus varus convient.
- Si le patient parle d'ampoules, recommande les produits anti-ampoules ou plaques double peau.
- Pour les cors entre les orteils (œils-de-perdrix), propose les séparateurs d'orteils ou Digitubes.
- Sois très attentif aux détails précis fournis par le patient.
- Ne recommande que des produits qui existent dans la base de données ci-dessous.

Voici la base de données des produits Epitact que tu dois utiliser pour tes recommandations:

${productInfo}

Analyse ces informations et recommande 2 à 3 produits Epitact qui correspondent EXACTEMENT au problème du patient.
Explique brièvement pourquoi tu recommandes chaque produit.
Rappelle au patient que ces recommandations ne remplacent pas l'avis d'un médecin.`;
  };

  // Fonction pour trouver les produits pertinents basée sur le texte de la réponse de l'IA
  const findRelevantProducts = (aiResponse: string): Product[] => {
    const mentionedProducts: Product[] = [];

    // 1. D'abord, rechercher des mentions directes de produits dans la réponse de l'IA
    const productNames = productsData
      .map((product: Product) => getProductName(product.url))
      .filter((name: string) => name.length > 5); // Ignorer les noms trop courts

    for (const name of productNames) {
      if (aiResponse.toLowerCase().includes(name.toLowerCase())) {
        // Trouver le produit complet correspondant au nom
        const product = productsData.find(
          (p: Product) =>
            getProductName(p.url).toLowerCase() === name.toLowerCase()
        );
        if (
          product &&
          product.images &&
          product.images.length > 0 &&
          product.images[0]?.src
        ) {
          mentionedProducts.push(product);
        }
      }
    }

    // 2. Si on n'a pas trouvé assez de produits, utiliser l'analyse des symptômes
    if (mentionedProducts.length < 3) {
      // Analyser les symptômes de l'utilisateur
      const userSymptoms = analyzeUserSymptoms();

      // Filtrer les produits pertinents en fonction des symptômes
      const relevantProducts = productsData.filter((product: Product) => {
        // Vérifier que le produit a une description et des images
        if (
          !product.tab_description ||
          !product.images ||
          product.images.length === 0 ||
          !product.images[0]?.src
        ) {
          return false;
        }

        // Calculer la pertinence du produit
        const relevanceScore = calculateProductRelevance(product, userSymptoms);
        return relevanceScore > 0;
      });

      // Trier les produits par score de pertinence
      relevantProducts.sort((a, b) => {
        const scoreA = calculateProductRelevance(a, userSymptoms);
        const scoreB = calculateProductRelevance(b, userSymptoms);
        return scoreB - scoreA;
      });

      // Ajouter les produits les plus pertinents qui ne sont pas déjà dans la liste
      for (const product of relevantProducts) {
        if (!mentionedProducts.some((p) => p.url === product.url)) {
          mentionedProducts.push(product);
          if (mentionedProducts.length >= 3) break;
        }
      }
    }

    return mentionedProducts.slice(0, 3); // Limiter à 3 produits maximum
  };

  // Fonction pour générer une réponse avec l'API Groq
  const generateAIResponse = async (): Promise<string> => {
    try {
      setIsLoading(true);

      // Préparer les messages pour l'API
      const apiMessages = [{ role: "system", content: createSystemPrompt() }];

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: apiMessages,
            model: "gemma2-9b-it", // Ou un autre modèle disponible
            temperature: 0.2, // Température plus basse pour des réponses plus précises
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content;

      return aiResponse;
    } catch (error) {
      console.error("Erreur lors de la génération de la réponse:", error);
      return "Désolé, je n'ai pas pu générer une recommandation. Veuillez réessayer ou consulter un professionnel de santé.";
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour générer une réponse corrigée si nécessaire
  const generateCorrectedResponse = async (): Promise<string> => {
    try {
      setIsLoading(true);

      // Créer un prompt corrigé plus strict
      const correctedPrompt =
        createSystemPrompt() +
        `

ATTENTION SUPPLÉMENTAIRE: 
J'ai remarqué que tu as recommandé des produits pour hallux valgus alors que le patient parle d'un autre orteil que le gros orteil.

Les produits pour hallux valgus NE SONT PAS ADAPTÉS pour les problèmes des autres orteils (2e, 3e, 4e, 5e).

Pour les problèmes des autres orteils, recommande plutôt:
- Digitubes (pour cors dorsaux et œils-de-perdrix)
- Doigtiers (pour protéger l'extrémité des orteils)
- Séparateurs d'orteils (pour éviter les frottements entre orteils)
- Barrettes sous-diaphysaires (pour orteils en griffe/marteau)`;

      // Préparer les messages pour l'API
      const apiMessages = [{ role: "system", content: correctedPrompt }];

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: apiMessages,
            model: "gemma2-9b-it",
            temperature: 0.1, // Température encore plus basse pour la correction
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Erreur API correction: ${response.status}`);
      }

      const data = await response.json();
      const correctedResponse = data.choices[0].message.content;

      return correctedResponse;
    } catch (error) {
      console.error("Erreur lors de la génération de la correction:", error);
      return "Excusez-moi pour l'erreur précédente. Pour les problèmes des orteils autres que le gros orteil, je recommande plutôt les Digitubes, Doigtiers ou Séparateurs d'orteils d'Epitact, qui sont spécifiquement conçus pour ces problèmes. Les produits pour hallux valgus ne conviennent que pour le gros orteil.";
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour faire défiler automatiquement vers le bas
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fonction pour ouvrir le modal avec le produit sélectionné
  const openShareModal = (product: Product) => {
    setSelectedProduct(product);
    setShowModal(true);
  };

  // Fonction pour fermer le modal
  const closeShareModal = () => {
    setShowModal(false);
    setSelectedProduct(null);
    setPhoneNumber("");
  };

  // Fonction pour partager via WhatsApp
  const shareViaWhatsApp = () => {
    if (!selectedProduct) return;

    const productName = getProductName(selectedProduct.url);
    const message = `Découvre ce produit Epitact : ${productName} - ${selectedProduct.url}`;

    // Si un numéro est fourni, on l'utilise, sinon on partage via l'app générale
    let whatsappUrl = "";
    if (phoneNumber.trim()) {
      // Formater le numéro (enlever les espaces, +, etc.)
      const formattedNumber = phoneNumber.replace(/\D/g, "");
      whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedNumber}&text=${encodeURIComponent(
        message
      )}`;
    } else {
      whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
        message
      )}`;
    }

    window.open(whatsappUrl, "_blank");
    closeShareModal();
  };

  // Fonction pour copier le lien dans le presse-papier
  const copyLink = () => {
    if (!selectedProduct) return;

    navigator.clipboard
      .writeText(selectedProduct.url)
      .then(() => {
        alert("Lien copié dans le presse-papier !");
        closeShareModal();
      })
      .catch((err) => {
        console.error("Erreur lors de la copie du lien :", err);
        alert("Impossible de copier le lien. Veuillez réessayer.");
      });
  };

  // Fonction pour partager via email
  const shareViaEmail = () => {
    if (!selectedProduct) return;

    const productName = getProductName(selectedProduct.url);
    const subject = `Découvrez ce produit Epitact : ${productName}`;
    const body = `Bonjour,\n\nJe pense que ce produit Epitact pourrait vous intéresser :\n\n${productName}\n${selectedProduct.url}\n\nBonne journée !`;

    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    closeShareModal();
  };

  // Fonction pour traiter la soumission de la question
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    // Ajouter la réponse de l'utilisateur à la conversation
    const userMessage: Message = {
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Stocker la réponse de l'utilisateur
    const updatedResponses = [...userResponses];
    updatedResponses[currentQuestionIndex] = query;
    setUserResponses(updatedResponses);

    // Vérifier si c'est la dernière question
    if (currentQuestionIndex < diagnosticQuestions.length - 1) {
      // Passer à la question suivante
      const nextQuestionIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextQuestionIndex);

      // Ajouter la prochaine question à la conversation
      const nextQuestionMessage: Message = {
        role: "assistant",
        content: diagnosticQuestions[nextQuestionIndex],
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, nextQuestionMessage]);
    } else {
      // Toutes les questions ont été posées, générer une recommandation
      setDiagnosticComplete(true);

      // Message de transition
      const transitionMessage: Message = {
        role: "assistant",
        content:
          "Merci pour vos réponses. Je vais maintenant analyser ces informations pour vous recommander les produits Epitact les plus adaptés à votre situation...",
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, transitionMessage]);

      // Générer une recommandation basée sur les réponses
      const aiResponse = await generateAIResponse();

      // Vérifier si les recommandations sont cohérentes
      if (!validateRecommendations(aiResponse)) {
        // Si incohérence, générer une nouvelle réponse plus adaptée
        const correctionMessage: Message = {
          role: "assistant",
          content:
            "J'ai remarqué une incohérence dans mes recommandations. Laissez-moi corriger cela...",
          timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, correctionMessage]);

        // Générer une réponse corrigée
        const correctedAiResponse = await generateCorrectedResponse();

        // Ajouter la recommandation corrigée
        const correctedRecommendationMessage: Message = {
          role: "assistant",
          content: correctedAiResponse,
          timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, correctedRecommendationMessage]);

        // Trouver les produits pertinents basés sur la réponse corrigée
        const products = findRelevantProducts(correctedAiResponse);
        setSuggestedProducts(products);
      } else {
        // Si les recommandations sont cohérentes, continuer comme avant
        const recommendationMessage: Message = {
          role: "assistant",
          content: aiResponse,
          timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, recommendationMessage]);

        // Trouver les produits pertinents
        const products = findRelevantProducts(aiResponse);
        setSuggestedProducts(products);
      }
    }

    setQuery("");
  };

  // Fonction pour redémarrer le diagnostic
  const restartDiagnostic = () => {
    setMessages([
      {
        role: "system",
        content:
          "Bienvenue ! Je suis l'assistant Epitact. Je vais vous poser quelques questions pour mieux comprendre votre problème et vous recommander les produits adaptés.",
        timestamp: new Date().toLocaleTimeString(),
      },
      {
        role: "assistant",
        content: diagnosticQuestions[0],
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    setCurrentQuestionIndex(0);
    setDiagnosticComplete(false);
    setUserResponses([]);
    setSuggestedProducts([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-center mb-6">Assistant Epitact</h1>

      {/* Zone de conversation */}
      <div className="bg-gray-100 rounded-lg p-4 mb-4 h-96 overflow-y-auto">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`mb-4 ${message.role === "user" ? "text-right" : ""}`}
          >
            {message.role !== "system" && (
              <div
                className={`inline-block p-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-white text-gray-800 border border-gray-300"
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-bold">
                    {message.role === "user" ? "Vous" : "Assistant Epitact"}
                  </span>
                  {message.timestamp && (
                    <span className="text-xs opacity-75">
                      {message.timestamp}
                    </span>
                  )}
                </div>
                <div>{message.content}</div>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="text-center py-3">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
            <p className="text-sm text-gray-500 mt-1">
              L'assistant réfléchit...
            </p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Formulaire de question */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              diagnosticComplete
                ? "Posez une autre question..."
                : "Votre réponse..."
            }
            className="flex-grow p-3 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            className={`px-4 py-3 rounded-r-lg transition-colors ${
              isLoading
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
            disabled={isLoading}
          >
            {isLoading ? "Envoi..." : "Envoyer"}
          </button>
        </div>
      </form>

      {/* Produits suggérés */}
      {suggestedProducts.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Produits recommandés :</h2>
            <button
              onClick={restartDiagnostic}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Nouveau diagnostic
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suggestedProducts.map((product, index) => (
              <div
                key={index}
                className="block bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-transform duration-300 hover:-translate-y-1 cursor-pointer"
                onClick={() => openShareModal(product)}
              >
                {product.images &&
                  product.images.length > 0 &&
                  product.images[0]?.src && (
                    <div className="h-40 overflow-hidden">
                      <img
                        src={product.images[0].src || ""}
                        alt={product.images[0].alt || "Produit Epitact"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                <div className="p-3">
                  <h3 className="text-sm font-medium text-gray-800 mb-1 line-clamp-2">
                    {getProductName(product.url)}
                  </h3>
                  <div className="flex justify-between items-center">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()} // Empêcher l'ouverture du modal
                    >
                      Voir le produit
                    </a>
                    <button
                      className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                      onClick={(e) => {
                        e.stopPropagation(); // Empêcher l'ouverture du modal
                        openShareModal(product);
                      }}
                    >
                      Partager
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de partage */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Partager ce produit</h3>
              <button
                onClick={closeShareModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mb-4 flex items-center">
              {selectedProduct.images &&
                selectedProduct.images.length > 0 &&
                selectedProduct.images[0]?.src && (
                  <img
                    src={selectedProduct.images[0].src || ""}
                    alt={selectedProduct.images[0].alt || "Produit Epitact"}
                    className="w-20 h-20 object-cover rounded mr-3"
                  />
                )}
              <div>
                <h4 className="font-medium">
                  {getProductName(selectedProduct.url)}
                </h4>
                <a
                  href={selectedProduct.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Voir le produit
                </a>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Partager via WhatsApp
              </label>
              <div className="flex">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Numéro de téléphone (optionnel)"
                  className="flex-grow p-2 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={shareViaWhatsApp}
                  className="px-4 py-2 bg-green-500 text-white rounded-r hover:bg-green-600"
                >
                  Envoyer
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Format: +33612345678 (sans espaces)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={copyLink}
                className="flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copier le lien
              </button>
              <button
                onClick={shareViaEmail}
                className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Envoyer par email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpitactAI;
