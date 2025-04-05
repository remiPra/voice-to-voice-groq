import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, query, orderBy, serverTimestamp, Firestore } from "firebase/firestore";
import QRCode from "react-qr-code";

// Interface pour les messages
interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: any;
  clientTimestamp: number;
}

// Interface pour les participants
interface Participant {
  joinedAt: any;
  isCreator: boolean;
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
  const [step, setStep] = useState<"init" | "chat">("init"); // 'init', 'chat'

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
      }, 500); // Petit délai pour s'assurer que db est initialisé
    }
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
      
      // Ajouter l'utilisateur comme participant
      await setDoc(doc(db, "chat_sessions", newSessionId, "participants", userId), {
        joinedAt: serverTimestamp(),
        isCreator: true
      });
      
      setSessionId(newSessionId);
      setIsCreator(true);
      setIsConnected(true);
      setStep("chat");
      
      // Mettre à jour l'URL
      window.history.pushState({}, "", `?session=${newSessionId}`);
      
      // Écouter les messages
      listenToMessages(db, newSessionId);
      listenToParticipants(db, newSessionId);
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
        
        // Ajouter l'utilisateur aux participants
        await setDoc(doc(database, "chat_sessions", sid, "participants", uid), {
          joinedAt: serverTimestamp(),
          isCreator: false
        });
        
        console.log("Participant ajouté à la session");
        setSessionId(sid);
        setIsCreator(false);
        setIsConnected(true);
        setStep("chat");
        
        // Écouter les messages et participants
        listenToMessages(database, sid);
        listenToParticipants(database, sid);
      } else {
        console.error("Session introuvable:", sid);
        alert("Session introuvable. Vérifiez l'ID ou créez-en une nouvelle.");
      }
    } catch (error) {
      console.error("Erreur lors de la vérification de la session:", error);
      alert("Erreur lors de la connexion à la session. Veuillez réessayer.");
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
      
      // Vérifier si l'utilisateur actuel est le créateur
      querySnapshot.forEach((doc) => {
        const participantData = doc.data() as Participant;
        if (doc.id === userId && participantData.isCreator) {
          setIsCreator(true);
        }
      });
    }, (error) => {
      console.error("Erreur d'écoute des participants:", error);
    });
    
    return unsubscribe;
  };

  // Envoyer un message
  const sendMessage = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!db || !sessionId || !message.trim()) return;

    try {
      console.log("Envoi du message:", message);
      await addDoc(collection(db, "chat_sessions", sessionId, "messages"), {
        text: message,
        sender: userId,
        timestamp: serverTimestamp(),
        clientTimestamp: Date.now() // Pour le tri immédiat côté client
      });
      
      console.log("Message envoyé avec succès");
      setMessage("");
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      alert("Erreur lors de l'envoi du message. Veuillez réessayer.");
    }
  };

  // Affichage selon l'étape
  if (step === "init") {
    return (
      <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
        <h1 className="text-xl font-bold text-center mb-4">Chat Simple</h1>
        
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

  return (
    <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
      <h1 className="text-xl font-bold text-center mb-2">Chat en direct</h1>
      
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
              <p className="text-sm break-words">{msg.text}</p>
              <p className="text-xs text-gray-500">
                {new Date(msg.clientTimestamp || Date.now()).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>
      
      <form onSubmit={sendMessage} className="flex items-center">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tapez votre message ici..."
          className="flex-1 p-2 border rounded-l-lg"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white py-2 px-4 rounded-r-lg hover:bg-blue-600"
          disabled={!message.trim()}
        >
          Envoyer
        </button>
      </form>
    </div>
  );
};

export default SimpleChatApp;