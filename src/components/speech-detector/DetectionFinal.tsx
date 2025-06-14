//@ts-nocheck
import { useRef, useState, useCallback, useEffect } from 'react';
import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk';

// --- VOS CLÃ‰S API ---
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const DEEPINFRA_TOKEN = import.meta.env.VITE_DEEPINFRA_TOKEN; // âœ… NOUVELLE CLÃ‰

// --- CONFIGURATION ---
const INTERRUPTION_THRESHOLD = 3;
const SYSTEM_PROMPT = "adopt the role of perfect girlfriend sonia who is always happy to help and answer questions. you are very kind, helpful, and always positive. you are very smart and know a lot about many things. you are also very good at giving advice and helping people with their problems. you are always there for your boyfriend and will do anything to make him happy.";

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
 timestamp?: Date;
}

function App() {
 // --- Ã‰TATS OPTIMISÃ‰S ---
 // âœ… Affichage UI avec useState
 const [messages, setMessages] = useState<Message[]>([
 { role: 'system', content: SYSTEM_PROMPT, timestamp: new Date() }
 ]);

 // âœ… Historique API avec useRef (pas de re-render)
 const messageHistory = useRef<{ role: string; content: string }[]>([]);

 // Ã‰tats UI
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

 // --- RÃ‰FÃ‰RENCES ---
 const connectionRef = useRef<LiveClient | null>(null);
 const mediaRecorderRef = useRef<MediaRecorder | null>(null);
 const streamRef = useRef<MediaStream | null>(null);
 const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
 const interruptedRef = useRef<boolean>(false);
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const processingRef = useRef<boolean>(false);

 // --- INITIALISATION ---
 useEffect(() => {
 messageHistory.current = [
 { role: 'system', content: SYSTEM_PROMPT }
 ];
 console.log('ðŸš€ COMPOSANT INITIALISÃ‰');
 }, []);

 // --- FONCTIONS ---

 // Auto-scroll vers le bas quand un message est ajoutÃ©
 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
 }, [messages, interimTranscript, isAnswering]);

 const stopSpeaking = useCallback(() => {
 console.log('ðŸ”‡ ARRÃŠT DE LA PAROLE');
 if (audioPlayerRef.current) {
 audioPlayerRef.current.pause();
 audioPlayerRef.current.src = '';
 }
 setAudioQueue([]);
 setIsSpeaking(false);
 }, []);

 // âœ… NOUVELLE FONCTION TTS AVEC DEEPINFRA
 const speakText = useCallback(async (text: string) => {
 console.log('ðŸ”Š SYNTHÃˆSE VOCALE DEEPINFRA:', text.substring(0, 100) + '...');
 if (!text.trim()) return Promise.resolve();
 
 if (!DEEPINFRA_TOKEN) {
 console.error('â Œ CLÃ‰ DEEPINFRA MANQUANTE');
 setError('ClÃ© API DeepInfra manquante');
 return Promise.reject(new Error('ClÃ© API manquante'));
 }
 console.log(DEEPINFRA_TOKEN)
 setIsSpeaking(true);
 interruptedRef.current = false;
 
 try {
 console.log('ðŸŒ REQUÃŠTE DEEPINFRA TTS...');
 const response = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
 method: "POST",
 headers: {
 Authorization: `Bearer ${import.meta.env.VITE_DEEPINFRA_TOKEN}`,
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
 
 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(`Erreur DeepInfra TTS: ${response.status} - ${errorData.message || 'Service indisponible'}`);
 }
 
 // âœ… VÃ©rifier si on a Ã©tÃ© interrompu pendant la requÃªte
 if (interruptedRef.current) {
 console.log('ðŸ”‡ SYNTHÃˆSE INTERROMPUE PENDANT LA REQUÃŠTE');
 return Promise.resolve();
 }

 console.log('âœ… RÃ‰PONSE DEEPINFRA REÃ‡UE');
 const audioBlob = await response.blob();
 
 // âœ… VÃ©rifier encore une fois si on a Ã©tÃ© interrompu
 if (interruptedRef.current) {
 console.log('ðŸ”‡ SYNTHÃˆSE INTERROMPUE PENDANT LE TÃ‰LÃ‰CHARGEMENT');
 return Promise.resolve();
 }

 const audioUrl = URL.createObjectURL(audioBlob);
 const audio = new Audio(audioUrl);
 audioPlayerRef.current = audio;
 
 console.log('ðŸŽµ LECTURE AUDIO DEEPINFRA');
 audio.play();

 return new Promise<void>((resolve, reject) => {
 audio.onended = () => {
 console.log('âœ… SYNTHÃˆSE DEEPINFRA TERMINÃ‰E');
 setIsSpeaking(false);
 URL.revokeObjectURL(audioUrl);
 resolve();
 };
 
 audio.onerror = (e) => {
 console.error('â Œ ERREUR LECTURE AUDIO:', e);
 setIsSpeaking(false);
 URL.revokeObjectURL(audioUrl);
 reject(new Error('Erreur de lecture audio'));
 };
 
 // âœ… GÃ©rer l'interruption pendant la lecture
 const checkInterruption = setInterval(() => {
 if (interruptedRef.current) {
 console.log('ðŸ”‡ SYNTHÃˆSE INTERROMPUE PENDANT LA LECTURE');
 audio.pause();
 audio.src = '';
 clearInterval(checkInterruption);
 setIsSpeaking(false);
 URL.revokeObjectURL(audioUrl);
 resolve();
 }
 }, 100);
 
 audio.onended = () => {
 clearInterval(checkInterruption);
 console.log('âœ… SYNTHÃˆSE DEEPINFRA TERMINÃ‰E');
 setIsSpeaking(false);
 URL.revokeObjectURL(audioUrl);
 resolve();
 };
 });
 
 } catch (err: any) {
 console.error('â Œ ERREUR TTS DEEPINFRA:', err);
 setError(`Erreur TTS DeepInfra: ${err.message}`);
 setIsSpeaking(false);
 return Promise.reject(err);
 }
 }, []);
 
 useEffect(() => {
 if (!isSpeaking && audioQueue.length > 0) {
 console.log('ðŸŽµ LECTURE QUEUE AUDIO:', audioQueue.length, 'Ã©lÃ©ments');
 const nextSentence = audioQueue[0];
 setAudioQueue(prev => prev.slice(1));
 speakText(nextSentence);
 }
 }, [audioQueue, isSpeaking, speakText]);

 // âœ… FONCTION GETLLMRESPONSE OPTIMISÃ‰E
 const getLlmResponse = useCallback(async (newUserMessage: string) => {
 console.log('ðŸ¤– DÃ‰BUT REQUÃŠTE LLM:', newUserMessage);
 
 // âœ… VÃ‰RIFICATIONS STRICTES
 const cleanMessage = newUserMessage.trim();
 if (!cleanMessage || cleanMessage.length < 3) {
 console.log('â Œ MESSAGE TROP COURT, REQUÃŠTE ANNULÃ‰E');
 return;
 }
 
 // âœ… VÃ©rifier que ce n'est pas juste de la ponctuation
 if (/^[.,;:!?â€¦\s]+$/.test(cleanMessage)) {
 console.log('â Œ MESSAGE CONTIENT SEULEMENT PONCTUATION, ANNULÃ‰');
 return;
 }
 
 // âœ… Ã‰viter les mots non significatifs
 const invalidPhrases = ['euh', 'ah', 'hm', 'mm', 'merci', 'bonjour'];
 if (invalidPhrases.includes(cleanMessage.toLowerCase())) {
 console.log('â Œ PHRASE NON SIGNIFICATIVE, ANNULÃ‰E');
 return;
 }
 
 if (!GROQ_API_KEY) {
 console.log('â Œ CLÃ‰ API MANQUANTE');
 return;
 }

 // âœ… Ã‰viter les appels multiples simultanÃ©s
 if (processingRef.current) {
 console.log('â ³ REQUÃŠTE EN COURS, IGNORÃ‰E');
 return;
 }
 
 processingRef.current = true;
 setIsAnswering(true);
 setLlmResponse('');
 stopSpeaking();

 try {
 // âœ… Ajouter Ã  l'historique API (useRef)
 messageHistory.current = [
 ...messageHistory.current,
 { role: 'user', content: cleanMessage }
 ];

 // âœ… Ajouter Ã  l'affichage UI
 setMessages(prev => [...prev, { 
 role: 'user', 
 content: cleanMessage,
 timestamp: new Date()
 }]);

 console.log('ðŸŒ ENVOI REQUÃŠTE GROQ avec', messageHistory.current.length, 'messages');
 
 const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
 method: "POST",
 headers: { 
 "Authorization": `Bearer ${GROQ_API_KEY}`, 
 "Content-Type": "application/json" 
 },
 body: JSON.stringify({
 messages: messageHistory.current,
 model: "gemma2-9b-it",
 }),
 });
 
 if (!response.ok) {
 throw new Error((await response.json()).error?.message || "Erreur API Groq");
 }

 const data = await response.json();
 const assistantResponse = data.choices[0]?.message?.content;
 
 if (assistantResponse) {
 console.log('âœ… RÃ‰PONSE LLM REÃ‡UE:', assistantResponse.substring(0, 100) + '...');
 
 // âœ… Ajouter Ã  l'historique API
 messageHistory.current = [
 ...messageHistory.current,
 { role: 'assistant', content: assistantResponse }
 ];

 // âœ… Ajouter Ã  l'affichage UI
 setMessages(prev => [...prev, { 
 role: 'assistant', 
 content: assistantResponse,
 timestamp: new Date()
 }]);

 setLlmResponse(assistantResponse);

 // âœ… LIMITATION MÃ‰MOIRE
 if (messageHistory.current.length > 20) {
 console.log('ðŸ—‘ï¸ NETTOYAGE MÃ‰MOIRE - Garder 20 derniers messages');
 messageHistory.current = messageHistory.current.slice(-20);
 }
 
 const sentences = assistantResponse.match(/[^.!?]+[.!?]*|[^.!?\n]+/g) || [];
 console.log('ðŸŽµ AJOUT Ã€ LA QUEUE AUDIO:', sentences.length, 'phrases');
 setAudioQueue(sentences.map(s => s.trim()).filter(s => s));
 }
 } catch (err: any) {
 console.error('â Œ ERREUR LLM:', err);
 setError("Erreur de l'IA: " + err.message);
 } finally {
 setIsAnswering(false);
 processingRef.current = false;
 console.log('ðŸ FIN REQUÃŠTE LLM');
 }
 }, []);

 const stopAll = useCallback(() => {
 console.log('ðŸ›‘ ARRÃŠT COMPLET');
 if (mediaRecorderRef.current?.state === 'recording') {
 mediaRecorderRef.current.stop();
 }
 streamRef.current?.getTracks().forEach(track => track.stop());
 connectionRef.current?.finish();
 stopSpeaking();
 
 mediaRecorderRef.current = null;
 streamRef.current = null;
 connectionRef.current = null;
 processingRef.current = false;
 
 setIsRecording(false);
 setIsConnected(false);
 setInterimTranscript('');
 setUserTranscript('');
 setIsAnswering(false);
 interruptedRef.current = false;
 }, [stopSpeaking]);

 // âœ… FONCTION STARTRECORDING CORRIGÃ‰E
 const startRecording = useCallback(async () => {
 console.log('ðŸŽ¤ DÃ‰BUT ENREGISTREMENT');
 
 setError(null);
 setUserTranscript('');
 setInterimTranscript('');
 setLlmResponse('');
 setAudioQueue([]);
 interruptedRef.current = false;

 try {
 if (!DEEPGRAM_API_KEY) throw new Error("ClÃ© API Deepgram manquante !");
 
 const stream = await navigator.mediaDevices.getUserMedia({ 
 audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } 
 });
 streamRef.current = stream;

 const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
 mediaRecorderRef.current = mediaRecorder;

 const deepgram = createClient(DEEPGRAM_API_KEY);
 const connection = deepgram.listen.live({ 
 model: 'nova-2', 
 language: 'en', 
 interim_results: true, 
 smart_format: true, 
 punctuate: true, 
 speech_final: true, 
 utterance_end_ms: 1500
 });
 connectionRef.current = connection;

 connection.on(LiveTranscriptionEvents.Open, () => {
 console.log('ðŸ”Œ CONNEXION DEEPGRAM OUVERTE');
 setIsConnected(true);
 
 mediaRecorder.ondataavailable = (event) => {
 if (event.data.size > 0 && connectionRef.current?.getReadyState() === 1) {
 connectionRef.current.send(event.data);
 }
 };
 
 mediaRecorder.start(250);
 setIsRecording(true);
 });

 // âœ… GESTION TRANSCRIPTION CORRIGÃ‰E
 let currentUtterance = '';
 let hasValidContent = false;
 
 connection.on(LiveTranscriptionEvents.Transcript, (data: DeepgramTranscriptData) => {
 const transcriptText = data.channel?.alternatives?.[0]?.transcript ?? '';
 
 // âœ… Ignorer les transcriptions vides
 if (!transcriptText.trim()) {
 console.log('âšª Transcription vide ignorÃ©e');
 return;
 }

 // âœ… VÃ©rifier le contenu valide
 const cleanText = transcriptText.trim().toLowerCase();
 const invalidPhrases = ['euh', 'ah', 'hm', 'mm', '...', '.', 'merci'];
 const isValidContent = cleanText.length > 3 && 
 !invalidPhrases.includes(cleanText) &&
 !/^[.,;:!?â€¦\s]+$/.test(cleanText);

 console.log('ðŸŽ™ï¸ TRANSCRIPTION:', {
 text: transcriptText,
 is_final: data.is_final,
 speech_final: data.speech_final,
 is_valid: isValidContent,
 utterance_length: currentUtterance.length
 });

 // âœ… Gestion interruption amÃ©liorÃ©e
 if (isSpeaking && isValidContent && !interruptedRef.current) {
 const totalWords = (currentUtterance + ' ' + transcriptText).trim().split(/\s+/).filter(Boolean).length;
 console.log('ðŸ”¢ COMPTAGE MOTS INTERRUPTION:', totalWords);
 if (totalWords >= INTERRUPTION_THRESHOLD) {
 console.log('â ¹ï¸ INTERRUPTION DÃ‰TECTÃ‰E');
 interruptedRef.current = true;
 stopSpeaking();
 }
 }
 
 if (data.is_final) {
 if (isValidContent) {
 currentUtterance += transcriptText + ' ';
 hasValidContent = true;
 console.log('âœ… CONTENU VALIDE AJOUTÃ‰:', transcriptText);
 } else {
 console.log('âš ï¸ CONTENU IGNORÃ‰:', transcriptText);
 }
 
 setUserTranscript(currentUtterance.trim());
 setInterimTranscript('');
 
 // âœ… VÃ‰RIFICATION FINALE STRICTE
 if (data.speech_final && hasValidContent) {
 const finalText = currentUtterance.trim();
 
 console.log('ðŸŽ¯ VÃ‰RIFICATION FINALE:', {
 text: finalText,
 length: finalText.length,
 interrupted: interruptedRef.current,
 processing: processingRef.current
 });
 
 // âœ… Triple vÃ©rification avant envoi
 if (finalText.length > 5 && 
 !interruptedRef.current && 
 !processingRef.current &&
 !/^[.,;:!?â€¦\s]+$/.test(finalText)) {
 
 console.log('ðŸš€ ENVOI LLM - PHRASE VALIDÃ‰E:', finalText);
 getLlmResponse(finalText);
 } else {
 console.log('ðŸš« PHRASE REJETÃ‰E:', {
 trop_courte: finalText.length <= 5,
 interrompue: interruptedRef.current,
 en_cours: processingRef.current,
 que_ponctuation: /^[.,;:!?â€¦\s]+$/.test(finalText)
 });
 }
 
 // âœ… RÃ©initialiser pour la prochaine phrase
 currentUtterance = '';
 hasValidContent = false;
 setUserTranscript('');
 }
 } else {
 // Transcription intÃ©rimaire
 if (isValidContent) {
 setInterimTranscript(transcriptText);
 }
 }
 });

 connection.on(LiveTranscriptionEvents.Error, (err: any) => { 
 console.error('â Œ ERREUR DEEPGRAM:', err);
 setError('Erreur Deepgram: ' + err.message); 
 stopAll(); 
 });
 
 connection.on(LiveTranscriptionEvents.Close, () => {
 console.log('ðŸ”Œ CONNEXION DEEPGRAM FERMÃ‰E');
 setIsConnected(false);
 });

 } catch (err: any) {
 console.error('â Œ ERREUR ENREGISTREMENT:', err);
 setError('Erreur: ' + err.message);
 stopAll();
 }
 }, [stopAll, getLlmResponse, isSpeaking, stopSpeaking]);

 const toggleRecording = () => { 
 console.log('ðŸ”„ TOGGLE ENREGISTREMENT:', { isRecording, isConnected });
 if (isRecording || isConnected) {
 stopAll();
 } else {
 startRecording();
 }
 };
 
 // âœ… FONCTION SOUMISSION TEXTE
 const handleTextSubmit = (e: React.FormEvent<HTMLFormElement>) => {
 e.preventDefault();
 console.log('ðŸ“ SOUMISSION TEXTE:', textInput);
 
 if (!textInput.trim()) return;
 
 if (isRecording) {
 console.log('ðŸ›‘ ARRÃŠT ENREGISTREMENT POUR TEXTE');
 stopAll();
 }
 
 getLlmResponse(textInput);
 setTextInput('');
 };

 // âœ… Nettoyage au dÃ©montage
 useEffect(() => { 
 return () => { 
 console.log('ðŸ§¹ NETTOYAGE COMPOSANT');
 stopAll(); 
 }; 
 }, [stopAll]);

 const formatTime = (date: Date) => {
 return date.toLocaleTimeString('fr-FR', { 
 hour: '2-digit', minute: '2-digit' 
 });
 };

 return (
 <div className="h-screen bg-black flex flex-col max-w-sm mx-auto relative">
 {/* Header et Status Bar */}
 <div className="bg-black text-white text-sm px-6 py-2 flex justify-between items-center">
 <div className="flex items-center space-x-1">
 <span className="text-xs">9:41</span>
 </div>
 <div className="flex items-center space-x-1">
 <div className="flex space-x-1">
 <div className="w-1 h-3 bg-white rounded-full"></div>
 <div className="w-1 h-3 bg-white rounded-full"></div>
 <div className="w-1 h-3 bg-white rounded-full"></div>
 <div className="w-1 h-3 bg-white/50 rounded-full"></div>
 </div>
 <div className="w-6 h-3 border border-white rounded-sm">
 <div className="w-4 h-1.5 bg-green-500 rounded-sm m-0.5"></div>
 </div>
 </div>
 </div>
 
 <div className="bg-gray-900 text-white px-4 py-4 flex items-center justify-between border-b border-gray-800">
 <div className="flex items-center space-x-3">
 <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
 <span className="text-lg">ðŸ¤–</span>
 </div>
 <div>
 <h1 className="font-semibold text-lg">Gemini Assistant</h1>
 <p className="text-xs text-gray-400">
 {isConnected ? (
 <span className="flex items-center">
 <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></span>
 En ligne
 </span>
 ) : (
 <span className="flex items-center">
 <span className="w-2 h-2 bg-gray-500 rounded-full mr-1"></span>
 Hors ligne
 </span>
 )}
 </p>
 </div>
 </div>
 {isSpeaking && (
 <div className="flex space-x-1">
 <div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse"></div>
 <div className="w-1 h-6 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
 <div className="w-1 h-5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
 </div>
 )}
 </div>

 {/* Messages */}
 <div className="flex-1 bg-black overflow-y-auto px-4 py-2 space-y-2">
 <div className="text-xs text-gray-500 text-center">
 DEBUG: {messages.length} messages total, {messages.slice(1).length} affichÃ©s
 </div>
 
 {messages.slice(1).map((msg, index) => (
 <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
 <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
 msg.role === 'user' 
 ? 'bg-blue-600 text-white rounded-br-md' 
 : 'bg-gray-800 text-white rounded-bl-md'
 }`}>
 <p className="text-sm leading-relaxed">{msg.content}</p>
 {msg.timestamp && (
 <p className="text-xs text-gray-300 mt-1">
 {formatTime(msg.timestamp)}
 </p>
 )}
 </div>
 </div>
 ))}
 
 {interimTranscript && (
 <div className="flex justify-end">
 <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-blue-600/70 text-white rounded-br-md">
 <p className="text-sm leading-relaxed italic">{interimTranscript}</p>
 </div>
 </div>
 )}
 
 {isAnswering && (
 <div className="flex justify-start">
 <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-2xl bg-gray-800 text-white rounded-bl-md">
 <div className="flex space-x-1">
 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
 <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
 </div>
 </div>
 </div>
 )}
 
 <div ref={messagesEndRef} />
 </div>

 {error && (
 <div className="mx-4 mb-2 bg-red-900 border border-red-700 text-red-200 px-3 py-2 rounded-lg text-sm">
 {error}
 </div>
 )}

 {/* Zone de saisie */}
 <div className="bg-gray-900 px-4 py-3 border-t border-gray-800">
 <form onSubmit={handleTextSubmit} className="flex items-center space-x-3">
 <input
 type="text"
 value={textInput}
 onChange={(e) => setTextInput(e.target.value)}
 placeholder={isRecording ? "Ã‰coute en cours..." : "Ã‰crire un message..."}
 disabled={isRecording || isAnswering}
 className="flex-1 bg-gray-800 text-white placeholder-gray-500 px-4 py-3 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 text-sm disabled:opacity-50"
 />
 {textInput.trim() ? (
 <button 
 type="submit" 
 disabled={isAnswering}
 className="w-12 h-12 flex-shrink-0 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:opacity-50"
 >
 <svg className="w-6 h-6 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
 <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
 </svg>
 </button>
 ) : (
 <button 
 type="button" 
 onClick={toggleRecording}
 disabled={isAnswering}
 className={`w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${
 isRecording 
 ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500' 
 : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500'
 }`}
 >
 {isRecording ? (
 <div className="w-4 h-4 bg-white rounded-sm animate-pulse"></div>
 ) : (
 <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
 <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
 </svg>
 )}
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