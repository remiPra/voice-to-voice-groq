import React, { useState, useRef, useEffect } from "react";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";
import { MdTranslate } from "react-icons/md";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, Database } from "firebase/database";
import QRCode from "react-qr-code";

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

type SupportedLanguage = "fr" | "ja" | "zh";

interface Message {
  text: string;
  translations: {[key: string]: string};
  sender: string;
  timestamp: number;
  sourceLanguage: SupportedLanguage;
}

const TraducteurVacancesWithQrCode: React.FC = () => {
  // États Firebase et session
  const [sessionId, setSessionId] = useState<string>("");
  const [db, setDb] = useState<Database | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [userLanguage, setUserLanguage] = useState<SupportedLanguage | null>(null);
  const [partnerLanguage, setPartnerLanguage] = useState<SupportedLanguage | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showLanguageSelection, setShowLanguageSelection] = useState<boolean>(true);
  const [showSessionOptions, setShowSessionOptions] = useState<boolean>(false);

  // États de base pour l'enregistrement et la traduction
  const [inputText, setInputText] = useState<string>("");
  const [translations, setTranslations] = useState<{[key: string]: string}>({});
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingLanguage, setRecordingLanguage] = useState<SupportedLanguage | null>(null);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [detectedLanguage, setDetectedLanguage] = useState<SupportedLanguage | null>(null);

  // Références pour l'enregistrement audio
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Initialisation de Firebase et userId
  useEffect(() => {
    // Récupérer ou générer un ID utilisateur
    const storedUserId = localStorage.getItem('translatorUserId');
    const newUserId = storedUserId || `user_${Date.now()}`;
    
    if (!storedUserId) {
      localStorage.setItem('translatorUserId', newUserId);
    }
    
    setUserId(newUserId);
    
    // Vérifier si on rejoint une session existante via URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    
    if (sessionParam) {
      setSessionId(sessionParam);
      setShowLanguageSelection(true);
      setShowSessionOptions(false);
    }
    
    // Initialiser Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyAA2qFckzsZ8lNVTrZvDmeQ-i1tmAphmio",
        authDomain: "translate-holiaday.firebaseapp.com",
        projectId: "translate-holiaday",
        storageBucket: "translate-holiaday.firebasestorage.app",
        messagingSenderId: "686646844992",
        appId: "1:686646844992:web:04c69fca0d86733f5609a5",
        measurementId: "G-NKX65TX5PH",
        // Ajoutez cette ligne avec l'URL visible dans votre capture d'écran
        databaseURL: "https://translate-holiaday-default-rtdb.firebaseio.com"
    };    
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);
    setDb(database);
    
    return () => {
      // Nettoyer l'enregistrement audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fonction pour détecter la langue
  const detectLanguage = (text: string): SupportedLanguage => {
    // Détection simple pour le japonais (caractères japonais)
    const hasJapaneseChars = /[\u3040-\u309F]|[\u30A0-\u30FF]/.test(text);
    if (hasJapaneseChars) return "ja";
    
    // Détection pour le chinois (caractères chinois)
    const hasChineseChars = /[\u4e00-\u9fff]/.test(text);
    if (hasChineseChars) return "zh";
    
    // Par défaut, considérer que c'est du français
    return "fr";
  };

  // Création d'une nouvelle session
  const createNewSession = () => {
    if (!db || !userLanguage) return;
    
    const sessionsRef = ref(db, "sessions");
    const newSessionRef = push(sessionsRef);
    const newSessionId = newSessionRef.key;
    
    if (!newSessionId) return;
    
    // Initialiser la session avec le premier participant
    set(newSessionRef, {
      createdAt: Date.now(),
      participants: {
        [userId]: {
          joinedAt: Date.now(),
          language: userLanguage,
          isCreator: true
        }
      }
    });
    
    setSessionId(newSessionId);
    
    // Écouter les messages de cette session
    listenToSessionMessages(newSessionId);
    
    // Mettre à jour l'URL pour permettre le partage
    window.history.pushState({}, '', `?session=${newSessionId}`);
    setShowSessionOptions(false);
  };

  // Rejoindre une session existante
  const joinExistingSession = () => {
    if (!db || !sessionId || !userLanguage) return;
    
    const participantRef = ref(db, `sessions/${sessionId}/participants/${userId}`);
    
    set(participantRef, {
      joinedAt: Date.now(),
      language: userLanguage,
      isCreator: false
    });
    
    // Écouter les messages et les participants
    listenToSessionMessages(sessionId);
    listenToParticipants(sessionId);
  };

  // Écouter les messages d'une session
  const listenToSessionMessages = (sid: string) => {
    if (!db) return;
    
    const messagesRef = ref(db, `sessions/${sid}/messages`);
    
    onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messageList = Object.entries(data).map(([id, msg]) => ({
          id,
          ...(msg as any)
        }));
        
        // Trier par timestamp
        messageList.sort((a: any, b: any) => a.timestamp - b.timestamp);
        setMessages(messageList);
      }
    });
  };

  // Écouter les participants
  const listenToParticipants = (sid: string) => {
    if (!db) return;
    
    const participantsRef = ref(db, `sessions/${sid}/participants`);
    
    onValue(participantsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Trouver la langue de l'autre participant
        const otherParticipants = Object.entries(data)
          .filter(([id]) => id !== userId)
          .map(([, info]) => (info as any));
        
        if (otherParticipants.length > 0) {
          setPartnerLanguage(otherParticipants[0].language);
        }
      }
    });
  };

  // Envoyer un message dans la session
  const sendMessage = () => {
    if (!db || !sessionId || !inputText.trim() || !detectedLanguage) return;
    
    const messagesRef = ref(db, `sessions/${sessionId}/messages`);
    const newMessageRef = push(messagesRef);
    
    set(newMessageRef, {
      text: inputText,
      translations,
      sender: userId,
      timestamp: Date.now(),
      sourceLanguage: detectedLanguage
    });
    
    // Réinitialiser l'entrée
    setInputText("");
    setTranslations({});
  };

  // Toggle enregistrement
  const startRecording = async (language: SupportedLanguage): Promise<void> => {
    if (isRecording) {
      stopRecording();
      return;
    }
    
    // Démarrer l'enregistrement
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
        await transcribeAudio(audioBlob, recordingLanguage as SupportedLanguage);
      };
      
      setRecordingLanguage(language);
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Erreur d'accès au microphone:", err);
    }
  };

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingLanguage(null);
  };

  // Transcription audio
  const transcribeAudio = async (audioBlob: Blob, forcedLanguage?: SupportedLanguage): Promise<void> => {
    setIsTranslating(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("response_format", "json");
      
      // Si on connaît déjà la langue, on peut l'indiquer à Whisper
      if (forcedLanguage) {
        const langCode = forcedLanguage === "fr" ? "fr" : forcedLanguage === "ja" ? "ja" : "zh";
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
        setInputText(result.text);
        // Si la langue est forcée, on l'utilise, sinon on détecte
        const lang = forcedLanguage || detectLanguage(result.text);
        setDetectedLanguage(lang);
        await processTranslations(result.text, lang);
      }
    } catch (error) {
      console.error("Erreur de transcription:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  // Traitement des traductions selon la logique demandée
  const processTranslations = async (text: string, sourceLang: SupportedLanguage): Promise<void> => {
    setIsTranslating(true);
    setTranslations({});
    
    try {
      let translationsToMake = [];
      
      // Vérifier d'abord si nous sommes en session
      if (sessionId && partnerLanguage) {
        // Traduire vers la langue du partenaire
        translationsToMake.push({
          target: partnerLanguage,
          source: sourceLang
        });
      } else {
        // Logique par défaut (sans session)
        if (sourceLang === "ja") {
          // Si source japonaise, traduire en français ET en chinois
          translationsToMake = [
            { target: "fr", source: sourceLang },
            { target: "zh", source: sourceLang }
          ];
        } else {
          // Si source française ou chinoise, traduire en japonais
          translationsToMake = [
            { target: "ja", source: sourceLang }
          ];
        }
      }
      
      const newTranslations: {[key: string]: string} = {};
      
      // Effectuer toutes les traductions nécessaires
      await Promise.all(
        translationsToMake.map(async ({ source, target }) => {
          if (source === target) return;
          
          const translation = await translateText(text, source, target as SupportedLanguage);
          if (translation) {
            newTranslations[target] = translation;
          }
        })
      );
      
      setTranslations(newTranslations);
      
      // Si en session et traduction terminée, envoyer le message
      if (sessionId && Object.keys(newTranslations).length > 0) {
        // Préparation pour envoi automatique
        setDetectedLanguage(sourceLang);
      }
    } catch (error) {
      console.error("Erreur lors du traitement des traductions:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  // Traduction du texte
  const translateText = async (text: string, sourceLang: SupportedLanguage, targetLang: SupportedLanguage): Promise<string | null> => {
    if (!text.trim() || sourceLang === targetLang) return null;
    
    try {
      // Préparation des noms des langues pour le prompt
      const languageNames = {
        fr: "français",
        ja: "japonais",
        zh: "chinois"
      };
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `Tu es un traducteur professionnel. Traduis uniquement le texte suivant du ${languageNames[sourceLang]} vers le ${languageNames[targetLang]}. Ne fournis que la traduction, sans explications.`
            },
            { role: "user", content: text }
          ],
          model: "gemma2-9b-it"
        })
      });
      
      const data = await response.json() as GroqResponse;
      return data.choices[0].message.content;
    } catch (error) {
      console.error(`Erreur de traduction (${sourceLang} -> ${targetLang}):`, error);
      return null;
    }
  };

  // Gérer la soumission par touche Entrée
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      if (inputText.trim() && !isTranslating && !isRecording) {
        const lang = detectLanguage(inputText);
        setDetectedLanguage(lang);
        processTranslations(inputText, lang);
      }
    }
  };

  // Soumission du formulaire texte
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!inputText.trim() || isTranslating) return;
    
    const lang = detectLanguage(inputText);
    setDetectedLanguage(lang);
    await processTranslations(inputText, lang);
  };

  // Effet pour envoyer automatiquement le message après traduction
  useEffect(() => {
    if (sessionId && detectedLanguage && Object.keys(translations).length > 0 && !isTranslating) {
      sendMessage();
    }
  }, [translations, isTranslating]);

  // Noms des langues pour l'affichage
  const languageDisplay = {
    fr: { name: "Français", flag: "🇫🇷" },
    ja: { name: "Japonais", flag: "🇯🇵" },
    zh: { name: "Chinois", flag: "🇨🇳" }
  };

  // Sélectionner la langue
  const selectLanguage = (lang: SupportedLanguage) => {
    setUserLanguage(lang);
    setShowLanguageSelection(false);
    
    if (sessionId) {
      // Si on a déjà un ID de session, c'est qu'on rejoint une session existante
      setShowSessionOptions(false);
      joinExistingSession();
    } else {
      // Sinon, on montre les options pour créer ou rejoindre
      setShowSessionOptions(true);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
      <h1 className="text-xl md:text-2xl font-bold text-center mb-4 text-gray-800">
        Traducteur de Vacances
      </h1>
      
      {/* Sélection de langue */}
      {showLanguageSelection && (
        <div className="mb-4 p-4 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4 text-center">Choisissez votre langue</h2>
          
          <div className="grid grid-cols-1 gap-3 mb-4">
            <button 
              onClick={() => selectLanguage("fr")}
              className="p-3 border rounded-lg flex items-center hover:bg-blue-50"
            >
              <span className="text-2xl mr-3">🇫🇷</span>
              <span>Français</span>
            </button>
            
            <button 
              onClick={() => selectLanguage("ja")}
              className="p-3 border rounded-lg flex items-center hover:bg-blue-50"
            >
              <span className="text-2xl mr-3">🇯🇵</span>
              <span>Japonais</span>
            </button>
            
            <button 
              onClick={() => selectLanguage("zh")}
              className="p-3 border rounded-lg flex items-center hover:bg-blue-50"
            >
              <span className="text-2xl mr-3">🇨🇳</span>
              <span>Chinois</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Options de session (créer ou rejoindre) */}
      {showSessionOptions && (
        <div className="mb-4 p-4 bg-white rounded-lg shadow-md">
          <h3 className="font-medium mb-3 text-center">
            Vous parlerez en {userLanguage && languageDisplay[userLanguage].flag} {userLanguage && languageDisplay[userLanguage].name}
          </h3>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={createNewSession}
              className="bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700"
            >
              Créer une nouvelle conversation
            </button>
            
            <div className="relative text-center my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <span className="relative px-3 bg-white text-sm text-gray-500">ou</span>
            </div>
            
            <div className="p-3 border border-dashed rounded-lg">
              <p className="text-sm text-center mb-2">Entrez l'ID de session pour rejoindre</p>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="flex-1 p-2 border rounded"
                  placeholder="ID de session"
                />
                <button
                  onClick={joinExistingSession}
                  disabled={!sessionId.trim()}
                  className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Rejoindre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* QR Code pour rejoindre la session */}
      {sessionId && userLanguage && !showLanguageSelection && !showSessionOptions && (
        <div className="text-center mb-4">
          <h3 className="text-lg font-semibold mb-2">Partagez ce QR code</h3>
          <div className="bg-white p-3 inline-block rounded-lg">
            <QRCode
              value={`${window.location.origin}${window.location.pathname}?session=${sessionId}`}
              size={150}
            />
          </div>
          <p className="mt-2 text-sm text-gray-600">Session ID: {sessionId}</p>
        </div>
      )}
      
      {/* Affichage des messages */}
      {sessionId && messages.length > 0 && (
        <div className="mb-16 space-y-3">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`p-3 rounded-lg ${msg.sender === userId ? 'ml-8 bg-blue-100' : 'mr-8 bg-gray-100'}`}
            >
              <p className="text-xs text-gray-500 mb-1">
                {msg.sender === userId ? "Vous" : "Interlocuteur"} • {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
              <p className="font-medium">{msg.text}</p>
              
              {/* Afficher seulement la traduction pertinente pour l'utilisateur */}
              {userLanguage && msg.sender !== userId && msg.sourceLanguage !== userLanguage && msg.translations[userLanguage] && (
                <div className="mt-2 p-2 bg-white rounded border">
                  <p className="text-xs text-gray-500 mb-1">
                    {languageDisplay[userLanguage].flag} {languageDisplay[userLanguage].name}
                  </p>
                  <p>{msg.translations[userLanguage]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Résultats des traductions (hors session) */}
      {!sessionId && Object.keys(translations).length > 0 && (
        <div className="space-y-4 mb-4">
          {Object.entries(translations).map(([lang, text]) => (
            <div key={lang} className="mb-4">
              <h2 className="font-medium text-gray-800 mb-2 flex items-center">
                <MdTranslate className="mr-1" />
                Traduction en {languageDisplay[lang as SupportedLanguage].flag} {languageDisplay[lang as SupportedLanguage].name}:
              </h2>
              <div className={`p-3 border rounded-lg ${
                lang === 'ja' ? 'bg-green-50 border-green-200' :
                lang === 'fr' ? 'bg-blue-50 border-blue-200' : 
                'bg-purple-50 border-purple-200'
              }`}>
                <p className="whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Barre de saisie (si l'utilisateur a déjà choisi sa langue) */}
      {userLanguage && !showLanguageSelection && !showSessionOptions && (
        <div className="bottom-0 left-0 right-0 w-full fixed z-5 bg-white border-t border-gray-200 p-2">
          <form onSubmit={handleSubmit}>
            <div className="mb-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                rows={2}
                placeholder="Entrez du texte à traduire..."
                disabled={isTranslating || isRecording}
              />
              
              {detectedLanguage && (
                <div className="mt-1 text-sm text-gray-500">
                  Langue détectée: {languageDisplay[detectedLanguage].flag} {languageDisplay[detectedLanguage].name}
                </div>
              )}
            </div>
            
            {/* Boutons d'action */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => startRecording("fr")}
                disabled={isTranslating || (isRecording && recordingLanguage !== "fr")}
                className={`flex items-center justify-center py-2 px-2 rounded-lg
                  text-white font-medium text-sm transition-all
                  ${isRecording && recordingLanguage === "fr"
                    ? "bg-red-500 hover:bg-red-600" 
                    : "bg-blue-600 hover:bg-blue-700"} 
                  ${(isTranslating || (isRecording && recordingLanguage !== "fr")) ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {isRecording && recordingLanguage === "fr" 
                  ? <><BiMicrophoneOff className="mr-1" /> 🇫🇷</> 
                  : <><FaMicrophone className="mr-1" /> 🇫🇷</>
                }
              </button>
              
              <button
                type="button"
                onClick={() => startRecording("ja")}
                disabled={isTranslating || (isRecording && recordingLanguage !== "ja")}
                className={`flex items-center justify-center py-2 px-2 rounded-lg text-white font-medium text-sm transition-all
                  ${isRecording && recordingLanguage === "ja"
                    ? "bg-red-500 hover:bg-red-600" 
                    : "bg-green-600 hover:bg-green-700"} 
                  ${(isTranslating || (isRecording && recordingLanguage !== "ja")) ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {isRecording && recordingLanguage === "ja" 
                  ? <><BiMicrophoneOff className="mr-1" /> 🇯🇵</> 
                  : <><FaMicrophone className="mr-1" /> 🇯🇵</>
                }
              </button>
              
              <button
                type="button"
                onClick={() => startRecording("zh")}
                disabled={isTranslating || (isRecording && recordingLanguage !== "zh")}
                className={`flex items-center justify-center py-2 px-2 rounded-lg text-white font-medium text-sm transition-all
                  ${isRecording && recordingLanguage === "zh"
                    ? "bg-red-500 hover:bg-red-600" 
                    : "bg-purple-600 hover:bg-purple-700"} 
                  ${(isTranslating || (isRecording && recordingLanguage !== "zh")) ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {isRecording && recordingLanguage === "zh" 
                  ? <><BiMicrophoneOff className="mr-1" /> 🇨🇳</> 
                  : <><FaMicrophone className="mr-1" /> 🇨🇳</>
                }
              </button>
            </div>
          </form>
          
          {/* Indicateurs d'état */}
          {isRecording && recordingLanguage && (
            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-lg flex items-center">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse mr-2"></div>
              <p className="text-red-700 text-sm">
                Enregistrement en cours ({languageDisplay[recordingLanguage].name})...
              </p>
            </div>
          )}
          
          {isTranslating && (
            <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded-lg flex items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse mr-2"></div>
              <p className="text-blue-700 text-sm">
                Traduction en cours...
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* Pied de page */}
      <div className="text-xs text-center text-gray-500 mt-4">
        Parfait pour vos vacances au Japon en famille
      </div>
    </div>
  );
};

export default TraducteurVacancesWithQrCode;