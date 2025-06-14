//@ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';

// --- VOS CLÉS API ---
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

// --- CONSTANTE DE CONFIGURATION ---
const INTERRUPTION_THRESHOLD = 3; // Nombre de mots pour déclencher une interruption

interface DeepgramTranscriptData {
  channel: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
    }>;
  };
  is_final: boolean;
  speech_final: boolean;
}

function App() {
  // États pour la transcription
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  // États pour la connexion et l'enregistrement
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // États pour l'IA (texte et voix)
  const [llmResponse, setLlmResponse] =useState<string>('');
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);

  // Références
  const connectionRef = useRef<LiveClient | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  // NOUVEAU: Référence pour suivre l'état d'interruption et éviter les déclenchements multiples
  const interruptedRef = useRef<boolean>(false);


  // Fonction pour arrêter la parole de l'IA
  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = ''; // Détacher la source audio
      audioPlayerRef.current = null;
    }
    setAudioQueue([]); // Vider la file d'attente
    setIsSpeaking(false);
    console.log("🎤 Interruption! La parole de l'IA est arrêtée.");
  }, []);


  // Fonction de synthèse vocale (TTS)
  const speakText = useCallback(async (text: string) => {
    if (!text.trim()) return Promise.resolve();
    setIsSpeaking(true);
    
    // NOUVEAU: On réinitialise le flag d'interruption au début de chaque nouvelle parole
    interruptedRef.current = false;

    try {
      const response = await fetch("https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "fr-FR-DeniseNeural" }),
      });
      if (!response.ok) throw new Error("Service de synthèse vocale indisponible.");

      const audioBlob = await response.blob();
      // Si on a été interrompu pendant le fetch, ne pas jouer le son
      if (interruptedRef.current) return Promise.resolve();

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.play();

      return new Promise<void>(resolve => {
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          if (audioPlayerRef.current === audio) {
            audioPlayerRef.current = null;
          }
          resolve();
        };
      });
    } catch (err: any) {
      setError("Erreur TTS: " + err.message);
      setIsSpeaking(false);
      return Promise.reject(err);
    }
  }, []);

  // Processeur de la file d'attente audio
  useEffect(() => {
    if (!isSpeaking && audioQueue.length > 0) {
      const nextSentence = audioQueue[0];
      setAudioQueue(prev => prev.slice(1));
      speakText(nextSentence);
    }
  }, [audioQueue, isSpeaking, speakText]);


  // Fonction pour appeler l'IA de Groq
  const getLlmResponse = useCallback(async (text: string) => {
    if (!text.trim() || !GROQ_API_KEY) return;
    setIsAnswering(true);
    setLlmResponse('');
    
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: "Tu es un assistant utile et conversationnel. Réponds en français." }, { role: "user", content: text }],
          model: "gemma2-9b-it",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error?.message || "Erreur API Groq");

      const data = await response.json();
      const choice = data.choices[0]?.message?.content;
      if (choice) {
        setLlmResponse(choice);
        const sentences = choice.match(/[^.!?]+[.!?]*|[^.!?\n]+/g) || [];
        setAudioQueue(sentences.map(s => s.trim()).filter(s => s));
      }
    } catch (err: any) {
      setError("Erreur de l'IA: " + err.message);
    } finally {
      setIsAnswering(false);
    }
  }, []);

  // Fonction pour arrêter proprement tous les processus
  const stopAll = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    connectionRef.current?.finish();
    stopSpeaking(); // Utiliser la nouvelle fonction pour arrêter la parole
    
    mediaRecorderRef.current = null;
    streamRef.current = null;
    connectionRef.current = null;
    setIsRecording(false);
    setIsConnected(false);
    setInterimTranscript('');
    setIsAnswering(false);
  }, [stopSpeaking]);

  // Logique principale de démarrage
  const startRecording = useCallback(async () => {
    // Réinitialisation complète des états au démarrage
    setError(null);
    setUserTranscript('');
    setInterimTranscript('');
    setLlmResponse('');
    setAudioQueue([]);

    try {
      if (!DEEPGRAM_API_KEY) throw new Error("Clé API Deepgram manquante !");
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      const deepgram = createClient(DEEPGRAM_API_KEY);
      const connection = deepgram.listen.live({ model: 'nova-2', language: 'fr', interim_results: true, smart_format: true, punctuate: true, speech_final: true, utterance_end_ms: 1000 });
      connectionRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, () => {
        setIsConnected(true);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && connectionRef.current?.getReadyState() === 1) connectionRef.current.send(event.data);
        };
        mediaRecorder.start(250);
        setIsRecording(true);
      });

      let currentUtterance = '';
      connection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptData) => {
        const transcriptText = data.channel?.alternatives?.[0]?.transcript ?? '';
        if (!transcriptText.trim() && !data.is_final) return;

        // --- NOUVEAU: LOGIQUE D'INTERRUPTION ---
        // On vérifie si l'IA est en train de parler et si l'utilisateur dit quelque chose
        if (isSpeaking && transcriptText.trim() && !interruptedRef.current) {
          // On compte les mots dans la transcription en cours de l'utilisateur
          const wordCount = (userTranscript + ' ' + interimTranscript + ' ' + transcriptText).trim().split(' ').filter(Boolean).length;
          
          if (wordCount >= INTERRUPTION_THRESHOLD) {
            interruptedRef.current = true; // Mettre le drapeau pour ne pas redéclencher
            stopSpeaking(); // Arrêter la parole de l'IA
            // La transcription de l'utilisateur continue normalement
          }
        }
        
        // Logique de transcription normale
        if (data.is_final) {
          currentUtterance += transcriptText + ' ';
          setUserTranscript(prev => prev + transcriptText + ' ');
          setInterimTranscript('');
          
          if (data.speech_final) {
             // On n'envoie la requête que si l'IA n'a pas été interrompue
             if (!interruptedRef.current) {
                getLlmResponse(currentUtterance.trim());
             }
             // On réinitialise pour la prochaine interaction
             currentUtterance = '';
             setUserTranscript('');
          }
        } else {
          setInterimTranscript(transcriptText);
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err: any) => { setError('Erreur Deepgram: ' + err.message); stopAll(); });
      connection.on(LiveTranscriptionEvents.Close, () => setIsConnected(false));

    } catch (err: any) {
      setError('Erreur: ' + err.message);
      stopAll();
    }
  }, [stopAll, getLlmResponse, isSpeaking, stopSpeaking, userTranscript, interimTranscript]); // Ajout des dépendances

  const toggleRecording = () => { isRecording || isConnected ? stopAll() : startRecording(); };

  useEffect(() => { return () => { stopAll(); }; }, [stopAll]);

  // Le JSX reste identique, car toute la logique est dans les hooks.
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-4 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2">
            🗣️ Assistant IA (Interruptible) 🧠
          </h1>
          <p className="text-gray-400">Écoute, Répond, Parle et se laisse couper la parole.</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 mb-6 rounded-lg" role="alert">
            <p className="font-bold">Erreur</p>
            <p>{error}</p>
          </div>
        )}

        <div className="bg-gray-800/50 rounded-xl shadow-lg p-6 mb-6 backdrop-blur-sm border border-white/10">
          <div className="flex justify-center items-center gap-4 mb-6">
            <button onClick={toggleRecording} className={`w-48 px-6 py-3 text-lg font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-300'
                  : 'bg-purple-600 hover:bg-purple-700 text-white focus:ring-purple-400'
              }`}>
              {isRecording ? '🛑 Arrêter' : '🎤 Parler'}
            </button>
          </div>
          <div className="flex justify-center flex-wrap gap-4">
            <div className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isConnected ? 'bg-green-500/80' : 'bg-gray-600'}`}>
              {isConnected ? '✅ Connecté' : '🔌 Déconnecté'}
            </div>
            <div className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${isRecording ? 'bg-red-500/80 animate-pulse' : 'bg-gray-600'}`}>
              {isRecording ? '🔴 Écoute...' : '⏸️ En pause'}
            </div>
          </div>
        </div>


        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-800/50 rounded-xl shadow-lg p-6 backdrop-blur-sm border border-white/10">
            <h2 className="text-2xl font-semibold text-gray-200 mb-4">📝 Votre Dialogue</h2>
            <div className="bg-gray-900/70 rounded-lg p-4 min-h-[200px]">
              <div className="font-mono text-gray-300 leading-relaxed whitespace-pre-wrap">
                {userTranscript}
                <span className="text-gray-500">{interimTranscript}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-xl shadow-lg p-6 backdrop-blur-sm border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-200">🤖 Réponse de l'IA</h2>
              {isSpeaking && <span className="text-purple-400 animate-pulse text-2xl">🔊</span>}
            </div>
            <div className="bg-gray-900/70 rounded-lg p-4 min-h-[200px] flex items-center justify-center">
              {isAnswering && !llmResponse && (
                <div className="text-center text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto mb-2"></div>
                  L'IA réfléchit...
                </div>
              )}
              {!isAnswering && !llmResponse && (
                <div className="text-gray-500 italic text-center">La réponse apparaîtra ici.</div>
              )}
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">{llmResponse}</div>
            </div>
          </div>
        </div>
        
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Développé avec ❤️ et un trio d'IA qui sait écouter</p>
        </div>
      </div>
    </div>
  );
}

export default App;