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
import {
  FaMicrophone,
  FaSearch,
  FaRegSun,
  FaRegMoon,
  FaDownload,
  FaVolumeUp,
} from "react-icons/fa";
import {
  BiMicrophoneOff,
  BiMessageDetail,
  BiUser,
  BiCog,
  BiX,
  BiCheck,
  BiPause,
  BiChevronLeft,
  BiChevronRight,
  BiInfoCircle,
} from "react-icons/bi";
import { IoPinOutline, IoPinSharp } from "react-icons/io5";
import { motion, AnimatePresence } from "framer-motion";
import wavesurfer from "wavesurfer.js";

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
  isPinned?: boolean;
}

// Interface pour les participants
interface Participant {
  joinedAt: any;
  isCreator: boolean;
  language: SupportedLanguage;
  avatar?: string;
  isOnline?: boolean;
  lastActive?: any;
  displayName?: string;
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
  const [displayName, setDisplayName] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [messageTranslations, setMessageTranslations] = useState<{
    [key: string]: { [lang: string]: string };
  }>({});
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [step, setStep] = useState<
    "welcome" | "init" | "language" | "name" | "chat"
  >("welcome");
  const [userLanguage, setUserLanguage] = useState<SupportedLanguage>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [recordingUser, setRecordingUser] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [recordingInterval, setRecordingInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [showBilingualMessages, setShowBilingualMessages] =
    useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium"
  );
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [participants, setParticipants] = useState<{
    [key: string]: Participant;
  }>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [userAvatar, setUserAvatar] = useState<string>("");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSidebar, setShowSidebar] = useState<boolean>(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null
  );
  const [audioPreview, setAudioPreview] = useState<{
    blob: Blob | null;
    url: string | null;
  }>({
    blob: null,
    url: null,
  });
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  // Références pour l'enregistrement audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioWaveformRef = useRef<any>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  // Référence pour le défilement automatique
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialisation Firebase et userId
  useEffect(() => {
    // Vérifier les préférences utilisateur dans localStorage
    const storedDarkMode = localStorage.getItem("darkMode") === "true";
    const storedFontSize =
      (localStorage.getItem("fontSize") as "small" | "medium" | "large") ||
      "medium";
    const storedHighContrast = localStorage.getItem("highContrast") === "true";
    const storedBilingual = localStorage.getItem("bilingual") === "true";

    setDarkMode(storedDarkMode);
    setFontSize(storedFontSize);
    setHighContrast(storedHighContrast);
    setShowBilingualMessages(storedBilingual);

    // Appliquer le mode sombre si nécessaire
    if (storedDarkMode) {
      document.documentElement.classList.add("dark");
    }

    // Générer ou récupérer un ID utilisateur
    const storedUserId = localStorage.getItem("chatUserId");
    const storedName = localStorage.getItem("chatUserName") || "";
    const storedAvatar =
      localStorage.getItem("chatUserAvatar") || generateRandomAvatar();

    const newUserId = storedUserId || `user_${Date.now()}`;
    if (!storedUserId) {
      localStorage.setItem("chatUserId", newUserId);
    }

    setUserId(newUserId);
    setDisplayName(storedName);
    setUserAvatar(storedAvatar);

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
      if (recordingInterval) {
        clearInterval(recordingInterval);
      }
      if (audioWaveformRef.current) {
        audioWaveformRef.current.destroy();
      }
    };
  }, []);

  // Effet pour appliquer le mode sombre
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("darkMode", "false");
    }
  }, [darkMode]);

  // Effet pour sauvegarder les préférences utilisateur
  useEffect(() => {
    localStorage.setItem("fontSize", fontSize);
    localStorage.setItem("highContrast", highContrast.toString());
    localStorage.setItem("bilingual", showBilingualMessages.toString());
  }, [fontSize, highContrast, showBilingualMessages]);

  // Générer un avatar aléatoire
  const generateRandomAvatar = () => {
    const colors = ["FF5733", "33FF57", "3357FF", "F3FF33", "FF33F3", "33FFF3"];
    const randomIndex = Math.floor(Math.random() * colors.length);
    return `https://ui-avatars.com/api/?background=${
      colors[randomIndex]
    }&color=fff&name=${encodeURIComponent(displayName || "User")}`;
  };

  // Fonction pour créer une nouvelle session
  const createSession = async (): Promise<void> => {
    if (!db) return;
    console.log("Création d'une nouvelle session...");

    try {
      // Créer un document de session
      const sessionRef = await addDoc(collection(db, "chat_sessions"), {
        createdAt: serverTimestamp(),
        createdBy: userId,
        lastActivity: serverTimestamp(),
      });

      const newSessionId = sessionRef.id;
      console.log("Session créée:", newSessionId);

      setSessionId(newSessionId);
      setIsCreator(true);
      setIsConnected(true);
      setStep("language"); // Passer à la sélection de langue

      // Créer un document de paramètres pour la session
      await setDoc(
        doc(db, "chat_sessions", newSessionId, "settings", "general"),
        {
          createdAt: serverTimestamp(),
          allowPinning: true,
          maxParticipants: 10,
        }
      );

      // Mettre à jour l'URL
      window.history.pushState({}, "", `?session=${newSessionId}`);

      // Jouer un son de succès
      playSound("create");
    } catch (error) {
      console.error("Erreur lors de la création de la session:", error);
      showNotification(
        "Erreur lors de la création de la session. Veuillez réessayer.",
        "error"
      );
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

        // Vérifier si l'utilisateur a déjà une langue définie
        const userParticipantDoc = await getDoc(
          doc(database, "chat_sessions", sid, "participants", uid)
        );

        if (userParticipantDoc.exists() && userParticipantDoc.data().language) {
          // L'utilisateur a déjà rejoint cette session
          setUserLanguage(userParticipantDoc.data().language);
          setDisplayName(userParticipantDoc.data().displayName || displayName);
          setUserAvatar(userParticipantDoc.data().avatar || userAvatar);
          setStep("chat");

          // Écouter les messages et participants
          listenToMessages(database, sid);
          listenToParticipants(database, sid);
          listenToRecordingStatus(database, sid);
          listenToPinnedMessages(database, sid);
        } else {
          // Nouvelle participation, passer à la sélection de langue
          setStep("language");
        }

        // Jouer un son de succès
        playSound("join");
      } else {
        console.error("Session introuvable:", sid);
        showNotification(
          "Session introuvable. Vérifiez l'ID ou créez-en une nouvelle.",
          "error"
        );
      }
    } catch (error) {
      console.error("Erreur lors de la vérification de la session:", error);
      showNotification(
        "Erreur lors de la connexion à la session. Veuillez réessayer.",
        "error"
      );
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

  // Fonction pour définir la langue et continuer
  const setLanguageAndContinue = async (
    language: SupportedLanguage
  ): Promise<void> => {
    if (!db || !sessionId || !language) return;

    try {
      console.log("Définition de la langue utilisateur:", language);
      setUserLanguage(language);

      // Passer à l'étape de saisie du nom
      setStep("name");

      // Jouer un son de succès
      playSound("select");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la langue:", error);
      showNotification(
        "Erreur lors de l'enregistrement des préférences.",
        "error"
      );
    }
  };

  // Fonction pour définir le nom et terminer la configuration
  const setNameAndContinue = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!db || !sessionId || !userLanguage) return;

    const name =
      displayName.trim() || `User-${Math.floor(Math.random() * 1000)}`;
    try {
      // Sauvegarder le nom
      localStorage.setItem("chatUserName", name);
      setDisplayName(name);

      // Générer un avatar si pas encore défini
      const avatar = userAvatar || generateRandomAvatar();
      setUserAvatar(avatar);
      localStorage.setItem("chatUserAvatar", avatar);

      // Ajouter l'utilisateur aux participants avec sa langue et son nom
      await setDoc(
        doc(db, "chat_sessions", sessionId, "participants", userId),
        {
          joinedAt: serverTimestamp(),
          isCreator: isCreator,
          language: userLanguage,
          displayName: name,
          avatar: avatar,
          isOnline: true,
          lastActive: serverTimestamp(),
        }
      );

      // Important: passer à l'écran de chat après avoir défini la langue
      setStep("chat");

      // Écouter les messages et participants maintenant que la langue est définie
      listenToMessages(db, sessionId);
      listenToParticipants(db, sessionId);
      listenToRecordingStatus(db, sessionId);
      listenToPinnedMessages(db, sessionId);

      // Jouer un son de succès
      playSound("join");

      // Afficher le tutoriel pour les nouveaux utilisateurs
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du profil:", error);
      showNotification("Erreur lors de l'enregistrement du profil.", "error");
    }
  };

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
            isPinned: messageData.isPinned || false,
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

        // Mettre à jour les résultats de recherche si nécessaire
        if (searchQuery) {
          const filteredMessages = messageList.filter((msg) => {
            const msgText = msg.text.toLowerCase();
            const searchText = searchQuery.toLowerCase();
            return msgText.includes(searchText);
          });
          setSearchResults(filteredMessages);
        }

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

                  // Jouer un son de notification pour nouvelle traduction
                  playSound("translate");

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

  // Écouter les messages épinglés
  const listenToPinnedMessages = (
    database: Firestore,
    sid: string
  ): (() => void) => {
    if (!database || !sid) return () => {};
    console.log("Écoute des messages épinglés pour la session:", sid);

    const pinnedMessagesQuery = query(
      collection(database, "chat_sessions", sid, "pinnedMessages"),
      orderBy("pinnedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      pinnedMessagesQuery,
      (querySnapshot) => {
        const pinnedList: Message[] = [];

        querySnapshot.forEach((doc) => {
          const pinnedData = doc.data();

          if (pinnedData.messageId) {
            const messageDoc = messages.find(
              (msg) => msg.id === pinnedData.messageId
            );
            if (messageDoc) {
              pinnedList.push({
                ...messageDoc,
                isPinned: true,
              });
            }
          }
        });

        setPinnedMessages(pinnedList);
      },
      (error) => {
        console.error("Erreur d'écoute des messages épinglés:", error);
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
        displayName: null,
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

            // Jouer un son de notification
            playSound("recording");
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

        const participantsData: { [key: string]: Participant } = {};

        querySnapshot.forEach((doc) => {
          participantsData[doc.id] = doc.data() as Participant;
        });

        setParticipants(participantsData);
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
        senderName: displayName,
        senderAvatar: userAvatar,
      });

      console.log("Message envoyé avec succès");
      setMessage("");

      // Mettre à jour le timestamp de la dernière activité du participant
      await setDoc(
        doc(db, "chat_sessions", sessionId, "participants", userId),
        {
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      // Jouer un son d'envoi
      playSound("send");
    } catch (error) {
      console.error("Erreur lors de l'envoi du message:", error);
      showNotification(
        "Erreur lors de l'envoi du message. Veuillez réessayer.",
        "error"
      );
    }
  };

  // Épingler/Désépingler un message
  const togglePinMessage = async (messageId: string): Promise<void> => {
    if (!db || !sessionId) return;

    try {
      const message = messages.find((msg) => msg.id === messageId);
      if (!message) return;

      const pinnedRef = doc(
        db,
        "chat_sessions",
        sessionId,
        "pinnedMessages",
        messageId
      );
      const pinnedDoc = await getDoc(pinnedRef);

      if (pinnedDoc.exists()) {
        // Désépingler
        await setDoc(
          doc(db, "chat_sessions", sessionId, "messages", messageId),
          {
            isPinned: false,
          },
          { merge: true }
        );

        // Supprimer des messages épinglés
        await setDoc(
          pinnedRef,
          {
            active: false,
            unpinnedAt: serverTimestamp(),
            unpinnedBy: userId,
          },
          { merge: true }
        );

        playSound("unpin");
      } else {
        // Épingler
        await setDoc(
          doc(db, "chat_sessions", sessionId, "messages", messageId),
          {
            isPinned: true,
          },
          { merge: true }
        );

        // Ajouter aux messages épinglés
        await setDoc(pinnedRef, {
          messageId: messageId,
          pinnedAt: serverTimestamp(),
          pinnedBy: userId,
          active: true,
        });

        playSound("pin");
      }
    } catch (error) {
      console.error("Erreur lors du changement de statut d'épinglage:", error);
      showNotification("Erreur lors de l'épinglage du message.", "error");
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
      showNotification(
        "Un autre participant est en train d'enregistrer.",
        "warning"
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
            displayName: displayName,
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

      // Initialiser le waveform pour la visualisation audio
      if (waveformContainerRef.current) {
        if (audioWaveformRef.current) {
          audioWaveformRef.current.destroy();
        }

        audioWaveformRef.current = wavesurfer.create({
          container: waveformContainerRef.current,
          waveColor: darkMode ? "#99ccff" : "#3366ff",
          progressColor: darkMode ? "#3399ff" : "#0033cc",
          height: 40,
          cursorWidth: 1,
          cursorColor: "transparent",
          barWidth: 2,
          barGap: 1,
          responsive: true,
        });
      }

      // Analyser l'audio pour la visualisation
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(streamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      // Mettre à jour la visualisation audio
      const updateWaveform = () => {
        if (isRecording && audioWaveformRef.current) {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);

          // Convertir les données d'analyse en forme d'onde
          const waveformData = Array.from(dataArray).map((val) => val / 128);

          if (audioWaveformRef.current) {
            audioWaveformRef.current.loadDecodedBuffer({
              getChannelData: () => waveformData,
            });
          }

          requestAnimationFrame(updateWaveform);
        }
      };

      updateWaveform();

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 4. Modifiez la partie ondataavailable du mediaRecorder.onstop dans startRecording :
      mediaRecorderRef.current.onstop = async () => {
        // Réinitialiser le statut d'enregistrement
        if (db && sessionId) {
          await setDoc(
            doc(db, "chat_sessions", sessionId, "status", "recording"),
            {
              userId: null,
              startedAt: null,
              displayName: null,
            }
          );
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        // Au lieu de l'aperçu, envoyez directement à la transcription
        await transcribeAudio(audioBlob);

        // Arrêter le compteur
        if (recordingInterval) {
          clearInterval(recordingInterval);
          setRecordingInterval(null);
        }

        // Arrêter la visualisation
        if (audioWaveformRef.current) {
          audioWaveformRef.current.destroy();
          audioWaveformRef.current = null;
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      // Démarrer le compteur de temps
      setRecordingTime(0);
      const interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      setRecordingInterval(interval);

      // Jouer un son de début d'enregistrement
      playSound("recordStart");
    } catch (err) {
      console.error("Erreur d'accès au microphone:", err);
      showNotification(
        "Impossible d'accéder au microphone. Vérifiez les permissions.",
        "error"
      );

      // En cas d'erreur, réinitialiser le statut d'enregistrement
      if (db && sessionId) {
        await setDoc(
          doc(db, "chat_sessions", sessionId, "status", "recording"),
          {
            userId: null,
            startedAt: null,
            displayName: null,
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
        displayName: null,
      });
    }

    setIsRecording(false);

    // Jouer un son de fin d'enregistrement
    playSound("recordStop");
  };

  // Transcription audio avec Groq
  // Modifiez la fonction transcribeAudio ainsi :

  const transcribeAudio = async (audioBlob: Blob): Promise<void> => {
    if (!db || !sessionId || !userLanguage) return;
    setIsTranslating(true);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");

      // Si connu, fournir la langue à Whisper
      if (userLanguage) {
        const langCode =
          userLanguage === "fr"
            ? "fr"
            : userLanguage === "ja"
            ? "ja"
            : userLanguage === "zh"
            ? "zh"
            : "en";
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
        // Ajoutez un temps de pause pour permettre au FireStore de se synchroniser
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Envoi du message transcrit
        const docRef = await addDoc(
          collection(db, "chat_sessions", sessionId, "messages"),
          {
            text: result.text,
            sender: userId,
            timestamp: serverTimestamp(),
            clientTimestamp: Date.now(),
            language: userLanguage,
            senderName: displayName,
            senderAvatar: userAvatar,
            fromVoice: true,
          }
        );

        // Mettre à jour le message immédiatement après l'envoi
        // Cela force un rafraîchissement du composant et des traductions
        setMessages((prev) => [
          ...prev,
          {
            id: docRef.id,
            text: result.text,
            sender: userId,
            timestamp: null,
            clientTimestamp: Date.now(),
            language: userLanguage,
            senderName: displayName,
            senderAvatar: userAvatar,
            fromVoice: true,
          },
        ]);

        // Jouer un son de succès
        playSound("transcribe");
      }
    } catch (error) {
      console.error("Erreur de transcription:", error);
      showNotification(
        "Erreur lors de la transcription audio. Veuillez réessayer.",
        "error"
      );
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
      };

      console.log(`Préparation de la requête API Groq:`);
      console.log(`- Modèle: gemma2-9b-it`);
      console.log(
        `- Traduction: ${languageNames[sourceLang]} -> ${languageNames[targetLang]}`
      );

      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      console.log(`- Clé API disponible: ${apiKey ? "Oui" : "Non"}`);

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
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
            model: "gemma2-9b-it",
          }),
        }
      );

      console.log(`Statut de la réponse API: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erreur API:", errorText);
        throw new Error(`Erreur API: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as GroqResponse;
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

  // Fonction pour rechercher dans les messages
  const searchMessages = () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = messages.filter((msg) => {
      const msgText = msg.text.toLowerCase();
      const translation =
        messageTranslations[msg.id]?.[userLanguage as string]?.toLowerCase();

      return (
        msgText.includes(query) || (translation && translation.includes(query))
      );
    });

    setSearchResults(results);
    setShowSearchResults(true);

    // Focus sur les résultats de recherche
    if (searchInputRef.current) {
      searchInputRef.current.blur(); // Masquer le clavier mobile
    }
  };

  // Fonction pour exporter la conversation
  const exportConversation = () => {
    try {
      // Préparer les données d'export
      const exportData = {
        sessionId,
        exportDate: new Date().toISOString(),
        userLanguage,
        messages: messages.map((msg) => {
          const translation =
            msg.language !== userLanguage
              ? messageTranslations[msg.id]?.[userLanguage as string]
              : null;

          return {
            id: msg.id,
            text: msg.text,
            translation,
            sender: participants[msg.sender]?.displayName || msg.sender,
            language: msg.language,
            timestamp: new Date(msg.clientTimestamp).toISOString(),
          };
        }),
      };

      // Convertir en JSON et créer un Blob
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      // Créer un lien de téléchargement
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-${sessionId.substring(0, 8)}-${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();

      // Nettoyer
      URL.revokeObjectURL(url);
      showNotification("Conversation exportée avec succès!", "success");
    } catch (error) {
      console.error("Erreur lors de l'exportation:", error);
      showNotification(
        "Erreur lors de l'exportation de la conversation.",
        "error"
      );
    }
  };

  // Fonction pour jouer des sons de notification
  const playSound = (
    type:
      | "send"
      | "receive"
      | "translate"
      | "create"
      | "join"
      | "select"
      | "recordStart"
      | "recordStop"
      | "transcribe"
      | "pin"
      | "unpin"
      | "recording"
  ) => {
    const sounds = {
      send: new Audio("/sounds/message-sent.mp3"),
      receive: new Audio("/sounds/message-received.mp3"),
      translate: new Audio("/sounds/translation-complete.mp3"),
      create: new Audio("/sounds/session-created.mp3"),
      join: new Audio("/sounds/joined-session.mp3"),
      select: new Audio("/sounds/selection.mp3"),
      recordStart: new Audio("/sounds/record-start.mp3"),
      recordStop: new Audio("/sounds/record-stop.mp3"),
      transcribe: new Audio("/sounds/transcription-complete.mp3"),
      pin: new Audio("/sounds/pin.mp3"),
      unpin: new Audio("/sounds/unpin.mp3"),
      recording: new Audio("/sounds/someone-recording.mp3"),
    };

    try {
      // Ne jouer le son que si activé dans les préférences
      const soundsEnabled = localStorage.getItem("soundsEnabled") !== "false";
      if (soundsEnabled) {
        sounds[type].volume = 0.3;
        sounds[type]
          .play()
          .catch((err) => console.log("Erreur de lecture audio:", err));
      }
    } catch (error) {
      console.log("Erreur de lecture audio:", error);
    }
  };

  // Fonction pour afficher des notifications
  const showNotification = (
    message: string,
    type: "success" | "error" | "warning" | "info" = "info"
  ) => {
    // Implémenter votre propre système de notification ici
    // Pour les besoins de cet exemple, nous utiliserons des alertes simples
    const colors = {
      success: "#4CAF50",
      error: "#F44336",
      warning: "#FF9800",
      info: "#2196F3",
    };

    // Créer un élément de notification
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.position = "fixed";
    notification.style.bottom = "20px";
    notification.style.right = "20px";
    notification.style.padding = "12px 24px";
    notification.style.backgroundColor = colors[type];
    notification.style.color = "white";
    notification.style.borderRadius = "4px";
    notification.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";
    notification.style.zIndex = "1000";
    notification.style.opacity = "0";
    notification.style.transform = "translateY(20px)";
    notification.style.transition = "opacity 0.3s, transform 0.3s";

    // Ajouter au DOM
    document.body.appendChild(notification);

    // Animation d'entrée
    setTimeout(() => {
      notification.style.opacity = "1";
      notification.style.transform = "translateY(0)";
    }, 10);

    // Auto-fermeture après 3 secondes
    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transform = "translateY(20px)";

      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  };

  // Formater le temps d'enregistrement
  const formatRecordingTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Drapeaux pour les langues
  const languageFlags = {
    fr: "🇫🇷",
    ja: "🇯🇵",
    zh: "🇨🇳",
    en: "🇬🇧",
  };

  // Noms des langues
  const languageNames = {
    fr: "Français",
    ja: "Japonais",
    zh: "Chinois",
    en: "Anglais",
  };

  // Obtenir la couleur d'un message en fonction de l'expéditeur
  const getMessageColor = (senderId: string) => {
    if (senderId === userId) {
      return darkMode
        ? highContrast
          ? "bg-blue-800 text-white"
          : "bg-blue-700 text-white"
        : highContrast
        ? "bg-blue-600 text-white"
        : "bg-blue-100 text-blue-900";
    } else {
      return darkMode
        ? highContrast
          ? "bg-gray-800 text-white"
          : "bg-gray-700 text-white"
        : highContrast
        ? "bg-gray-600 text-white"
        : "bg-gray-100 text-gray-900";
    }
  };

  // Effet pour faire défiler vers le bas à chaque nouveau message
  useEffect(() => {
    if (messagesEndRef.current && !showSearchResults) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showSearchResults]);

  // Taille de police en fonction des préférences
  const getFontSizeClass = () => {
    switch (fontSize) {
      case "small":
        return "text-sm";
      case "large":
        return "text-lg";
      default:
        return "text-base";
    }
  };

  // Écran de bienvenue
  if (step === "welcome") {
    return (
      <div
        className={`w-full h-screen flex flex-col items-center justify-center p-4 ${
          darkMode
            ? "bg-gray-900 text-white"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 text-gray-800"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold mb-6">
            <span className="text-blue-500">Chat</span>
            <span className="text-indigo-500">Multilingue</span>
          </h1>

          <div className="flex justify-center mb-10">
            <div className="flex space-x-2 text-5xl">
              {Object.values(languageFlags).map((flag, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 * index, type: "spring" }}
                >
                  {flag}
                </motion.div>
              ))}
            </div>
          </div>

          <p className="mb-8 text-lg max-w-md mx-auto">
            Communiquez sans barrières linguistiques. Parlez ou écrivez dans
            votre langue, tout le monde comprendra.
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStep("init")}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200"
          >
            Commencer
          </motion.button>
        </motion.div>

        <div
          className={`absolute bottom-4 right-4 ${
            darkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-opacity-10 hover:bg-white"
          >
            {darkMode ? <FaRegSun size={20} /> : <FaRegMoon size={20} />}
          </button>
        </div>
      </div>
    );
  }

  // Écran de sélection initiale
  if (step === "init") {
    return (
      <div
        className={`w-full min-h-screen flex items-center justify-center p-4 ${
          darkMode
            ? "bg-gray-900 text-white"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 text-gray-800"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md p-6 rounded-xl shadow-xl bg-opacity-95 backdrop-blur-sm"
          style={{
            backgroundColor: darkMode
              ? "rgba(30, 41, 59, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
          }}
        >
          <h1 className="text-2xl font-bold text-center mb-6">
            <span className="text-blue-500">Chat</span>
            <span className={darkMode ? "text-indigo-400" : "text-indigo-600"}>
              Multilingue
            </span>
          </h1>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={createSession}
            className={`w-full py-3 px-4 rounded-lg mb-6 shadow-md flex items-center justify-center font-medium transition-all duration-200 ${
              darkMode
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-blue-500 hover:bg-blue-600 text-white"
            }`}
          >
            <BiMessageDetail size={20} className="mr-2" />
            Créer une nouvelle session
          </motion.button>

          <div className="relative flex items-center justify-center mb-6">
            <div
              className={`flex-grow h-px ${
                darkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            ></div>
            <span
              className={`px-3 text-sm ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              ou
            </span>
            <div
              className={`flex-grow h-px ${
                darkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            ></div>
          </div>

          <div
            className={`p-4 rounded-lg mb-4 ${
              darkMode ? "bg-gray-800" : "bg-white"
            } shadow-md`}
          >
            <p className="text-center mb-4 font-medium">
              Rejoindre une session existante
            </p>

            <div className="flex items-center mb-4">
              <input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="ID de session"
                className={`flex-1 p-3 rounded-l-lg border transition-all focus:outline-none focus:ring-2 ${
                  darkMode
                    ? "bg-gray-700 border-gray-600 text-white focus:ring-blue-500"
                    : "bg-gray-50 border-gray-300 text-gray-900 focus:ring-blue-500"
                }`}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => db && joinSession(db, sessionId, userId)}
                disabled={!sessionId}
                className={`bg-green-500 text-white py-3 px-4 rounded-r-lg ${
                  !sessionId
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-green-600"
                }`}
              >
                <BiChevronRight size={24} />
              </motion.button>
            </div>

            <p className="text-center text-sm text-gray-500">
              Scannez un QR code ou entrez manuellement l'ID
            </p>
          </div>

          <div className="text-center">
            <button
              onClick={() => setStep("welcome")}
              className={`text-sm ${
                darkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-500 hover:text-gray-700"
              } transition-colors`}
            >
              <BiChevronLeft className="inline mr-1" />
              Retour
            </button>
          </div>

          <div className="absolute top-4 right-4">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full ${
                darkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"
              } transition-colors`}
            >
              {darkMode ? <FaRegSun size={20} /> : <FaRegMoon size={20} />}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Écran de sélection de langue
  if (step === "language") {
    return (
      <div
        className={`w-full min-h-screen flex items-center justify-center p-4 ${
          darkMode
            ? "bg-gray-900 text-white"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 text-gray-800"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`w-full max-w-md p-6 rounded-xl shadow-xl ${
            darkMode ? "bg-gray-800 bg-opacity-95" : "bg-white bg-opacity-95"
          } backdrop-blur-sm`}
        >
          <h1 className="text-2xl font-bold text-center mb-6">
            Choisissez votre langue
          </h1>

          <p className="text-center mb-6 text-sm text-gray-500">
            Les messages seront traduits automatiquement vers cette langue
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { code: "fr", name: "Français", flag: "🇫🇷" },
              { code: "en", name: "Anglais", flag: "🇬🇧" },
              { code: "ja", name: "Japonais", flag: "🇯🇵" },
              { code: "zh", name: "Chinois", flag: "🇨🇳" },
            ].map((lang) => (
              <motion.button
                key={lang.code}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() =>
                  setLanguageAndContinue(lang.code as SupportedLanguage)
                }
                className={`flex flex-col items-center justify-center p-5 rounded-lg ${
                  darkMode
                    ? "bg-gray-700 hover:bg-gray-600 border border-gray-600"
                    : "bg-white hover:bg-blue-50 border border-gray-200 shadow-sm"
                } transition-all duration-200`}
              >
                <span className="text-5xl mb-3">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
              </motion.button>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={() => setStep("init")}
              className={`text-sm ${
                darkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-500 hover:text-gray-700"
              } transition-colors`}
            >
              <BiChevronLeft className="inline mr-1" />
              Retour
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Écran de saisie du nom
  if (step === "name") {
    return (
      <div
        className={`w-full min-h-screen flex items-center justify-center p-4 ${
          darkMode
            ? "bg-gray-900 text-white"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 text-gray-800"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`w-full max-w-md p-6 rounded-xl shadow-xl ${
            darkMode ? "bg-gray-800 bg-opacity-95" : "bg-white bg-opacity-95"
          } backdrop-blur-sm`}
        >
          <h1 className="text-2xl font-bold text-center mb-6">
            Comment souhaitez-vous vous présenter?
          </h1>

          <form onSubmit={setNameAndContinue} className="mb-6">
            <div className="flex flex-col items-center mb-6">
              <div className="relative mb-4 group">
                <img
                  src={userAvatar}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-4 border-blue-500 cursor-pointer"
                  onClick={() => setUserAvatar(generateRandomAvatar())}
                />
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all">
                  <span className="text-white opacity-0 group-hover:opacity-100 transition-all text-xs">
                    Changer
                  </span>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500 mb-4">
                Cliquez sur l'avatar pour en générer un nouveau
              </p>

              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Votre nom"
                className={`w-full p-3 rounded-lg border mb-6 transition-all focus:outline-none focus:ring-2 ${
                  darkMode
                    ? "bg-gray-700 border-gray-600 text-white focus:ring-blue-500"
                    : "bg-gray-50 border-gray-300 text-gray-900 focus:ring-blue-500"
                }`}
                maxLength={20}
              />

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                className={`w-full py-3 px-4 rounded-lg shadow-md font-medium transition-all duration-200 ${
                  darkMode
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
              >
                Continuer
              </motion.button>
            </div>
          </form>

          <div className="text-center">
            <button
              onClick={() => setStep("language")}
              className={`text-sm ${
                darkMode
                  ? "text-gray-400 hover:text-gray-300"
                  : "text-gray-500 hover:text-gray-700"
              } transition-colors`}
            >
              <BiChevronLeft className="inline mr-1" />
              Retour
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Écran de chat
  return (
    <div
      className={`flex flex-col h-screen ${
        darkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
      }`}
    >
      {/* En-tête avec le titre et boutons */}
      <header
        className={`p-3 ${
          darkMode ? "bg-gray-800" : "bg-white"
        } shadow-sm z-10 transition-all duration-300`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-lg font-bold">
              Chat Multilingue {userLanguage && languageFlags[userLanguage]}
            </h1>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-full ${
                darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
              } transition-colors`}
              aria-label="Paramètres"
            >
              <BiCog size={20} />
            </button>

            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-2 rounded-full ${
                darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
              } transition-colors`}
              aria-label="Info session"
            >
              <BiInfoCircle size={20} />
            </button>
          </div>
        </div>

        {/* Menu des paramètres */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-2 p-3 rounded-lg ${
                darkMode ? "bg-gray-700" : "bg-gray-100"
              } overflow-hidden`}
            >
              <h2 className="font-medium mb-2">Paramètres</h2>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Mode sombre</span>
                  <button
                    onClick={() => setDarkMode(!darkMode)}
                    className={`w-12 h-6 rounded-full ${
                      darkMode ? "bg-blue-600" : "bg-gray-300"
                    } relative transition-colors`}
                  >
                    <span
                      className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-transform ${
                        darkMode
                          ? "transform translate-x-6"
                          : "transform translate-x-0.5"
                      }`}
                    ></span>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span>Affichage bilingue</span>
                  <button
                    onClick={() =>
                      setShowBilingualMessages(!showBilingualMessages)
                    }
                    className={`w-12 h-6 rounded-full ${
                      showBilingualMessages ? "bg-blue-600" : "bg-gray-300"
                    } relative transition-colors`}
                  >
                    <span
                      className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-transform ${
                        showBilingualMessages
                          ? "transform translate-x-6"
                          : "transform translate-x-0.5"
                      }`}
                    ></span>
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span>Contraste élevé</span>
                  <button
                    onClick={() => setHighContrast(!highContrast)}
                    className={`w-12 h-6 rounded-full ${
                      highContrast ? "bg-blue-600" : "bg-gray-300"
                    } relative transition-colors`}
                  >
                    <span
                      className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-transform ${
                        highContrast
                          ? "transform translate-x-6"
                          : "transform translate-x-0.5"
                      }`}
                    ></span>
                  </button>
                </div>

                <div className="flex flex-col">
                  <span className="mb-1">Taille de texte</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setFontSize("small")}
                      className={`px-3 py-1 rounded ${
                        fontSize === "small"
                          ? darkMode
                            ? "bg-blue-600 text-white"
                            : "bg-blue-500 text-white"
                          : darkMode
                          ? "bg-gray-600"
                          : "bg-gray-200"
                      }`}
                    >
                      Petit
                    </button>
                    <button
                      onClick={() => setFontSize("medium")}
                      className={`px-3 py-1 rounded ${
                        fontSize === "medium"
                          ? darkMode
                            ? "bg-blue-600 text-white"
                            : "bg-blue-500 text-white"
                          : darkMode
                          ? "bg-gray-600"
                          : "bg-gray-200"
                      }`}
                    >
                      Moyen
                    </button>
                    <button
                      onClick={() => setFontSize("large")}
                      className={`px-3 py-1 rounded ${
                        fontSize === "large"
                          ? darkMode
                            ? "bg-blue-600 text-white"
                            : "bg-blue-500 text-white"
                          : darkMode
                          ? "bg-gray-600"
                          : "bg-gray-200"
                      }`}
                    >
                      Grand
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={exportConversation}
                    className={`w-full py-2 px-3 rounded flex items-center justify-center ${
                      darkMode
                        ? "bg-gray-600 hover:bg-gray-500"
                        : "bg-gray-200 hover:bg-gray-300"
                    } transition-colors`}
                  >
                    <FaDownload size={16} className="mr-2" />
                    Exporter la conversation
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Barre de recherche */}
        <div className={`mt-2 ${showSettings ? "block" : "hidden"}`}>
          <div
            className={`flex items-center ${
              darkMode ? "bg-gray-700" : "bg-gray-100"
            } rounded-lg overflow-hidden`}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans les messages..."
              className={`flex-1 p-2 ${
                darkMode
                  ? "bg-gray-700 text-white"
                  : "bg-gray-100 text-gray-900"
              } focus:outline-none`}
              ref={searchInputRef}
              onKeyDown={(e) => e.key === "Enter" && searchMessages()}
            />
            <button
              onClick={searchMessages}
              className={`p-2 ${
                darkMode ? "hover:bg-gray-600" : "hover:bg-gray-200"
              }`}
            >
              <FaSearch size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Panneau latéral avec QR code et infos de session */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 20 }}
            className={`fixed top-0 right-0 h-full w-80 z-40 shadow-xl overflow-auto ${
              darkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold">Informations de session</h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className={`p-2 rounded-full ${
                    darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
                  }`}
                >
                  <BiX size={24} />
                </button>
              </div>

              {isCreator && (
                <div
                  className={`mb-6 p-4 rounded-lg ${
                    darkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <h3 className="font-medium mb-2">Partagez ce QR code</h3>
                  <div className="bg-white p-3 rounded-lg mx-auto mb-3 w-full flex justify-center">
                    <QRCode
                      value={`${window.location.origin}${window.location.pathname}?session=${sessionId}`}
                      size={180}
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                      level="L"
                    />
                  </div>
                  <p className="text-sm text-center break-all">
                    Session ID:
                    <br />
                    {sessionId}
                  </p>
                </div>
              )}

              <div
                className={`mb-6 p-4 rounded-lg ${
                  darkMode ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <h3 className="font-medium mb-3">Participants</h3>
                <div className="space-y-3">
                  {Object.entries(participants).map(([id, participant]) => (
                    <div key={id} className="flex items-center">
                      <div className="relative">
                        <img
                          src={
                            participant.avatar ||
                            "https://ui-avatars.com/api/?name=User"
                          }
                          alt="Avatar"
                          className="w-8 h-8 rounded-full mr-3"
                        />
                        <div
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${
                            darkMode ? "border-gray-700" : "border-white"
                          } ${
                            id === recordingUser ? "bg-red-500" : "bg-green-500"
                          }`}
                        ></div>
                      </div>
                      <div>
                        <div className="flex items-center">
                          <span className="font-medium">
                            {participant.displayName || id.substring(0, 8)}
                          </span>
                          {participant.isCreator && (
                            <span
                              className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                                darkMode
                                  ? "bg-blue-700 text-blue-100"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center text-sm">
                          {participant.language &&
                            languageFlags[
                              participant.language as keyof typeof languageFlags
                            ]}
                          <span className="ml-1 text-xs text-gray-500">
                            {participant.language &&
                              languageNames[
                                participant.language as keyof typeof languageNames
                              ]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {pinnedMessages.length > 0 && (
                <div
                  className={`mb-6 p-4 rounded-lg ${
                    darkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <h3 className="font-medium mb-3 flex items-center">
                    <IoPinSharp className="mr-2" /> Messages épinglés
                  </h3>
                  <div className="space-y-3 max-h-60 overflow-auto">
                    {pinnedMessages.map((message) => {
                      const senderInfo = participants[message.sender];
                      const translation =
                        message.language !== userLanguage
                          ? messageTranslations[message.id]?.[
                              userLanguage as string
                            ]
                          : null;

                      return (
                        <div
                          key={message.id}
                          className={`p-2 rounded-lg text-sm ${
                            darkMode ? "bg-gray-600" : "bg-gray-200"
                          }`}
                        >
                          <div className="flex items-center mb-1">
                            <img
                              src={
                                senderInfo?.avatar ||
                                "https://ui-avatars.com/api/?name=User"
                              }
                              alt="Avatar"
                              className="w-5 h-5 rounded-full mr-2"
                            />
                            <span className="font-medium">
                              {senderInfo?.displayName ||
                                message.sender.substring(0, 8)}
                            </span>
                          </div>
                          <p>{translation || message.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-center text-sm text-gray-500">
                <p>Version 1.0</p>
                <button
                  onClick={() => setShowTutorial(true)}
                  className="text-blue-500 hover:underline mt-2"
                >
                  Voir le tutoriel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages épinglés (en haut de la zone de chat) */}
      {pinnedMessages.length > 0 && !showSearchResults && (
        <div
          className={`px-4 py-2 ${
            darkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          } border-b flex items-center`}
        >
          <div className="flex-shrink-0 mr-2">
            <IoPinSharp
              className={darkMode ? "text-blue-400" : "text-blue-500"}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="whitespace-nowrap overflow-x-auto scrollbar-hidden">
              {pinnedMessages.slice(0, 1).map((message) => {
                const senderInfo = participants[message.sender];
                const translation =
                  message.language !== userLanguage
                    ? messageTranslations[message.id]?.[userLanguage as string]
                    : null;

                return (
                  <div key={message.id} className="inline-block">
                    <span className="font-medium mr-1">
                      {senderInfo?.displayName ||
                        message.sender.substring(0, 8)}
                      :
                    </span>
                    <span>{translation || message.text}</span>
                  </div>
                );
              })}
              {pinnedMessages.length > 1 && (
                <span className="ml-2 text-sm text-gray-500">
                  +{pinnedMessages.length - 1} autres
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowSidebar(true)}
            className={`ml-2 p-1 rounded ${
              darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
            aria-label="Voir tous les messages épinglés"
          >
            <BiChevronRight />
          </button>
        </div>
      )}

      {/* Affichage des résultats de recherche */}
      {showSearchResults && (
        <div
          className={`p-4 ${darkMode ? "bg-gray-800" : "bg-white"} border-b ${
            darkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-medium">
              Résultats de recherche
              {searchResults.length > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  ({searchResults.length})
                </span>
              )}
            </h2>
            <button
              onClick={() => {
                setShowSearchResults(false);
                setSearchQuery("");
              }}
              className={`p-2 rounded-full ${
                darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
            >
              <BiX size={20} />
            </button>
          </div>

          {searchResults.length === 0 ? (
            <p
              className={`text-center py-4 ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Aucun résultat trouvé pour "{searchQuery}"
            </p>
          ) : (
            <div className="overflow-auto max-h-64">
              {searchResults.map((msg) => {
                const senderInfo = participants[msg.sender];
                const translation =
                  msg.language !== userLanguage
                    ? messageTranslations[msg.id]?.[userLanguage as string]
                    : null;

                return (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg mb-2 cursor-pointer ${
                      darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                    }`}
                    onClick={() => {
                      setSelectedMessageId(msg.id);
                      setShowSearchResults(false);
                      // Trouver l'élément du message et faire défiler vers lui
                      setTimeout(() => {
                        const element = document.getElementById(
                          `message-${msg.id}`
                        );
                        if (element) {
                          element.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          element.classList.add(
                            darkMode ? "bg-blue-900" : "bg-blue-100"
                          );
                          setTimeout(() => {
                            element.classList.remove(
                              darkMode ? "bg-blue-900" : "bg-blue-100"
                            );
                          }, 2000);
                        }
                      }, 100);
                    }}
                  >
                    <div className="flex items-center mb-1">
                      <img
                        src={
                          senderInfo?.avatar ||
                          "https://ui-avatars.com/api/?name=User"
                        }
                        alt="Avatar"
                        className="w-6 h-6 rounded-full mr-2"
                      />
                      <span className="font-medium">
                        {senderInfo?.displayName || msg.sender.substring(0, 8)}
                      </span>
                      {msg.language && (
                        <span className="ml-2 text-xs">
                          {languageFlags[msg.language]}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-500">
                        {new Date(
                          msg.clientTimestamp || Date.now()
                        ).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className={`${getFontSizeClass()}`}>
                      {highlightSearchTerms(
                        translation || msg.text,
                        searchQuery
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Zone de messages qui prend tout l'espace disponible */}
      <div className="flex-grow overflow-y-auto p-4">
        <div className="max-w-xl mx-auto">
          {messages.length === 0 ? (
            <div
              className={`text-center py-20 ${
                darkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              <BiMessageDetail size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Aucun message</p>
              <p className="text-sm">Commencez la conversation!</p>
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

              const senderInfo = participants[msg.sender];
              const isMyMessage = msg.sender === userId;
              const messageColor = getMessageColor(msg.sender);

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  id={`message-${msg.id}`}
                  key={msg.id}
                  className={`mb-4 ${
                    isMyMessage
                      ? "flex flex-col items-end"
                      : "flex flex-col items-start"
                  } transition-all`}
                >
                  <div
                    className={`max-w-[85%] ${
                      selectedMessageId === msg.id ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    {/* En-tête du message avec avatar et nom */}
                    <div
                      className={`flex items-center mb-1 ${
                        isMyMessage ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isMyMessage && (
                        <img
                          src={
                            senderInfo?.avatar ||
                            "https://ui-avatars.com/api/?name=User"
                          }
                          alt="Avatar"
                          className="w-6 h-6 rounded-full mr-2"
                        />
                      )}
                      <span className="text-sm font-medium">
                        {senderInfo?.displayName || msg.sender.substring(0, 8)}
                      </span>
                      {msg.language && (
                        <span className="ml-2 text-xs">
                          {languageFlags[msg.language]}
                        </span>
                      )}
                      {msg.fromVoice && (
                        <span className="ml-1">
                          <FaMicrophone size={12} className="text-gray-500" />
                        </span>
                      )}
                    </div>

                    {/* Contenu du message */}
                    <div className={`p-3 rounded-lg ${messageColor} shadow-sm`}>
                      <p className={`${getFontSizeClass()} break-words`}>
                        {displayText}

                        {/* Si on affiche les messages bilingues et que c'est un message traduit */}
                        {showBilingualMessages && isTranslated && (
                          <span
                            className={`block mt-2 pt-2 border-t ${
                              darkMode
                                ? "border-gray-600 text-gray-400"
                                : "border-gray-300 text-gray-600"
                            } text-sm italic`}
                          >
                            {msg.text}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Actions et timestamp */}
                    <div
                      className={`flex items-center mt-1 text-xs ${
                        isMyMessage ? "justify-end" : "justify-start"
                      } ${darkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      <span>
                        {new Date(
                          msg.clientTimestamp || Date.now()
                        ).toLocaleTimeString()}
                      </span>

                      {/* Indicateur de traduction */}
                      {isTranslated && !showBilingualMessages && (
                        <span className="ml-2 flex items-center">
                          <span className="w-2 h-2 bg-blue-500 rounded-full mr-1"></span>
                          Traduit
                        </span>
                      )}

                      {/* Bouton pour épingler/désépingler */}
                      <button
                        onClick={() => togglePinMessage(msg.id)}
                        className={`ml-2 p-1 rounded-full opacity-50 hover:opacity-100 ${
                          darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
                        }`}
                      >
                        {msg.isPinned ? (
                          <IoPinSharp size={14} />
                        ) : (
                          <IoPinOutline size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
          {/* Élément invisible pour le défilement automatique */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Afficher l'alerte lorsqu'un autre utilisateur est en train d'enregistrer */}
      <AnimatePresence>
        {recordingUser && recordingUser !== userId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full ${
              darkMode ? "bg-red-600" : "bg-red-500"
            } text-white font-medium shadow-lg flex items-center z-50`}
          >
            <div className="w-3 h-3 bg-white rounded-full mr-2 animate-pulse"></div>
            <span>
              {participants[recordingUser]?.displayName || "Un utilisateur"} est
              en train d'enregistrer...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barre de saisie fixée en bas */}
      <div
        className={`p-4 ${darkMode ? "bg-gray-800" : "bg-white"} border-t ${
          darkMode ? "border-gray-700" : "border-gray-200"
        } transition-all`}
      >
        <div className="max-w-xl mx-auto">
          {isRecording ? (
            <div
              className={`rounded-lg ${
                darkMode ? "bg-gray-700" : "bg-gray-100"
              } p-4 mb-2`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                  <span className="font-medium">Enregistrement en cours</span>
                </div>
                <span className="text-sm font-mono">
                  {formatRecordingTime(recordingTime)}
                </span>
              </div>

              {/* Visualisation de l'audio */}
              <div ref={waveformContainerRef} className="h-12 mb-2"></div>

              <div className="flex justify-center">
                <button
                  onClick={stopRecording}
                  className={`px-6 py-2 rounded-full ${
                    darkMode
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-red-500 hover:bg-red-600"
                  } text-white transition-colors flex items-center`}
                >
                  <BiPause size={18} className="mr-2" /> Terminer
                  l'enregistrement
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              <button
                onClick={startRecording}
                className={`mr-2 p-3 rounded-full ${
                  darkMode
                    ? recordingUser && recordingUser !== userId
                      ? "bg-gray-700 cursor-not-allowed"
                      : "bg-gray-700 hover:bg-gray-600"
                    : recordingUser && recordingUser !== userId
                    ? "bg-gray-200 cursor-not-allowed"
                    : "bg-gray-200 hover:bg-gray-300"
                } transition-colors flex-shrink-0`}
                title={
                  isRecording
                    ? "Arrêter l'enregistrement"
                    : "Enregistrer un message vocal"
                }
                disabled={
                  isTranslating || (recordingUser && recordingUser !== userId)
                }
              >
                <FaMicrophone
                  size={20}
                  className={
                    recordingUser && recordingUser !== userId
                      ? "text-gray-400"
                      : ""
                  }
                />
              </button>

              <form onSubmit={sendMessage} className="flex-1 flex">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    recordingUser && recordingUser !== userId
                      ? `${
                          participants[recordingUser]?.displayName ||
                          "Un participant"
                        } est en train d'enregistrer...`
                      : "Tapez votre message ici..."
                  }
                  className={`flex-1 p-3 rounded-l-lg border transition-all focus:outline-none focus:ring-2 ${
                    darkMode
                      ? "bg-gray-700 border-gray-600 text-white focus:ring-blue-500"
                      : "bg-gray-50 border-gray-300 text-gray-900 focus:ring-blue-500"
                  } ${getFontSizeClass()}`}
                  disabled={
                    isRecording ||
                    isTranslating ||
                    (recordingUser && recordingUser !== userId)
                  }
                />
                <button
                  type="submit"
                  className={`bg-blue-500 text-white py-3 px-6 rounded-r-lg transition-colors ${
                    !message.trim() ||
                    isRecording ||
                    isTranslating ||
                    (recordingUser && recordingUser !== userId)
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-blue-600"
                  }`}
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
          )}

          {/* Indicateur de traduction en cours */}
          <AnimatePresence>
            {isTranslating && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`mt-2 p-2 rounded-lg flex items-center ${
                  darkMode
                    ? "bg-blue-900 text-blue-100"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                <span className="text-sm">Traduction en cours...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// Fonction auxiliaire pour mettre en surbrillance les termes de recherche
const highlightSearchTerms = (text: string, searchQuery: string) => {
  if (!searchQuery.trim()) return text;

  const parts = text.split(new RegExp(`(${searchQuery})`, "gi"));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === searchQuery.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 text-black px-0.5 rounded">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export default SimpleChatApp;
