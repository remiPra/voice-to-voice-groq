import React, { useState, useRef, useEffect } from "react";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";
import { MdTranslate } from "react-icons/md";

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

const TraducteurVacances: React.FC = () => {
  // États de base
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
      if (sourceLang === "ja") {
        // Si source japonaise, traduire en français ET en chinois
        const [frTranslation, zhTranslation] = await Promise.all([
          translateText(text, sourceLang, "fr"),
          translateText(text, sourceLang, "zh")
        ]);
        
        setTranslations({
          fr: frTranslation || "Erreur de traduction",
          zh: zhTranslation || "Erreur de traduction"
        });
      } else {
        // Si source française ou chinoise, traduire en japonais
        const jaTranslation = await translateText(text, sourceLang, "ja");
        setTranslations({
          ja: jaTranslation || "Erreur de traduction"
        });
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

  // Soumission du formulaire texte
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!inputText.trim() || isTranslating) return;
    
    const lang = detectLanguage(inputText);
    setDetectedLanguage(lang);
    await processTranslations(inputText, lang);
  };

  // Nettoyage à la fermeture du composant
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Noms des langues pour l'affichage
  const languageDisplay = {
    fr: { name: "Français", flag: "🇫🇷" },
    ja: { name: "Japonais", flag: "🇯🇵" },
    zh: { name: "Chinois", flag: "🇨🇳" }
  };

  return (
    <div className="w-full max-w-md mx-auto my-4 p-4 bg-white rounded-lg shadow-lg">
      <h1 className="text-xl md:text-2xl font-bold text-center mb-4 text-gray-800">
        Traducteur de Vacances au Japon
      </h1>
      
      {/* Explications */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p><strong>Comment ça marche:</strong></p>
        <ul className="list-disc ml-5 space-y-1 mt-1">
          <li>Parlez ou écrivez en français ou chinois → traduction en japonais</li>
          <li>Parlez ou écrivez en japonais → traduction en français ET chinois</li>
        </ul>
      </div>
      
      {/* Entrée */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Texte à traduire:
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            rows={4}
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
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-4">
          <button
            type="button"
            onClick={() => startRecording("fr")}
            disabled={isTranslating || (isRecording && recordingLanguage !== "fr")}
            className={`flex items-center justify-center py-2 px-2 md:px-3 rounded-lg text-white font-medium text-xs md:text-sm transition-all
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
            className={`flex items-center justify-center py-2 px-2 md:px-3 rounded-lg text-white font-medium text-xs md:text-sm transition-all
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
            className={`flex items-center justify-center py-2 px-2 md:px-3 rounded-lg text-white font-medium text-xs md:text-sm transition-all
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
          
          <button
            type="submit"
            disabled={!inputText.trim() || isTranslating || isRecording}
            className={`flex items-center justify-center py-2 px-3 rounded-lg bg-indigo-600 text-white font-medium text-xs md:text-sm transition-all col-span-3 md:col-span-1
              ${(!inputText.trim() || isTranslating || isRecording) ? "opacity-50 cursor-not-allowed" : "hover:bg-indigo-700"}
            `}
          >
            <MdTranslate className="mr-1" />
            {isTranslating ? "..." : "Traduire"}
          </button>
        </div>
      </form>
      
      {/* Indicateur d'enregistrement */}
      {isRecording && recordingLanguage && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg flex items-center">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse mr-2"></div>
          <p className="text-red-700 text-sm">
            Enregistrement en cours ({languageDisplay[recordingLanguage].name})...
          </p>
        </div>
      )}
      
      {/* Indicateur de traduction */}
      {isTranslating && (
        <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg flex items-center">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse mr-2"></div>
          <p className="text-blue-700 text-sm">
            Traduction en cours...
          </p>
        </div>
      )}
      
      {/* Résultats */}
      {Object.keys(translations).length > 0 && (
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
      
      {/* Pied de page */}
      <div className="text-xs text-center text-gray-500 mt-4">
        Parfait pour vos vacances au Japon en famille
      </div>
    </div>
  );
};

export default TraducteurVacances;
