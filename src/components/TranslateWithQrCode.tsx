//@ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  Firestore,
} from "firebase/firestore";
import QRCode from "react-qr-code";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";


interface MistralResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}
// Type pour les langues supportées
// Type pour les langues supportées
type SupportedLanguage = "fr" | "ja" | "zh" | "en" | "es" | "ar" | null;
// Interface pour les messages
interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: any;
  clientTimestamp: number;
  language: SupportedLanguage;
}

// Interface pour les participants
//@ts-ignore
interface Participant {
  joinedAt: any;
  isCreator: boolean;
  language: SupportedLanguage;
}

// Interface pour les résultats de transcription
interface TranscriptionResult {
  text: string;
}

interface GroqResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

const SimpleChatApp: React.FC = () => {
  // États de base
  const [db, setDb] = useState<Firestore | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageTranslations, setMessageTranslations] = useState<{
    [key: string]: { [lang: string]: string };
  }>({});
  const [isCreator, setIsCreator] = useState<boolean>(false);
  //@ts-ignore
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [step, setStep] = useState<"init" | "language" | "chat">("init");
  const [userLanguage, setUserLanguage] = useState<SupportedLanguage>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  // Nouvel état pour suivre qui est en train d'enregistrer
  const [recordingUser, setRecordingUser] = useState<string | null>(null);

  // Références pour l'enregistrement audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Référence pour le défilement automatique
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialisation Firebase et userId
  useEffect(() => {
    // Générer ou récupérer un ID utilisateur
    const storedUserId = localStorage.getItem("chatUserId");
    const newUserId = storedUserId || `user_${Date.now()}`;
    if (!storedUserId) {
      localStorage.setItem("chatUserId", newUserId);
    }
    setUserId(newUserId);

    // Configurer Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyAA2qFckzsZ8lNVTrZvDmeQ-i1tmAphmio",
      authDomain: "translate-holiaday.firebaseapp.com",
      projectId: "translate-holiaday",
      storageBucket: "translate-holiaday.firebasestorage.app",
      messagingSenderId: "686646844992",
      appId: "1:686646844992:web:04c69fca0d86733f5609a5",
      measurementId: "G-NKX65TX5PH",
    };
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    setDb(firestore);

    // Vérifier s'il y a une session dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get("session");
    if (sessionParam) {
      console.log("Session ID trouvée dans l'URL:", sessionParam);
      setSessionId(sessionParam);
      setTimeout(() => {
        joinSession(firestore, sessionParam, newUserId);
      }, 500);
    }

    // Nettoyage de l'enregistrement audio à la fermeture
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Fonction pour créer une nouvelle session
  const createSession = async (): Promise<void> => {
    if (!db) return;
    console.log("Création d'une nouvelle session...");

    try {
      // Créer un document de session
      const sessionRef = await addDoc(collection(db, "chat_sessions"), {
        createdAt: serverTimestamp(),
        createdBy: userId,
      });

      const newSessionId = sessionRef.id;
      console.log("Session créée:", newSessionId);

      setSessionId(newSessionId);
      setIsCreator(true);
      setIsConnected(true);
      setStep("language"); // Passer à la sélection de langue

      // Mettre à jour l'URL
      window.history.pushState({}, "", `?session=${newSessionId}`);
    } catch (error) {
      console.error("Erreur lors de la création de la session:", error);
      alert("Erreur lors de la création de la session. Veuillez réessayer.");
    }
  };

  // Fonction pour rejoindre une session existante
  const joinSession = async (
    database: Firestore,
    sid: string,
    uid: string
  ): Promise<void> => {
    if (!database || !sid || !uid) return;
    console.log("Tentative de rejoindre la session:", sid);

    try {
      // Vérifier si la session existe
      const sessionDoc = await getDoc(doc(database, "chat_sessions", sid));

      if (sessionDoc.exists()) {
        console.log("Session trouvée:", sessionDoc.data());
        setSessionId(sid);
        setIsCreator(sessionDoc.data().createdBy === uid);
        setIsConnected(true);
        setStep("language"); // Passer à la sélection de langue
      } else {
        console.error("Session introuvable:", sid);
        alert("Session introuvable. Vérifiez l'ID ou créez-en une nouvelle.");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification de la session:", error);
      alert("Erreur lors de la connexion à la session. Veuillez réessayer.");
    }
  };

  // Effet pour relancer les traductions quand userLanguage change
  useEffect(() => {
    if (userLanguage && messages.length > 0) {
      console.log(
        "userLanguage a changé, relance des traductions:",
        userLanguage
      );

      // Parcourir tous les messages existants pour traduire ceux nécessaires
      const messagesToTranslate = messages.filter(
        (msg) =>
          msg.sender !== userId &&
          msg.language !== userLanguage &&
          (!messageTranslations[msg.id] ||
            !messageTranslations[msg.id][userLanguage])
      );

      console.log(
        "Messages à traduire après changement de langue:",
        messagesToTranslate.length
      );

      messagesToTranslate.forEach(async (msg) => {
        if (!msg.language) return;

        console.log(
          `Traduction suite au changement de langue (ID: ${msg.id}):`,
          {
            text: msg.text,
            from: msg.language,
            to: userLanguage,
          }
        );

        const translation = await translateText(
          msg.text,
          msg.language,
          userLanguage
        );

        if (translation) {
          setMessageTranslations((prev) => ({
            ...prev,
            [msg.id]: {
              ...(prev[msg.id] || {}),
              [userLanguage]: translation,
            },
          }));
        }
      });
    }
  }, [userLanguage, messages]);

  // Fonction pour définir la langue et terminer l'initialisation
  const setLanguageAndContinue = async (
    language: SupportedLanguage
  ): Promise<void> => {
    if (!db || !sessionId || !language) return;

    try {
      console.log("Définition de la langue utilisateur:", language);

      // Définir d'abord la langue
      setUserLanguage(language);

      // Ajouter l'utilisateur aux participants avec sa langue
      await setDoc(
        doc(db, "chat_sessions", sessionId, "participants", userId),
        {
          joinedAt: serverTimestamp(),
          isCreator: isCreator,
          language: language,
        }
      );

      // Important: passer à l'écran de chat après avoir défini la langue
      setStep("chat");

      // Écouter les messages et participants maintenant que la langue est définie
      listenToMessages(db, sessionId);
      listenToParticipants(db, sessionId);

      // Initialiser également l'écoute du statut d'enregistrement
      listenToRecordingStatus(db, sessionId);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la langue:", error);
      alert(
        "Erreur lors de l'enregistrement des préférences. Veuillez réessayer."
      );
    }
  };

  // État pour contrôler l'accordéon du QR code
  const [qrCodeExpanded, setQrCodeExpanded] = useState<boolean>(true);

  // Effet pour faire défiler vers le bas à chaque nouveau message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Écouter les messages
  const listenToMessages = (database: Firestore, sid: string): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute des messages pour la session:", sid);
    console.log("Langue de l'utilisateur actuel:", userLanguage);

    const messagesQuery = query(
      collection(database, "chat_sessions", sid, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (querySnapshot) => {
        console.log("=== Nouveaux messages reçus ===");
        const messageList: Message[] = [];
        const translationsToFetch: {
          messageId: string;
          text: string;
          sourceLang: SupportedLanguage;
          targetLang: SupportedLanguage;
        }[] = [];

        querySnapshot.forEach((doc) => {
          const messageData = doc.data();
          console.log(`Message reçu (ID: ${doc.id}):`, messageData);

          messageList.push({
            id: doc.id,
            ...messageData,
          } as Message);

          // Si le message est dans une langue différente de celle de l'utilisateur
          // et qu'on n'a pas encore de traduction, on ajoute à la file d'attente
          if (
            messageData.language !== userLanguage &&
            messageData.sender !== userId
          ) {
            const msgId = doc.id;
            console.log(`Message à traduire détecté (ID: ${msgId}):`);
            console.log(`- Langue source: ${messageData.language}`);
            console.log(`- Langue cible: ${userLanguage}`);
            console.log(`- Contenu: "${messageData.text}"`);

            // Vérifier si on a déjà cette traduction
            const existingTranslation =
              messageTranslations[msgId]?.[userLanguage as string];
            console.log(
              `- Traduction existante: ${
                existingTranslation ? `"${existingTranslation}"` : "aucune"
              }`
            );

            if (!existingTranslation) {
              console.log(`- Ajout à la file de traduction`);
              translationsToFetch.push({
                messageId: msgId,
                text: messageData.text,
                sourceLang: messageData.language as SupportedLanguage,
                targetLang: userLanguage as SupportedLanguage,
              });
            }
          }
        });

        console.log(`Total des messages: ${messageList.length}`);
        console.log(`Messages à traduire: ${translationsToFetch.length}`);
        setMessages(messageList);

        // Traiter les traductions en file d'attente immédiatement
        if (translationsToFetch.length > 0 && userLanguage) {
          console.log("=== Démarrage des traductions ===");

          translationsToFetch.forEach(
            async ({ messageId, text, sourceLang, targetLang }) => {
              if (!sourceLang || !targetLang) {
                console.log(
                  `Erreur: langue source ou cible manquante pour le message ${messageId}`
                );
                return;
              }

              console.log(`Traduction en cours pour message ${messageId}:`);
              console.log(`- De: ${sourceLang} (${text})`);
              console.log(`- Vers: ${targetLang}`);

              setIsTranslating(true);

              try {
                console.log("Appel API de traduction...");
                const translation = await translateText(
                  text,
                  sourceLang,
                  targetLang
                );
                console.log(`Réponse de l'API:`, translation);

                if (translation) {
                  console.log(`Traduction réussie: "${translation}"`);

                  // Mettre à jour immédiatement les traductions
                  setMessageTranslations((prev) => {
                    const newTranslations = {
                      ...prev,
                      [messageId]: {
                        ...(prev[messageId] || {}),
                        [targetLang]: translation,
                      },
                    };
                    console.log(
                      "État des traductions mis à jour:",
                      newTranslations
                    );
                    return newTranslations;
                  });
                } else {
                  console.log("La traduction a échoué ou est vide");
                }
              } catch (error) {
                console.error("Erreur pendant la traduction:", error);
              } finally {
                setIsTranslating(false);
              }
            }
          );
        }
      },
      (error) => {
        console.error("Erreur d'écoute des messages:", error);
      }
    );

    return unsubscribe;
  };

  // Écouter le statut d'enregistrement (qui est en train d'enregistrer)
  const listenToRecordingStatus = (
    database: Firestore,
    sid: string
  ): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute du statut d'enregistrement pour la session:", sid);

    // Créer le document de statut s'il n'existe pas
    setDoc(
      doc(database, "chat_sessions", sid, "status", "recording"),
      {
        userId: null,
        startedAt: null,
      },
      { merge: true }
    );

    // Écouter les changements du document de statut
    const recordingStatusRef = doc(
      database,
      "chat_sessions",
      sid,
      "status",
      "recording"
    );

    const unsubscribe = onSnapshot(
      recordingStatusRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          console.log("Statut d'enregistrement mis à jour:", data);

          if (data.userId && data.userId !== userId) {
            console.log(
              "Un autre utilisateur est en train d'enregistrer:",
              data.userId
            );
            setRecordingUser(data.userId);
          } else if (data.userId === userId) {
            console.log("Nous sommes en train d'enregistrer");
            setRecordingUser(userId);
          } else {
            console.log("Personne n'enregistre");
            setRecordingUser(null);
          }
        } else {
          console.log("Aucun statut d'enregistrement");
          setRecordingUser(null);
        }
      },
      (error) => {
        console.error("Erreur d'écoute du statut d'enregistrement:", error);
      }
    );

    return unsubscribe;
  };

  // Écouter les participants
  const listenToParticipants = (
    database: Firestore,
    sid: string
  ): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute des participants pour la session:", sid);

    const participantsRef = collection(
      database,
      "chat_sessions",
      sid,
      "participants"
    );

    const unsubscribe = onSnapshot(
      participantsRef,
      (querySnapshot) => {
        console.log("Participants mis à jour, nombre:", querySnapshot.size);
      },
      (error) => {
        console.error("Erreur d'écoute des participants:", error);
      }
    );

    return unsubscribe;
  };

  // Envoyer un message
  const sendMessage = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!db || !sessionId || !message.trim() || !userLanguage) return;

    try {
      console.log("Envoi du message:", message);
      await addDoc(collection(db, "chat_sessions", sessionId, "messages"), {
        text: message,
        sender: userId,
        timestamp: serverTimestamp(),
        clientTimestamp: Date.now(),
        language: userLanguage,
      });

      console.log("Message envoyé avec succès");
      setMessage("");
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      alert("Erreur lors de l'envoi du message. Veuillez réessayer.");
    }
  };

  // Démarrer l'enregistrement audio
  const startRecording = async (): Promise<void> => {
    if (isRecording) {
      stopRecording();
      return;
    }

    // Vérifier si quelqu'un d'autre est déjà en train d'enregistrer
    if (recordingUser && recordingUser !== userId) {
      console.log(
        "Impossible de commencer l'enregistrement: quelqu'un d'autre est déjà en train d'enregistrer"
      );
      return;
    }

    try {
      // Enregistrer dans Firebase que nous commençons à enregistrer
      if (db && sessionId) {
        await setDoc(
          doc(db, "chat_sessions", sessionId, "status", "recording"),
          {
            userId: userId,
            startedAt: serverTimestamp(),
          }
        );
      }

      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }

      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(streamRef.current);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // Réinitialiser le statut d'enregistrement
        if (db && sessionId) {
          await setDoc(
            doc(db, "chat_sessions", sessionId, "status", "recording"),
            {
              userId: null,
              startedAt: null,
            }
          );
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Erreur d'accès au microphone:", err);
      alert("Impossible d'accéder au microphone. Vérifiez les permissions.");

      // En cas d'erreur, réinitialiser le statut d'enregistrement
      if (db && sessionId) {
        await setDoc(
          doc(db, "chat_sessions", sessionId, "status", "recording"),
          {
            userId: null,
            startedAt: null,
          }
        );
      }
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = async (): Promise<void> => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Réinitialiser le statut d'enregistrement
    if (db && sessionId) {
      await setDoc(doc(db, "chat_sessions", sessionId, "status", "recording"), {
        userId: null,
        startedAt: null,
      });
    }

    setIsRecording(false);
  };

  // Transcription audio avec Groq
  const transcribeAudio = async (audioBlob: Blob): Promise<void> => {
    if (!db || !sessionId || !userLanguage) return;
    setIsTranslating(true);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");

      // Si connu, fournir la langue à Whisper
     // Si connu, fournir la langue à Whisper
if (userLanguage) {
  const langCode =
    userLanguage === "fr" ? "fr" :
    userLanguage === "ja" ? "ja" :
    userLanguage === "zh" ? "zh" :
    userLanguage === "es" ? "es" :
    userLanguage === "ar" ? "ar" : "en";
  formData.append("language", langCode);
}

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

      const result = (await response.json()) as TranscriptionResult;

      if (result.text) {
        // Envoi du message transcrit
        await addDoc(collection(db, "chat_sessions", sessionId, "messages"), {
          text: result.text,
          sender: userId,
          timestamp: serverTimestamp(),
          clientTimestamp: Date.now(),
          language: userLanguage,
        });
      }
    } catch (error) {
      console.error("Erreur de transcription:", error);
      alert("Erreur lors de la transcription audio. Veuillez réessayer.");
    } finally {
      setIsTranslating(false);
    }
  };

  // Traduction du texte
  const translateText = async (
    text: string,
    sourceLang: SupportedLanguage,
    targetLang: SupportedLanguage
  ): Promise<string | null> => {
    console.log(`=== Début de traduction ===`);
    console.log(`- Texte source: "${text}"`);
    console.log(`- De: ${sourceLang} vers ${targetLang}`);
  
    if (!text.trim()) {
      console.log("Texte vide, traduction annulée");
      return null;
    }
  
    if (sourceLang === targetLang) {
      console.log("Langues identiques, traduction inutile");
      return null;
    }
  
    if (!sourceLang || !targetLang) {
      console.log("Langue source ou cible non définie");
      return null;
    }
  
    try {
      // Préparation des noms des langues pour le prompt
      const languageNames = {
        fr: "français",
        ja: "japonais",
        zh: "chinois",
        en: "anglais",
        es: "espagnol",
        ar: "arabe",
      };
  
      console.log(`Préparation de la requête API Mistral:`);
      console.log(`- Modèle: mistral-small-latest`);
      console.log(
        `- Traduction: ${languageNames[sourceLang]} -> ${languageNames[targetLang]}`
      );
  
      const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;
      console.log(`- Clé API disponible: ${apiKey ? "Oui" : "Non"}`);
  
      const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `Tu es un traducteur professionnel. Traduis uniquement le texte suivant du ${languageNames[sourceLang]} vers le ${languageNames[targetLang]}. Ne fournis que la traduction, sans explications.`,
              },
              { role: "user", content: text },
            ],
            model: "mistral-small-latest",
            temperature: 0.3, // Température plus basse pour une traduction plus précise
            max_tokens: 1000,
          }),
        }
      );
  
      console.log(`Statut de la réponse API: ${response.status}`);
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur API:", errorText);
        throw new Error(`Erreur API: ${response.status} ${errorText}`);
      }
  
      const data = (await response.json()) as MistralResponse;
      console.log("Réponse API complète:", data);
  
      const translatedText = data.choices[0].message.content;
      console.log(`Traduction obtenue: "${translatedText}"`);
  
      return translatedText;
    } catch (error) {
      console.error(
        `Erreur de traduction (${sourceLang} -> ${targetLang}):`,
        error
      );
      return null;
    }
  };
  // Drapeaux pour les langues
const languageFlags = {
  fr: "🇫🇷",
  ja: "🇯🇵", 
  zh: "🇨🇳",
  en: "🇬🇧",
  es: "🇪🇸",
  ar: "🇸🇦",
};

// Noms des langues
const languageNames = {
  fr: "Français",
  ja: "Japonais",
  zh: "Chinois", 
  en: "Anglais",
  es: "Español",
  ar: "العربية",
};
// Fonction pour déterminer si une langue utilise RTL
const isRTLLanguage = (lang: SupportedLanguage): boolean => {
  return lang === "ar";
};

  // Écran de sélection initiale
  if (step === "init") {
    return (
      <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
        <h1 className="text-xl font-bold text-center mb-4">Chat Multilingue</h1>

        <button
          onClick={createSession}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg mb-4 hover:bg-blue-600"
        >
          Créer une nouvelle session
        </button>

        <div className="text-center text-sm text-gray-500 mb-4">ou</div>

        <div className="text-center mb-2">
          Si vous avez un QR code, scannez-le ou entrez l'ID manuellement:
        </div>

        <div className="flex items-center mb-4">
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="ID de session"
            className="flex-1 p-2 border rounded-l-lg"
          />
          <button
            onClick={() => db && joinSession(db, sessionId, userId)}
            className="bg-green-500 text-white py-2 px-4 rounded-r-lg hover:bg-green-600"
            disabled={!sessionId}
          >
            Rejoindre
          </button>
        </div>
      </div>
    );
  }

  // Écran de sélection de langue
  if (step === "language") {
    return (
      <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
        <h1 className="text-xl font-bold text-center mb-4">
          Choisissez votre langue
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <button
            onClick={() => setLanguageAndContinue("fr")}
            className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
          >
            <span className="text-4xl mb-2">🇫🇷</span>
            <span>Français</span>
          </button>

          <button
            onClick={() => setLanguageAndContinue("en")}
            className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
          >
            <span className="text-4xl mb-2">🇬🇧</span>
            <span>Anglais</span>
          </button>
          <button
    onClick={() => setLanguageAndContinue("es")}
    className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
  >
    <span className="text-4xl mb-2">🇪🇸</span>
    <span>Español</span>
  </button>

  <button
    onClick={() => setLanguageAndContinue("ar")}
    className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
  >
    <span className="text-4xl mb-2">🇸🇦</span>
    <span>العربية</span>
  </button>

          <button
            onClick={() => setLanguageAndContinue("ja")}
            className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
          >
            <span className="text-4xl mb-2">🇯🇵</span>
            <span>Japonais</span>
          </button>

          <button
            onClick={() => setLanguageAndContinue("zh")}
            className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-blue-50"
          >
            <span className="text-4xl mb-2">🇨🇳</span>
            <span>Chinois</span>
          </button>
        </div>
      </div>
    );
  }

  // Écran de chat
  return (
    <div className="flex flex-col h-screen">
      {/* En-tête avec le titre et le QR code */}
      <div className="p-4 bg-white border-b">
        <h1 className="text-xl font-bold text-center">
          Chat Multilingue {userLanguage && languageFlags[userLanguage]}
        </h1>

        {isCreator && (
          <div className="mt-2">
            <button
              onClick={() => setQrCodeExpanded(!qrCodeExpanded)}
              className="w-full flex items-center justify-between p-2 bg-gray-100 rounded-lg"
            >
              <span>Partagez ce QR code pour inviter quelqu'un</span>
              <span>{qrCodeExpanded ? "▲" : "▼"}</span>
            </button>

            {qrCodeExpanded && (
              <div className="text-center p-2 mt-2 bg-white border rounded-lg">
                <div className="bg-white p-3 inline-block">
                  <QRCode
                    value={`${window.location.origin}${window.location.pathname}?session=${sessionId}`}
                    size={150}
                  />
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Session ID: {sessionId}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zone de messages qui prend tout l'espace disponible */}
      <div className="flex-grow overflow-y-auto p-4">
        <div className="max-w-md mx-auto">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-20">
              Aucun message. Commencez la conversation!
            </div>
          ) : (
            messages.map((msg) => {
              // Déterminer le texte à afficher (original ou traduit)
              let displayText = msg.text;
              let isTranslated = false;

              // Si ce n'est pas notre message et qu'il est dans une autre langue, utiliser la traduction
              if (msg.sender !== userId && msg.language !== userLanguage) {
                const translatedText =
                  messageTranslations[msg.id]?.[userLanguage as string];
                if (translatedText) {
                  displayText = translatedText;
                  isTranslated = true;
                }
              }

              return (
                <div
  key={msg.id}
  className={`p-2 rounded-lg mb-2 ${
    msg.sender === userId
      ? "bg-blue-100 ml-8 text-right"
      : "bg-gray-100 mr-8"
  } ${isRTLLanguage(msg.language) ? "rtl" : ""}`}
  dir={isRTLLanguage(msg.language) ? "rtl" : "ltr"}
>
                  <p className="text-sm flex items-center">
                    {msg.language && (
                      <span className="mr-2">
                        {languageFlags[msg.language]}
                      </span>
                    )}
                    <span className="break-words">{displayText}</span>
                  </p>

                  {/* Si ce message a été traduit, afficher un indicateur */}
                  {isTranslated && (
                    <p className="text-xs text-gray-500 italic">
                      Traduit automatiquement
                    </p>
                  )}

                  <p className="text-xs text-gray-500">
                    {new Date(
                      msg.clientTimestamp || Date.now()
                    ).toLocaleTimeString()}
                  </p>
                </div>
              );
            })
          )}
          {/* Élément invisible pour le défilement automatique */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Afficher l'alerte rouge lorsqu'un autre utilisateur est en train d'enregistrer */}
      {recordingUser && recordingUser !== userId && (
        <div className="fixed top-0 left-0 text-5xl p-4 bg-red-500 text-white text-center font-bold animate-pulse">
          waiting please
        </div>
      )}

      {/* Barre de saisie fixée en bas */}
      <div className="p-4 bg-white border-t">
        <div className="max-w-md mx-auto">
          <div className="flex items-center">
            <button
              onClick={startRecording}
              className={`mr-2 p-2 rounded-full ${
                isRecording ? "bg-red-500 text-white" : "bg-gray-200"
              }`}
              title={
                isRecording
                  ? "Arrêter l'enregistrement"
                  : "Enregistrer un message vocal"
              }
              disabled={
                isTranslating || (recordingUser && recordingUser !== userId)
              }
            >
              {isRecording ? (
                <BiMicrophoneOff size={20} />
              ) : (
                <FaMicrophone size={20} />
              )}
            </button>

            <form onSubmit={sendMessage} className="flex-1 flex">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  recordingUser && recordingUser !== userId
                    ? "Attendez que l'autre participant termine..."
                    : "Tapez votre message ici..."
                }
                className="flex-1 p-2 border rounded-l-lg"
                disabled={
                  isRecording ||
                  isTranslating ||
                  (recordingUser && recordingUser !== userId)
                }
              />
              <button
                type="submit"
                className="bg-blue-500 text-white py-2 px-4 rounded-r-lg hover:bg-blue-600"
                disabled={
                  !message.trim() ||
                  isRecording ||
                  isTranslating ||
                  (recordingUser && recordingUser !== userId)
                }
              >
                Envoyer
              </button>
            </form>
          </div>

          {isRecording && (
            <div className="mt-2 p-2 bg-red-100 text-red-800 rounded-lg text-sm flex items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
              Enregistrement en cours... Cliquez sur le microphone pour
              terminer.
            </div>
          )}

          {isTranslating && (
            <div className="mt-2 p-2 bg-blue-100 text-blue-800 rounded-lg text-sm flex items-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
              Traduction en cours...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleChatApp;