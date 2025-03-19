import React, { useState, useEffect } from "react";
import axios from "axios";

const questions: string[] = [
  "Quelle est votre principale douleur ou problème aux pieds ?",
  "Depuis combien de temps ressentez-vous cette douleur ?",
  "Où ressentez-vous la douleur ? (Avant-pied, talon, plante, orteils…)",
  "Comment décririez-vous la douleur ? (Brûlure, pression, piqûre, engourdissement…)",
  "Quelle est l'intensité de la douleur sur une échelle de 1 à 10 ?",
  "Avez-vous des pathologies associées ? (Diabète, arthrose, etc.)",
];

interface Answer {
  question: string;
  answer: string;
}

interface ProductInfo {
  url?: string;
  name?: string;
  short_description?: string;
  image_url?: string;
  image_alt?: string;
}

const EpitactAI: React.FC = () => {
  const [step, setStep] = useState<number>(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [message, setMessage] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [questionnaireCompleted, setQuestionnaireCompleted] =
    useState<boolean>(false);

  // Effet pour gérer la soumission du questionnaire
  useEffect(() => {
    if (questionnaireCompleted && answers.length === questions.length) {
      const formattedMessage: string = answers
        .map((q) => `${q.question} Réponse: ${q.answer}`)
        .join("\n");

      sendToAPI(formattedMessage);
    }
  }, [questionnaireCompleted, answers]);

  const handleNext = (): void => {
    if (!message) return;

    setIsFading(true);

    setTimeout(() => {
      const newAnswers: Answer[] = [
        ...answers,
        { question: questions[step], answer: message },
      ];
      setAnswers(newAnswers);
      setMessage("");

      if (step + 1 < questions.length) {
        setStep(step + 1);
      } else {
        // Marquer le questionnaire comme terminé
        setQuestionnaireCompleted(true);
      }

      setIsFading(false);
    }, 300);
  };

  const sendToAPI = async (formattedMessage: string): Promise<void> => {
    setIsLoading(true);
    try {
      console.log("Envoi API en cours...");
      const res = await axios.post("http://127.0.0.1:5000/generate", {
        message: formattedMessage,
      });

      console.log("Réponse API complète:", res.data);

      // Définir la réponse textuelle
      setResponse(res.data.recommendation || "Pas de réponse disponible.");

      // Vérifier et définir les informations du produit
      if (res.data.product) {
        console.log("Informations produit trouvées:", res.data.product);
        setProductInfo(res.data.product);
      } else {
        console.log(
          "Aucune information produit dans la réponse, tentative d'extraction depuis le texte"
        );
        const urlMatch = /URL: (https:\/\/epitact\.fr\/[^\s\n]+)/g.exec(
          res.data.recommendation
        );
        if (urlMatch && urlMatch[1]) {
          setProductInfo({
            url: urlMatch[1],
            name: urlMatch[1]
              ? urlMatch[1].split("/").pop()
              : "Nom du produit non disponible"
                  .replace(/-/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase()),
            short_description: "Produit recommandé par notre expert",
          });
        }
      }
    } catch (error) {
      console.error("Erreur API:", error);
      setResponse("Erreur lors de la communication avec le serveur.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      handleNext();
    }
  };

  // Fonction pour redémarrer le questionnaire
  const restart = (): void => {
    setStep(0);
    setAnswers([]);
    setResponse("");
    setProductInfo(null);
    setQuestionnaireCompleted(false);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 animate-slide-in-down">
        Assistant Epitact
      </h1>

      {!questionnaireCompleted ? (
        <div
          className={`flex flex-col items-center w-full max-w-md transition-opacity duration-300 ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
        >
          <p className="mb-4 text-lg font-semibold">{questions[step]}</p>

          <input
            type="text"
            value={message}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setMessage(e.target.value)
            }
            onKeyPress={handleKeyPress}
            className="p-2 border border-gray-300 rounded-md w-80 focus:ring-2 focus:ring-blue-400 transition-transform duration-300 ease-in-out transform hover:scale-105"
            placeholder="Votre réponse..."
          />

          <button
            onClick={handleNext}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition-all duration-300 transform hover:scale-110"
          >
            Suivant
          </button>
        </div>
      ) : (
        <div className="w-full max-w-2xl animate-fade-in">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {response && (
                <div className="mt-4 p-5 bg-white shadow-md rounded-md">
                  <div
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: response
                        .replace(/\n\n/g, "<br/><br/>")
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/### (.*?):/g, "<h3>$1:</h3>"),
                    }}
                  ></div>
                </div>
              )}

              {productInfo && (
                <div className="mt-6 bg-white shadow-md rounded-md overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {productInfo.image_url && (
                      <div className="md:w-1/3 p-4">
                        <img
                          src={productInfo.image_url}
                          alt={productInfo.image_alt || productInfo.name}
                          className="w-full h-auto object-contain"
                        />
                      </div>
                    )}
                    <div className="p-5 md:w-2/3">
                      <h2 className="text-xl font-bold mb-2">
                        {productInfo.name || "Produit recommandé"}
                      </h2>
                      <p className="text-gray-700 mb-4">
                        {productInfo.short_description || ""}
                      </p>
                      {productInfo.url && (
                        <a
                          href={productInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-700 transition-all duration-300"
                        >
                          Voir le produit
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={restart}
                className="mt-6 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-700 transition-all duration-300 mx-auto block"
              >
                Recommencer
              </button>
            </>
          )}
        </div>
      )}

      {/* Animations CSS pour les transitions */}
      <style>{`
        @keyframes slide-in-down {
          0% {
            transform: translateY(-20px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        .animate-slide-in-down {
          animation: slide-in-down 0.5s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }
      `}</style>
    </div>
  );
};

export default EpitactAI;
