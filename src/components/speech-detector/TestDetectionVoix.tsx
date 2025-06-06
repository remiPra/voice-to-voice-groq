//@ts-nocheck
import React, { useEffect, useRef, useState } from "react";

/**
 * Remplacement complet de la logique MediaRecorder/Whisper
 * par la Web Speech API.  ❚❚ 2025‑06‑06
 */

// Types utilitaires ---------------------------------------------------------
interface VoiceDetectorProps {
  deepInfraToken?: string; // clé DeepInfra pour Kokoro TTS
  groqApiKey?: string;     // clé Groq pour le LLM
  systemPrompt?: string;   // prompt système envoyé en 1er message
  endOfSpeechDelay?: number; // délai de fin d'énoncé (ms) – défaut 2000
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface GroqResponse {
  choices: { message: { content: string } }[];
}

// ---------------------------------------------------------------------------

const ConversationVocaleAuto: React.FC<VoiceDetectorProps> = ({
  deepInfraToken = "T9lFMOSO2Xtcl0CdIpCC9qVQ75Ss2IGV",
  groqApiKey = import.meta.env.VITE_GROQ_API_KEY,
  systemPrompt = "You are a sexy vocal assistant.",
  endOfSpeechDelay = 2000,
}) => {
  // ------------------------------ ÉTATS UI ------------------------------ //
  const [isListening, setIsListening]       = useState(false);  // micro actif ?
  const [isRecognizing, setIsRecognizing]   = useState(false);  // Web Speech actif ?
  const [isLoadingResponse, setIsLoading]   = useState(false);  // attente LLM
  const [isPlayingTTS, setIsPlayingTTS]     = useState(false);  // lecture TTS
  const [error, setError]                   = useState<string>("");
  const [ttsError, setTtsError]             = useState<string | null>(null);
  const [messages, setMessages]             = useState<Message[]>([{
    role: "system", content: systemPrompt, timestamp: new Date().toLocaleTimeString(),
  }]);

  // ------------------------------ REFS ---------------------------------- //
  const recognitionRef  = useRef<SpeechRecognition | null>(null);
  const phraseBufferRef = useRef<string>("");
  const endTimerRef     = useRef<number | null>(null);
  const audioRef        = useRef<HTMLAudioElement>(null);
  const processing      = useRef(false); // protège les appels successifs

  // ----------------------- INITIALISATION MESSAGES ---------------------- //
  const messageHistory = useRef<{ role: string; content: string }[]>([{
    role: "system",
    content: systemPrompt,
  }]);

  // ------------------------- TTS (DeepInfra) ---------------------------- //
  const generateKokoroAudio = async (text: string) => {
    if (!deepInfraToken) {
      setTtsError("Token DeepInfra requis");
      return;
    }

    setIsPlayingTTS(true);
    setTtsError(null);

    try {
      const response = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deepInfraToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          output_format: "wav",
          preset_voice: ["af_bella"],
          speed: 1.0,
          stream: true,
          sample_rate: 24000,
        }),
      });

      if (!response.ok) throw new Error(`Erreur API DeepInfra: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl  = URL.createObjectURL(audioBlob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
      }
    } catch (e: any) {
      console.error("Erreur Kokoro TTS:", e);
      setTtsError(e.message || "Erreur inconnue");
      setIsPlayingTTS(false);
    }
  };

  const handleAudioEnded = () => setIsPlayingTTS(false);

  // ------------------------- LLM ( Groq ) -------------------------------- //
  const handleMessageSubmission = async (content: string) => {
    if (processing.current || !content.trim()) return;

    processing.current = true;
    setIsLoading(true);

    try {
      // Ajoute le message utilisateur
      const userMessage: Message = { role: "user", content, timestamp: new Date().toLocaleTimeString() };
      setMessages((prev) => [...prev, userMessage]);
      messageHistory.current.push({ role: "user", content });

      // Appel Groq ChatCompletion
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gemma2-9b-it", messages: messageHistory.current }),
      });

      if (!resp.ok) throw new Error(`LLM error ${resp.status}`);
      const data: GroqResponse = await resp.json();
      const assistantContent = data.choices?.[0]?.message?.content?.replace(/\*/g, "").trim();

      if (assistantContent) {
        const assistantMsg: Message = { role: "assistant", content: assistantContent, timestamp: new Date().toLocaleTimeString() };
        setMessages((prev) => [...prev, assistantMsg]);
        messageHistory.current.push({ role: "assistant", content: assistantContent });

        // Limiter l'historique aux 20 derniers échanges
        if (messageHistory.current.length > 40) messageHistory.current.splice(0, messageHistory.current.length - 40);

        await generateKokoroAudio(assistantContent);
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erreur inconnue");
    } finally {
      setIsLoading(false);
      processing.current = false;
    }
  };

  // ----------------------- WEBSPEECH (reconnaissance) ------------------- //

  /**
   * Prépare et démarre WebSpeech.
   */
  const startRecognition = () => {
    const SpeechRecognition: typeof window.SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Web Speech API non supportée par ce navigateur 😢");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsRecognizing(true);
    recognition.onerror = evt => console.error("Speech error", evt);
    recognition.onend   = () => {
      setIsRecognizing(false);
      // Relance auto si l'écoute est toujours activée
      if (isListening) recognition.start();
    };

    recognition.onresult = evt => {
      const transcript = Array.from(evt.results)
        .map(r => r[0].transcript)
        .join(" ")
        .trim();

      phraseBufferRef.current = transcript;

      // On remet/relance le timer de fin d'énoncé
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = window.setTimeout(() => {
        const phrase = phraseBufferRef.current.trim();
        if (phrase) handleMessageSubmission(phrase);
        phraseBufferRef.current = ""; // reset buffer
      }, endOfSpeechDelay);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // évite le restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    phraseBufferRef.current = "";
    setIsRecognizing(false);
  };

  // ------------------------- Contrôle général --------------------------- //
  const toggleListening = () => {
    if (isListening) {
      stopRecognition();
      setIsListening(false);
    } else {
      setError("");
      startRecognition();
      setIsListening(true);
    }
  };

  // Nettoyage quand le composant est démonté
  useEffect(() => () => stopRecognition(), []);

  // ---------------------------------------------------------------------- //

  return (
    <div className="max-w-3xl mx-auto p-6 text-white bg-gradient-to-br from-indigo-900 to-purple-900 rounded-lg shadow-lg">
      {/* HEADER */}
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-bold mb-2">🎙️ Conversation Vocale Auto (Web Speech)</h2>
        <p className="text-gray-300 text-sm">Parlez, faites une pause : l'IA répond automatiquement !</p>
      </div>

      {/* INDICATEURS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-center text-xs font-semibold">
        <div className={`p-3 rounded-lg ${isListening ? "bg-green-600" : "bg-gray-700"}`}>🎧 {isListening ? "ÉCOUTE" : "STOP"}</div>
        <div className={`p-3 rounded-lg ${isRecognizing ? "bg-yellow-600 animate-pulse" : "bg-gray-700"}`}>📝 {isRecognizing ? "TRANSCRIPTION" : "PRÊT"}</div>
        <div className={`p-3 rounded-lg ${isLoadingResponse ? "bg-blue-600 animate-pulse" : "bg-gray-700"}`}>🤖 {isLoadingResponse ? "LLM" : "PRÊT"}</div>
        <div className={`p-3 rounded-lg ${isPlayingTTS ? "bg-purple-600 animate-pulse" : "bg-gray-700"}`}>🔊 {isPlayingTTS ? "TTS" : "SILENCE"}</div>
      </div>

      {/* BOUTON PRINCIPAL */}
      <div className="text-center mb-6">
        <button
          onClick={toggleListening}
          className={`px-10 py-4 rounded-xl font-bold text-xl transition-transform hover:scale-105 shadow-lg ${
            isListening ? "bg-red-600 hover:bg-red-700" : "bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700"
          }`}
        >
          {isListening ? "🛑 ARRÊTER" : "🚀 DÉMARRER"}
        </button>
      </div>

      {/* HISTORIQUE CONVERSATION */}
      <div className="mb-6 max-h-80 overflow-y-auto bg-gray-800/40 p-4 rounded-lg space-y-3">
        {messages.filter(m => m.role !== "system").length === 0 ? (
          <p className="text-center text-gray-400">Aucun message pour l'instant…</p>
        ) : (
          messages.filter(m => m.role !== "system").map((msg, idx) => (
            <div key={idx} className={`p-3 rounded-lg max-w-[85%] ${msg.role === "user" ? "ml-auto bg-blue-600/80" : "bg-gray-700/80"}`}>
              <div className="flex justify-between text-xs mb-1">
                <span>{msg.role === "user" ? "🗣️ Vous" : "🤖 Assistant"}</span>
                <span>{msg.timestamp}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          ))
        )}
      </div>

      {/* ERREURS */}
      {error && <div className="p-4 mb-4 bg-red-600/80 rounded-lg">{error}</div>}
      {ttsError && <div className="p-4 mb-4 bg-red-600/80 rounded-lg">TTS : {ttsError}</div>}

      {/* LECTEUR AUDIO CACHÉ */}
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
    </div>
  );
};

export default ConversationVocaleAuto;
