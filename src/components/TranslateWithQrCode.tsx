import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, query, orderBy, serverTimestamp, Firestore } from "firebase/firestore";
import QRCode from "react-qr-code";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";

// Type pour les langues supportées
type SupportedLanguage = "fr" | "ja" | "zh" | "en" | null;

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

const SimpleChatApp: React.FC = () => {
  // États de base
  const [db, setDb] = useState<Firestore | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  //@ts-ignore
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [step, setStep] = useState<"init" | "language" | "chat">("init");
  const [userLanguage, setUserLanguage] = useState<SupportedLanguage>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  
  // Références pour l'enregistrement audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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
      measurementId: "G-NKX65TX5PH"
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
        streamRef.current.getTracks().forEach(track => track.stop());
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
        createdBy: userId
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
  const joinSession = async (database: Firestore, sid: string, uid: string): Promise<void> => {
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

  // Fonction pour définir la langue et terminer l'initialisation
  const setLanguageAndContinue = async (language: SupportedLanguage): Promise<void> => {
    if (!db || !sessionId || !language) return;
    
    try {
      // Ajouter l'utilisateur aux participants avec sa langue
      await setDoc(doc(db, "chat_sessions", sessionId, "participants", userId), {
        joinedAt: serverTimestamp(),
        isCreator: isCreator,
        language: language
      });
      
      setUserLanguage(language);
      setStep("chat");
      
      // Écouter les messages et participants
      listenToMessages(db, sessionId);
      listenToParticipants(db, sessionId);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la langue:", error);
      alert("Erreur lors de l'enregistrement des préférences. Veuillez réessayer.");
    }
  };

  // Écouter les messages
  const listenToMessages = (database: Firestore, sid: string): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute des messages pour la session:", sid);

    const messagesQuery = query(
      collection(database, "chat_sessions", sid, "messages"),
      orderBy("timestamp", "asc")
    );
    
    const unsubscribe = onSnapshot(messagesQuery, (querySnapshot) => {
      const messageList: Message[] = [];
      querySnapshot.forEach((doc) => {
        messageList.push({
          id: doc.id,
          ...doc.data()
        } as Message);
      });
      
      console.log("Messages reçus:", messageList.length);
      setMessages(messageList);
    }, (error) => {
      console.error("Erreur d'écoute des messages:", error);
    });
    
    return unsubscribe;
  };

  // Écouter les participants
  const listenToParticipants = (database: Firestore, sid: string): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute des participants pour la session:", sid);

    const participantsRef = collection(database, "chat_sessions", sid, "participants");
    
    const unsubscribe = onSnapshot(participantsRef, (querySnapshot) => {
      console.log("Participants mis à jour, nombre:", querySnapshot.size);
    }, (error) => {
      console.error("Erreur d'écoute des participants:", error);
    });
    
    return unsubscribe;
  };

  // Envoyer un message
  const sendMessage = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!db || !sessionId || !message.trim() || !userLanguage) return;

    try {
      console.log("Envoi du message:", message);
      await addDoc(collection(db, "chat_sessions", sessionId, "messages"), {
        text: message,
        sender: userId,
        timestamp: serverTimestamp(),
        clientTimestamp: Date.now(),
        language: userLanguage
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
    
    try {
      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
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
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Erreur d'accès au microphone:", err);
      alert("Impossible d'accéder au microphone. Vérifiez les permissions.");
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // Transcription audio avec Groq
  const transcribeAudio = async (audioBlob: Blob): Promise<void> => {
    if (!db || !sessionId || !userLanguage) return;
    
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");
      
      // Si connu, fournir la langue à Whisper
      if (userLanguage) {
        const langCode = userLanguage === "fr" ? "fr" : 
                        userLanguage === "ja" ? "ja" : 
                        userLanguage === "zh" ? "zh" : "en";
        formData.append("language", langCode);
      }
      
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`
        },
        body: formData
      });
      
      const result = await response.json() as TranscriptionResult;
      
      if (result.text) {
        // Envoi du message transcrit
        await addDoc(collection(db, "chat_sessions", sessionId, "messages"), {
          text: result.text,
          sender: userId,
          timestamp: serverTimestamp(),
          clientTimestamp: Date.now(),
          language: userLanguage
        });
      }
    } catch (error) {
      console.error("Erreur de transcription:", error);
      alert("Erreur lors de la transcription audio. Veuillez réessayer.");
    }
  };

  // Drapeaux pour les langues
  const languageFlags = {
    fr: "🇫🇷",
    ja: "🇯🇵",
    zh: "🇨🇳",
    en: "🇬🇧"
  };
  
  // Noms des langues
  // @ts-ignore
  const languageNames = {
    fr: "Français",
    ja: "Japonais",
    zh: "Chinois",
    en: "Anglais"
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
        <h1 className="text-xl font-bold text-center mb-4">Choisissez votre langue</h1>
        
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
    <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
      <h1 className="text-xl font-bold text-center mb-2">
        Chat Multilingue {userLanguage && languageFlags[userLanguage]}
      </h1>
      
      {isCreator && (
        <div className="text-center mb-4">
          <p className="mb-2">Partagez ce QR code pour inviter quelqu'un:</p>
          <div className="bg-white p-3 inline-block rounded-lg border">
            <QRCode
              value={`${window.location.origin}${window.location.pathname}?session=${sessionId}`}
              size={150}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">Session ID: {sessionId}</p>
        </div>
      )}
      
      <div className="h-64 border rounded-lg p-3 mb-4 overflow-y-auto bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-20">
            Aucun message. Commencez la conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-2 rounded-lg mb-2 ${
                msg.sender === userId
                  ? "bg-blue-100 ml-8 text-right"
                  : "bg-gray-100 mr-8"
              }`}
            >
              <p className="text-sm flex items-center">
                {msg.language && (
                  <span className="mr-2">{languageFlags[msg.language]}</span>
                )}
                <span className="break-words">{msg.text}</span>
              </p>
              <p className="text-xs text-gray-500">
                {new Date(msg.clientTimestamp || Date.now()).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>
      
      <div className="flex items-center mb-2">
        <button
          onClick={startRecording}
          className={`mr-2 p-2 rounded-full ${
            isRecording ? "bg-red-500 text-white" : "bg-gray-200"
          }`}
          title={isRecording ? "Arrêter l'enregistrement" : "Enregistrer un message vocal"}
        >
          {isRecording ? <BiMicrophoneOff size={20} /> : <FaMicrophone size={20} />}
        </button>
        
        <form onSubmit={sendMessage} className="flex-1 flex">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tapez votre message ici..."
            className="flex-1 p-2 border rounded-l-lg"
            disabled={isRecording}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white py-2 px-4 rounded-r-lg hover:bg-blue-600"
            disabled={!message.trim() || isRecording}
          >
            Envoyer
          </button>
        </form>
      </div>
      
      {isRecording && (
        <div className="p-2 bg-red-100 text-red-800 rounded-lg text-sm flex items-center">
          <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
          Enregistrement en cours... Cliquez sur le microphone pour terminer.
        </div>
      )}
    </div>
  );
};

export default SimpleChatApp;