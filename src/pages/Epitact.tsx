import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { audioContext } from "../lib/utils/audio-context";
import VolMeterWorket from "../lib/worklets/vol-meter";

// Message d'accueil initial
const WELCOME_MESSAGE =
  "Bonjour et bienvenue sur le chatbot d'Epitact. Je vais vous poser quelques questions pour mieux comprendre vos besoins.";

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

interface VoiceInfo {
  id: string;
  name: string;
  api: string;
  voiceId: string;
}

const EpitactAI: React.FC = () => {
  const [step, setStep] = useState<number>(-1); // -1 représente l'écran d'accueil
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [message, setMessage] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [isFading, setIsFading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [questionnaireCompleted, setQuestionnaireCompleted] =
    useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);

  // États pour la reconnaissance vocale
  const [isListening, setIsListening] = useState<boolean>(false);
  //@ts-ignore
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [showInput, setShowInput] = useState<boolean>(false);
  const [isTTSPlaying, setIsTTSPlaying] = useState<boolean>(false);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [selectedVoice, setSelectedVoice] =
    useState<string>("fr-FR-DeniseNeural"); // Voix par défaut
  const [countdown, setCountdown] = useState<number | null>(null);

  // Ref pour indiquer si le TTS est en cours de lecture
  const isTTSAudioPlayingRef = useRef<boolean>(false);

  // Refs pour la détection vocale
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vuWorkletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef<boolean>(false);
  const recordingTimerRef = useRef<number | null>(null);
  const RECORDING_DURATION = 6000; // 10 secondes d'enregistrement

  // Voix disponibles
  const availableVoices: VoiceInfo[] = [
    {
      id: "d5c4211c-9584-4468-a090-86b872b82708",
      name: "Henry de Lesquin",
      api: "cartesia",
      voiceId: "d5c4211c-9584-4468-a090-86b872b82708",
    },
    {
      id: "8600d5ec-d29c-44fe-8457-7d730dbe8323",
      name: "Raël",
      api: "cartesia",
      voiceId: "8600d5ec-d29c-44fe-8457-7d730dbe8323",
    },
    {
      id: "d88eff4c-279d-472a-8ce6-9a805c88cb06",
      name: "Kevin (Alternatif)",
      api: "cartesia",
      voiceId: "d88eff4c-279d-472a-8ce6-9a805c88cb06",
    },
    {
      id: "0b1380da-611b-4d00-83f4-8a969a53e4e0",
      name: "helene",
      api: "cartesia",
      voiceId: "0b1380da-611b-4d00-83f4-8a969a53e4e0",
    },
    {
      id: "7d4f1bf2-696f-4f76-ba51-f804324c7cd2",
      name: "remi",
      api: "cartesia",
      voiceId: "7d4f1bf2-696f-4f76-ba51-f804324c7cd2",
    },
    {
      id: "fr-FR-DeniseNeural",
      name: "Nathalie",
      api: "azure",
      voiceId: "fr-FR-DeniseNeural",
    },
  ];

  // Effet pour commencer le processus après le clic sur démarrer
  useEffect(() => {
    if (hasStarted && step === -1) {
      speakText(WELCOME_MESSAGE, () => {
        // Passer à la première question après l'accueil
        setStep(0);
      });
    }
  }, [hasStarted]);

  // Effet pour lire la question à chaque étape (après l'accueil)
  useEffect(() => {
    if (hasStarted && step >= 0 && !questionnaireCompleted) {
      setShowInput(false);
      speakText(questions[step], () => {
        // Démarrer l'enregistrement après la lecture de la question
        startRecording();
      });
    }
  }, [step, questionnaireCompleted, hasStarted]);

  // Effet pour gérer la soumission du questionnaire
  useEffect(() => {
    if (questionnaireCompleted && answers.length === questions.length) {
      const formattedMessage: string = answers
        .map((q) => `${q.question} Réponse: ${q.answer}`)
        .join("\n");

      sendToAPI(formattedMessage);
    }
  }, [questionnaireCompleted, answers]);

  // Effet pour le compte à rebours
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [countdown]);

  // Fonction pour démarrer le chatbot
  const startChatbot = () => {
    setHasStarted(true);
  };

  // Fonction pour lire un texte
  const speakText = async (text: string, onEndCallback?: () => void) => {
    setIsTTSPlaying(true);
    isTTSAudioPlayingRef.current = true;

    try {
      // Trouver la voix sélectionnée dans la liste
      const selectedVoiceInfo = availableVoices.find(
        (voice) => voice.id === selectedVoice
      );

      if (!selectedVoiceInfo) {
        console.error("Voix non trouvée");
        isTTSAudioPlayingRef.current = false;
        setIsTTSPlaying(false);
        setShowInput(true);
        if (onEndCallback) onEndCallback();
        return;
      }

      let response;
      let audioBlob;

      // Utiliser l'API appropriée selon la voix sélectionnée
      if (selectedVoiceInfo.api === "cartesia") {
        // API Cartesia
        response = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "Cartesia-Version": "2024-06-10",
            "X-API-Key": import.meta.env.VITE_SYNTHESIA,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: "sonic-2",
            transcript: text,
            voice: {
              mode: "id",
              id: selectedVoiceInfo.voiceId,
            },
            output_format: {
              container: "mp3",
              bit_rate: 128000,
              sample_rate: 44100,
            },
            language: "fr",
          }),
        });
      } else if (selectedVoiceInfo.api === "azure") {
        // API Azure (Nathalie)
        response = await fetch(
          "https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: text,
              voice: selectedVoiceInfo.voiceId,
            }),
          }
        );
      } else {
        throw new Error("API non reconnue");
      }

      if (!response.ok) {
        throw new Error(
          `Échec de la génération de l'audio: ${response.status}`
        );
      }

      audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Ajouter l'URL à la liste des audios générés
      setAudioUrls((prev) => [...prev, audioUrl]);

      const audio = new Audio(audioUrl);

      audio.onended = () => {
        // Afficher l'input une fois que l'audio est terminé
        setShowInput(true);
        setIsTTSPlaying(false);
        isTTSAudioPlayingRef.current = false;

        if (onEndCallback) onEndCallback();

        // Libérer l'URL de l'objet pour éviter les fuites de mémoire
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error("Erreur lors de la lecture du TTS:", error);
      setIsTTSPlaying(false);
      isTTSAudioPlayingRef.current = false;
      setShowInput(true);
      if (onEndCallback) onEndCallback();
    }
  };

  // Fonction pour initialiser l'audio context et le flux du microphone
  const initAudioContext = async () => {
    if (audioContextRef.current) return; // Déjà initialisé

    try {
      audioContextRef.current = await audioContext({ sampleRate: 16000 });
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      sourceRef.current = audioContextRef.current.createMediaStreamSource(
        streamRef.current
      );

      const vuWorkletName = "speech-detector-vu-meter";
      await audioContextRef.current.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [`registerProcessor("${vuWorkletName}", ${VolMeterWorket})`],
            { type: "application/javascript" }
          )
        )
      );

      vuWorkletRef.current = new AudioWorkletNode(
        audioContextRef.current,
        vuWorkletName
      );

      sourceRef.current.connect(vuWorkletRef.current);

      vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
        const rawVolume = ev.data.volume;
        setVolume(rawVolume);
      };
    } catch (error) {
      console.error(
        "Erreur lors de l'initialisation du contexte audio:",
        error
      );
    }
  };

  // Commencer l'enregistrement
  const startRecording = async () => {
    // S'assurer que le contexte audio est initialisé
    await initAudioContext();

    if (!streamRef.current) {
      console.error("Flux audio non disponible");
      return;
    }

    try {
      audioChunksRef.current = [];
      const options = { mimeType: "audio/webm" };

      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        sendAudioForTranscription(audioBlob);
      };

      // Démarrer l'enregistrement
      mediaRecorderRef.current.start();
      isRecordingRef.current = true;
      setIsListening(true);
      setIsSpeaking(true);
      setCountdown(10); // Démarrer le compte à rebours de 10 secondes

      console.log("Enregistrement démarré (10 secondes)");

      // Arrêter l'enregistrement après 10 secondes
      recordingTimerRef.current = window.setTimeout(() => {
        stopRecording();
      }, RECORDING_DURATION);
    } catch (err) {
      console.error("Erreur lors du démarrage de l'enregistrement:", err);
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = () => {
    // Annuler le timer si présent
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setCountdown(null);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsListening(false);
      setIsSpeaking(false);
      console.log("Enregistrement arrêté");
    }
  };

  // Transcrire l'audio en texte
  const sendAudioForTranscription = async (audioBlob: Blob) => {
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("temperature", "0");
      formData.append("response_format", "json");
      formData.append("language", "fr");

      const response = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(
          `Erreur HTTP: ${response.status} - ${response.statusText}`
        );
      }

      const result = await response.json();

      if (result && result.text) {
        const transcriptionText = result.text.trim();
        if (
          transcriptionText.length > 3 &&
          !/^[.,;:!?…]+$/.test(transcriptionText)
        ) {
          setMessage(transcriptionText);

          // Passer automatiquement à la question suivante après un court délai
          setTimeout(() => {
            proceedToNextQuestion(transcriptionText);
          }, 1500);
        } else {
          // Si la transcription est vide ou invalide, on passe quand même à la question suivante
          setTimeout(() => {
            proceedToNextQuestion("Pas de réponse");
          }, 1000);
        }
      } else {
        // Si pas de transcription, on passe à la question suivante
        setTimeout(() => {
          proceedToNextQuestion("Pas de réponse");
        }, 1000);
      }
    } catch (error) {
      console.error("Erreur de transcription:", error);
      // En cas d'erreur, on passe à la question suivante
      setTimeout(() => {
        proceedToNextQuestion("Erreur de transcription");
      }, 1000);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Fonction pour passer à la question suivante
  const proceedToNextQuestion = (currentAnswer: string) => {
    setIsFading(true);

    setTimeout(() => {
      const newAnswers: Answer[] = [
        ...answers,
        { question: questions[step], answer: currentAnswer },
      ];

      setAnswers(newAnswers);
      setMessage("");
      setShowInput(false);

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
      const res = await axios.post(
        "https://epitact-backend-9d6c8658f12e.herokuapp.com/generate",
        {
          message: formattedMessage,
        }
      );

      console.log("Réponse API complète:", res.data);
      // Définir la réponse textuelle
      const recommendationText =
        res.data.recommendation || "Pas de réponse disponible.";
      setResponse(recommendationText);
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
      // Lire la réponse à haute voix
      setTimeout(() => {
        speakText(recommendationText.replace(/<[^>]*>/g, ""));
      }, 500);
    } catch (error) {
      console.error("Erreur API:", error);
      setResponse("Erreur lors de la communication avec le serveur.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour redémarrer le questionnaire
  const restart = (): void => {
    // Arrêter l'enregistrement si actif
    if (isRecordingRef.current) {
      stopRecording();
    }

    // Libérer les ressources audio
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current)
      streamRef.current.getTracks().forEach((track) => track.stop());

    // Réinitialiser les URLs audio
    audioUrls.forEach((url) => URL.revokeObjectURL(url));

    // Réinitialiser tous les états
    setHasStarted(false);
    setStep(-1); // Retour à l'écran d'accueil
    setAnswers([]);
    setMessage("");
    setResponse("");
    setProductInfo(null);
    setQuestionnaireCompleted(false);
    setIsLoading(false);
    setShowInput(false);
    setIsListening(false);
    setIsSpeaking(false);
    setIsTTSPlaying(false);
    setAudioUrls([]);
    setCountdown(null);

    // Réinitialiser les refs
    audioContextRef.current = null;
    sourceRef.current = null;
    vuWorkletRef.current = null;
    streamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    isRecordingRef.current = false;
    isTTSAudioPlayingRef.current = false;
  };

  return (
    <div className="flex flex-col items-center p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-blue-800 animate-slide-in-down">
        Assistant Epitact
      </h1>

      {!hasStarted ? (
        // Écran d'accueil avec bouton de démarrage
        <div className="w-full max-w-md flex flex-col items-center bg-white p-8 rounded-lg shadow-lg animate-fade-in">
          <img
            src="https://www.epitact.fr/wp-content/uploads/2020/06/logo-epitact-2020-sm.png"
            alt="Epitact Logo"
            className="w-48 mb-6"
          />

          <p className="text-lg text-gray-700 mb-8 text-center">
            Bienvenue sur l'assistant Epitact. Je vais vous aider à trouver les
            solutions adaptées à vos problèmes de pieds.
          </p>

          <div className="mb-6">
            <h3 className="text-md font-semibold mb-3 text-gray-700">
              Sélection de voix
            </h3>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              {availableVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={startChatbot}
            className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-full hover:bg-blue-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Commencer la consultation
          </button>

          <p className="mt-6 text-sm text-gray-500 text-center">
            Ce chatbot utilise votre microphone pour recueillir vos réponses.
            Assurez-vous que votre navigateur a accès au microphone.
          </p>
        </div>
      ) : !questionnaireCompleted ? (
        // Interface du questionnaire
        <div
          className={`flex flex-col items-center w-full max-w-md transition-opacity duration-300 ${
            isFading ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="mb-6 p-5 bg-white rounded-lg shadow-md w-full">
            <div className="flex items-center mb-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                {step === -1 ? "i" : step + 1}
              </div>
              <h2 className="text-lg font-semibold text-gray-800">
                {step === -1
                  ? "Introduction"
                  : `Question ${step + 1}/${questions.length}`}
              </h2>
              {isTTSPlaying && (
                <div className="ml-auto flex items-center space-x-1">
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "600ms" }}
                  ></div>
                </div>
              )}
            </div>

            <p className="text-gray-700 pb-2">
              {step === -1 ? WELCOME_MESSAGE : questions[step]}
            </p>
          </div>

          {showInput && step >= 0 && (
            <div className="w-full animate-fade-in mb-4">
              <div className="relative w-full bg-white p-4 rounded-lg shadow-md">
                <div className="font-medium text-gray-700 mb-2">
                  Votre réponse :
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={message}
                    className="p-3 border border-gray-300 rounded-md w-full focus:ring-2 focus:ring-blue-400 bg-gray-50"
                    placeholder="Votre réponse..."
                    readOnly={true}
                  />

                  {isListening && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center">
                      <div className="w-8 h-8 rounded-full bg-red-500 animate-pulse flex items-center justify-center text-white font-bold">
                        {countdown}
                      </div>
                    </div>
                  )}
                </div>

                {isListening && (
                  <div className="mt-3 bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-200"
                      style={{ width: `${Math.min(volume * 200, 100)}%` }}
                    ></div>
                  </div>
                )}

                {isTranscribing && (
                  <div className="mt-2 text-sm text-blue-600 animate-pulse font-medium">
                    Transcription en cours...
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="w-full bg-white p-4 rounded-lg shadow-md">
            <div className="text-sm text-gray-600 mb-2">
              Progression :{" "}
              {Math.floor(((step + 1) / (questions.length + 1)) * 100)}%
            </div>
            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-500"
                style={{
                  width: `${((step + 1) / (questions.length + 1)) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      ) : (
        // Résultats du questionnaire
        <div className="w-full max-w-2xl animate-fade-in">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white p-8 rounded-lg shadow-lg">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
              <p className="text-gray-700 text-lg">
                Analyse de vos réponses en cours...
              </p>
            </div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                <h2 className="text-2xl font-bold text-blue-800 mb-4">
                  Recommandation personnalisée
                </h2>
                {response && (
                  <div className="prose max-w-none text-gray-700">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: response
                          .replace(/\n\n/g, "<br/><br/>")
                          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                          .replace(/### (.*?):/g, "<h3>$1:</h3>"),
                      }}
                    ></div>
                  </div>
                )}
              </div>

              {productInfo && (
                <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
                  <div className="bg-blue-800 text-white p-4">
                    <h2 className="text-xl font-bold">Produit recommandé</h2>
                  </div>

                  <div className="flex flex-col md:flex-row p-4">
                    {productInfo.image_url && (
                      <div className="md:w-1/3 p-4">
                        <img
                          src={productInfo.image_url}
                          alt={productInfo.image_alt || productInfo.name}
                          className="w-full h-auto object-contain rounded-lg shadow-sm"
                        />
                      </div>
                    )}
                    <div className="md:w-2/3 p-4">
                      <h3 className="text-xl font-bold text-gray-800 mb-3">
                        {productInfo.name || "Produit recommandé"}
                      </h3>
                      <p className="text-gray-700 mb-6">
                        {productInfo.short_description ||
                          "Ce produit a été spécialement sélectionné pour répondre à vos besoins."}
                      </p>
                      {productInfo.url && (
                        <a
                          href={productInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-all duration-300 font-semibold shadow-md"
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
                className="w-full px-5 py-4 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all duration-300 font-semibold shadow-lg"
              >
                Recommencer la consultation
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
