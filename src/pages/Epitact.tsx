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
  "Quelle partie du pied vous fait mal ? (avant-pied, talon, orteil, cheville...)",
  "Depuis combien de temps ressentez-vous cette douleur ?",
  "La douleur est-elle plus intense pendant certaines activités ? Lesquelles ?",
  "Avez-vous déjà consulté un médecin pour ce problème ?",
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
    if (url.includes("plantaire") || url.includes("metatars"))
      return "Douleurs plantaires";
    if (url.includes("cor") || url.includes("durillon"))
      return "Cors et durillons";
    if (
      url.includes("orteil") ||
      url.includes("marteau") ||
      url.includes("griffe")
    )
      return "Orteils";
    if (url.includes("sport")) return "Sport";
    if (url.includes("cheville")) return "Cheville";
    if (url.includes("talon") || url.includes("calcan")) return "Talon";
    return "Autre";
  };

  // Créer un contexte système enrichi avec les données des produits
  const createSystemPrompt = (): string => {
    // Extraire les informations essentielles des produits
    const productInfo = productsData
      .filter(
        (product: Product) =>
          product.tab_description && product.images && product.images.length > 0
      )
      .map((product: Product) => {
        const name = getProductName(product.url);
        const description = product.tab_description
          ? product.tab_description.substring(0, 200) + "..."
          : ""; // Limiter la longueur
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
Ta mission est d'analyser les réponses du patient aux 4 questions de diagnostic et de recommander les produits les plus adaptés.

Voici les réponses du patient aux questions de diagnostic:
1. Quelle partie du pied vous fait mal ? ${userResponses[0] || "Non précisé"}
2. Depuis combien de temps ressentez-vous cette douleur ? ${
      userResponses[1] || "Non précisé"
    }
3. La douleur est-elle plus intense pendant certaines activités ? ${
      userResponses[2] || "Non précisé"
    }
4. Avez-vous déjà consulté un médecin pour ce problème ? ${
      userResponses[3] || "Non précisé"
    }

Voici la base de données des produits Epitact que tu dois utiliser pour tes recommandations:

${productInfo}

Analyse ces informations et recommande 2 à 3 produits Epitact qui correspondent le mieux au problème du patient.
Explique brièvement pourquoi tu recommandes chaque produit.
Rappelle au patient que ces recommandations ne remplacent pas l'avis d'un médecin.`;
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

  // Fonction pour trouver les produits pertinents basée sur le texte de la réponse de l'IA
  const findRelevantProducts = (aiResponse: string): Product[] => {
    // Extraire les noms de produits mentionnés dans la réponse
    const productNames = productsData
      .map((product: Product) => getProductName(product.url))
      .filter((name: string) => name.length > 5); // Ignorer les noms trop courts

    // Chercher les mentions de produits dans la réponse
    const mentionedProducts: Product[] = [];
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

    // Si moins de 2 produits sont trouvés, ajouter des produits basés sur les mots-clés
    if (mentionedProducts.length < 2) {
      // Analyser les réponses de l'utilisateur pour trouver des mots-clés
      const userText = userResponses.join(" ").toLowerCase();

      // Mots-clés pour les différentes pathologies
      const keywords: Record<string, string[]> = {
        "hallux valgus": ["hallux", "oignon", "gros orteil"],
        "douleurs plantaires": [
          "plantaire",
          "avant-pied",
          "métatarsalgie",
          "durillon",
        ],
        cors: ["cor", "durillon", "callosité"],
        orteils: ["orteil", "marteau", "griffe"],
        sport: ["sport", "course", "ski", "tennis"],
        cheville: ["cheville", "malléole"],
        talon: ["talon", "épine", "aponévrosite"],
      };

      // Recherche des mots-clés dans les réponses
      let matchedCategories: string[] = [];
      for (const [category, terms] of Object.entries(keywords)) {
        if (terms.some((term) => userText.includes(term))) {
          matchedCategories.push(category);
        }
      }

      // Filtrer les produits correspondant aux catégories identifiées
      if (matchedCategories.length > 0) {
        const keywordProducts = productsData.filter((product: Product) => {
          return matchedCategories.some((category) => {
            if (category === "hallux valgus" && product.url.includes("hallux"))
              return true;
            if (
              category === "douleurs plantaires" &&
              (product.url.includes("plantaire") ||
                product.url.includes("metatars"))
            )
              return true;
            if (
              category === "cors" &&
              (product.url.includes("cor") || product.url.includes("durillon"))
            )
              return true;
            if (
              category === "orteils" &&
              (product.url.includes("orteil") ||
                product.url.includes("marteau") ||
                product.url.includes("griffe"))
            )
              return true;
            if (category === "sport" && product.url.includes("sport"))
              return true;
            if (category === "cheville" && product.url.includes("cheville"))
              return true;
            if (
              category === "talon" &&
              (product.url.includes("talon") || product.url.includes("calcan"))
            )
              return true;
            return false;
          });
        });

        // Ajouter les produits trouvés par mots-clés qui ne sont pas déjà dans la liste
        for (const product of keywordProducts) {
          if (
            !mentionedProducts.some((p) => p.url === product.url) &&
            product.images &&
            product.images.length > 0 &&
            product.images[0]?.src
          ) {
            mentionedProducts.push(product);
            if (mentionedProducts.length >= 4) break; // Limiter à 4 produits maximum
          }
        }
      }
    }

    return mentionedProducts.slice(0, 4); // Limiter à 4 produits maximum
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
            model: "gemma2-9b-it",
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

      // Ajouter la recommandation à la conversation
      const recommendationMessage: Message = {
        role: "assistant",
        content: aiResponse,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, recommendationMessage]);

      // Trouver les produits pertinents basés sur la réponse de l'IA
      const products = findRelevantProducts(aiResponse);
      setSuggestedProducts(products);
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
