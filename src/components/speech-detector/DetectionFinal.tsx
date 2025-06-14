//@ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';

// --- VOS CLÉS API ---
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

// --- CONFIGURATION ---
const INTERRUPTION_THRESHOLD = 3;
const SYSTEM_PROMPT = "Tu es un assistant conversationnel nommé Gemini. Tu es serviable, créatif, et tu réponds toujours en français de manière amicale.";

// --- TYPES ---
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

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function App() {
  // --- ÉTATS ---
  const [messageHistory, setMessageHistory] = useState<Message[]>([
    { role: 'system', content: SYSTEM_PROMPT }
  ]);

  // LOG: Surveiller les changements d'historique
  useEffect(() => {
    console.log('🔄 HISTORIQUE MODIFIÉ:', {
      nombre_messages: messageHistory.length,
      messages: messageHistory.map(m => ({ role: m.role, content: m.content.substring(0, 50) + '...' }))
    });
  }, [messageHistory]);

  // NOUVEAU: État pour le champ de saisie texte
  const [textInput, setTextInput] = useState<string>('');
  
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [llmResponse, setLlmResponse] = useState<string>('');
  const [isAnswering, setIsAnswering] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audioQueue, setAudioQueue] = useState<string[]>([]);

  // --- RÉFÉRENCES ---
  const connectionRef = useRef<LiveClient | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const interruptedRef = useRef<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- FONCTIONS ---

  // Auto-scroll vers le bas quand un message est ajouté
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageHistory, interimTranscript, isAnswering]);

  const stopSpeaking = useCallback(() => {
    console.log('🔇 ARRÊT DE LA PAROLE');
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = '';
    }
    setAudioQueue([]);
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(async (text: string) => {
    console.log('🔊 SYNTHÈSE VOCALE:', text.substring(0, 100) + '...');
    if (!text.trim()) return Promise.resolve();
    setIsSpeaking(true);
    interruptedRef.current = false;
    try {
      const response = await fetch("https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "fr-FR-DeniseNeural" }),
      });
      if (!response.ok) throw new Error("Service de synthèse vocale indisponible.");
      if (interruptedRef.current) {
        console.log('🔇 SYNTHÈSE INTERROMPUE');
        return Promise.resolve();
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.play();

      return new Promise<void>(resolve => {
        audio.onended = () => {
          console.log('✅ SYNTHÈSE TERMINÉE');
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
      });
    } catch (err: any) {
      console.error('❌ ERREUR TTS:', err);
      setError("Erreur TTS: " + err.message);
      setIsSpeaking(false);
      return Promise.reject(err);
    }
  }, []);
  
  useEffect(() => {
    if (!isSpeaking && audioQueue.length > 0) {
      console.log('🎵 LECTURE QUEUE AUDIO:', audioQueue.length, 'éléments');
      const nextSentence = audioQueue[0];
      setAudioQueue(prev => prev.slice(1));
      speakText(nextSentence);
    }
  }, [audioQueue, isSpeaking, speakText]);

  const getLlmResponse = useCallback(async (newUserMessage: string) => {
    console.log('🤖 DÉBUT REQUÊTE LLM:', newUserMessage);
    console.log('📚 HISTORIQUE AVANT REQUÊTE:', messageHistory.length, 'messages');
    
    if (!newUserMessage.trim() || !GROQ_API_KEY) {
      console.log('❌ REQUÊTE ANNULÉE:', { message: newUserMessage.trim(), api_key: !!GROQ_API_KEY });
      return;
    }
    
    setIsAnswering(true);
    setLlmResponse('');
    stopSpeaking(); // Arrêter la parole si l'IA parlait

    const updatedHistory: Message[] = [...messageHistory, { 
      role: 'user', content: newUserMessage
    }];
    
    console.log('📝 HISTORIQUE APRÈS AJOUT USER:', updatedHistory.length, 'messages');
    setMessageHistory(updatedHistory);

    try {
      console.log('🌐 ENVOI REQUÊTE GROQ avec', updatedHistory.length, 'messages');
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedHistory,
          model: "gemma2-9b-it",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error?.message || "Erreur API Groq");

      const data = await response.json();
      const choice = data.choices[0]?.message?.content;
      
      if (choice) {
        console.log('✅ RÉPONSE LLM REÇUE:', choice.substring(0, 100) + '...');
        
        const finalHistory = [...updatedHistory, { 
          role: 'assistant', content: choice
        }];
        
        console.log('📝 HISTORIQUE FINAL:', finalHistory.length, 'messages');
        setMessageHistory(finalHistory);
        setLlmResponse(choice);
        
        const sentences = choice.match(/[^.!?]+[.!?]*|[^.!?\n]+/g) || [];
        console.log('🎵 AJOUT À LA QUEUE AUDIO:', sentences.length, 'phrases');
        setAudioQueue(sentences.map(s => s.trim()).filter(s => s));
      }
    } catch (err: any) {
      console.error('❌ ERREUR LLM:', err);
      setError("Erreur de l'IA: " + err.message);
    } finally {
      setIsAnswering(false);
      console.log('🏁 FIN REQUÊTE LLM');
    }
  }, [messageHistory, stopSpeaking]);

  const stopAll = useCallback(() => {
    console.log('🛑 ARRÊT COMPLET');
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    connectionRef.current?.finish();
    stopSpeaking();
    mediaRecorderRef.current = null;
    streamRef.current = null;
    connectionRef.current = null;
    setIsRecording(false);
    setIsConnected(false);
    setInterimTranscript('');
    setIsAnswering(false);
  }, [stopSpeaking]);

  const startRecording = useCallback(async () => {
    console.log('🎤 DÉBUT ENREGISTREMENT');
    console.log('📚 HISTORIQUE AU DÉBUT ENREGISTREMENT:', messageHistory.length, 'messages');
    
    setError(null);
    setUserTranscript('');
    setInterimTranscript('');
    // ⚠️ PROBLÈME POTENTIEL : on ne doit PAS réinitialiser llmResponse ici si on veut garder l'historique
    setLlmResponse('');
    setAudioQueue([]);

    try {
      if (!DEEPGRAM_API_KEY) throw new Error("Clé API Deepgram manquante !");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } 
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      const deepgram = createClient(DEEPGRAM_API_KEY);
      const connection = deepgram.listen.live({ 
        model: 'nova-2', language: 'fr', interim_results: true, smart_format: true, 
        punctuate: true, speech_final: true, utterance_end_ms: 1000 
      });
      connectionRef.current = connection;

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('🔌 CONNEXION DEEPGRAM OUVERTE');
        setIsConnected(true);
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && connectionRef.current?.getReadyState() === 1) {
            connectionRef.current.send(event.data);
          }
        };
        mediaRecorder.start(250);
        setIsRecording(true);
      });

      let currentUtterance = '';
      connection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptData) => {
        const transcriptText = data.channel?.alternatives?.[0]?.transcript ?? '';
        if (!transcriptText.trim() && !data.is_final) return;

        console.log('🎙️ TRANSCRIPTION:', {
          text: transcriptText,
          is_final: data.is_final,
          speech_final: data.speech_final,
          current_utterance: currentUtterance
        });

        if (isSpeaking && transcriptText.trim() && !interruptedRef.current) {
          const wordCount = (userTranscript + ' ' + interimTranscript + ' ' + transcriptText).trim().split(' ').filter(Boolean).length;
          console.log('🔢 COMPTAGE MOTS INTERRUPTION:', wordCount);
          if (wordCount >= INTERRUPTION_THRESHOLD) {
            console.log('⏹️ INTERRUPTION DÉTECTÉE');
            interruptedRef.current = true;
            stopSpeaking();
          }
        }
        
        if (data.is_final) {
          currentUtterance += transcriptText + ' ';
          setUserTranscript(prev => prev + transcriptText + ' ');
          setInterimTranscript('');
          
          if (data.speech_final) {
            console.log('🎯 PHRASE FINALE DÉTECTÉE:', currentUtterance.trim());
            console.log('📚 HISTORIQUE AVANT APPEL LLM:', messageHistory.length, 'messages');
             if (!interruptedRef.current) {
                getLlmResponse(currentUtterance.trim());
             } else {
               console.log('🚫 APPEL LLM BLOQUÉ - INTERRUPTION');
             }
             currentUtterance = '';
             setUserTranscript('');
          }
        } else {
          setInterimTranscript(transcriptText);
        }
      });

      connection.on(LiveTranscriptionEvents.Error, (err: any) => { 
        console.error('❌ ERREUR DEEPGRAM:', err);
        setError('Erreur Deepgram: ' + err.message); 
        stopAll(); 
      });
      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('🔌 CONNEXION DEEPGRAM FERMÉE');
        setIsConnected(false);
      });

    } catch (err: any) {
      console.error('❌ ERREUR ENREGISTREMENT:', err);
      setError('Erreur: ' + err.message);
      stopAll();
    }
  }, [stopAll, getLlmResponse, isSpeaking, stopSpeaking, userTranscript, interimTranscript, messageHistory]);

  const toggleRecording = () => { 
    console.log('🔄 TOGGLE ENREGISTREMENT:', { isRecording, isConnected });
    isRecording || isConnected ? stopAll() : startRecording(); 
  };
  
  // NOUVEAU: Fonction pour gérer la soumission du texte
  const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('📝 SOUMISSION TEXTE:', textInput);
    console.log('📚 HISTORIQUE AVANT SOUMISSION:', messageHistory.length, 'messages');
    
    if (!textInput.trim()) return;
    if (isRecording) {
      console.log('🛑 ARRÊT ENREGISTREMENT POUR TEXTE');
      stopAll();
    }
    getLlmResponse(textInput);
    setTextInput('');
  };

  useEffect(() => { 
    return () => { 
      console.log('🧹 NETTOYAGE COMPOSANT');
      stopAll(); 
    }; 
  }, [stopAll]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', minute: '2-digit' 
    });
  };

  // LOG: Rendu des messages
  console.log('🎨 RENDU COMPOSANT:', {
    messages_affiches: messageHistory.slice(1).length,
    interim: interimTranscript,
    is_answering: isAnswering
  });

  return (
    <div className="h-screen bg-black flex flex-col max-w-sm mx-auto relative">
      {/* Header et Status Bar */}
      <div className="bg-black text-white text-sm px-6 py-2 flex justify-between items-center">
        <div className="flex items-center space-x-1"><span className="text-xs">9:41</span></div>
        <div className="flex items-center space-x-1"><div className="flex space-x-1"><div className="w-1 h-3 bg-white rounded-full"></div><div className="w-1 h-3 bg-white rounded-full"></div><div className="w-1 h-3 bg-white rounded-full"></div><div className="w-1 h-3 bg-white/50 rounded-full"></div></div><div className="w-6 h-3 border border-white rounded-sm"><div className="w-4 h-1.5 bg-green-500 rounded-sm m-0.5"></div></div></div>
      </div>
      <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center"><span className="text-lg">🤖</span></div><div><h1 className="font-semibold text-lg">Gemini Assistant</h1><p className="text-xs text-gray-400">{isConnected ? (<span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>En ligne</span>) : (<span className="flex items-center"><span className="w-2 h-2 bg-gray-500 rounded-full mr-1"></span>Hors ligne</span>)}</p></div></div>
        {isSpeaking && (<div className="flex space-x-1"><div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse"></div><div className="w-1 h-6 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div><div className="w-1 h-5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div></div>)}
      </div>

      {/* Messages */}
      <div className="flex-1 bg-black overflow-y-auto px-4 py-2 space-y-2">
        {/* LOG DEBUG - Afficher le nombre de messages */}
        <div className="text-xs text-gray-500 text-center">
          DEBUG: {messageHistory.length} messages total, {messageHistory.slice(1).length} affichés
        </div>
        
        {messageHistory.slice(1).map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-800 text-white rounded-bl-md'}`}>
              <p className="text-sm leading-relaxed">{msg.content}</p>
          
            </div>
          </div>
        ))}
        {interimTranscript && (
          <div className="flex justify-end">
            <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-blue-600/70 text-white rounded-br-md"><p className="text-sm leading-relaxed italic">{interimTranscript}</p></div>
          </div>
        )}
        {isAnswering && (
          <div className="flex justify-start">
            <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-gray-800 text-white rounded-bl-md"><div className="flex space-x-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div></div></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && ( <div className="mx-4 mb-2 bg-red-900 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">{error}</div> )}

      {/* Zone de saisie */}
      <div className="bg-gray-900 px-4 py-3 border-t border-gray-800">
        <form onSubmit={handleTextSubmit} className="flex items-center space-x-3">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={isRecording ? "Écoute en cours..." : "Écrire un message..."}
            disabled={isRecording || isAnswering}
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-sm disabled:opacity-50"
          />
          {textInput.trim() ? (
            <button type="submit" className="w-12 h-12 flex-shrink-0 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500">
              <svg className="w-6 h-6 transform rotate-90" fill="currentColor" viewBox="0 0 20 20"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path></svg>
            </button>
          ) : (
            <button type="button" onClick={toggleRecording} className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500' : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500'}`}>
              {isRecording ? (<div className="w-4 h-4 bg-white rounded-sm animate-pulse"></div>) : (<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" /></svg>)}
            </button>
          )}
        </form>
      </div>

      <div className="bg-black pb-2 flex justify-center">
        <div className="w-32 h-1 bg-white rounded-full opacity-60"></div>
      </div>
    </div>
  );
}

export default App;