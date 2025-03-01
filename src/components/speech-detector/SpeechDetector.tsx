import React, { useEffect, useState, useRef } from 'react';
import { audioContext } from "../../lib/utils/audio-context";
import VolMeterWorket from "../../lib/worklets/vol-meter";

interface SpeechDetectorProps {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
    onVolumeChange?: (volume: number) => void;
    silenceThreshold?: number;
    silenceTimeout?: number;
    minSpeechDuration?: number;
}

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: string;
}

interface GroqResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

interface TranscriptionResult {
    text: string;
}

const SpeechDetector: React.FC<SpeechDetectorProps> = ({
    onSpeechStart,
    onSpeechEnd,
    onVolumeChange,
    silenceThreshold = 0.02,
    silenceTimeout = 1500,
    minSpeechDuration = 200
}) => {
    const [volume, setVolume] = useState<number>(0);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [speechBooleanState, setSpeechBooleanState] = useState<number>(0);
    const [speechEndCount, setSpeechEndCount] = useState<number>(0);
    const [lastEndTime, setLastEndTime] = useState<string>("");
    const [endNotification, setEndNotification] = useState<boolean>(false);
    const [recordingEnded, setRecordingEnded] = useState(false);
    const [transcriptions, setTranscriptions] = useState<{ id: string, text: string, timestamp: string }[]>([]);
    const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [error, setError] = useState<string>("");
    const messageHistory = useRef<{ role: string, content: string }[]>([]);
    const processing = useRef<boolean>(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const vuWorkletRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const silenceTimerRef = useRef<number | null>(null);
    const silenceAlertTimerRef = useRef<number | null>(null);
    const speechStartTimeRef = useRef<number | null>(null);
    const hasSpokeRef = useRef<boolean>(false);
    const silenceCountRef = useRef<number>(0);
    const speechBooleanStateRef = useRef<number>(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const isRecordingRef = useRef<boolean>(false);

    // Nouvel état pour stocker les URLs des audios générés
    const [audioUrls, setAudioUrls] = useState<string[]>([]);

    useEffect(() => {
        speechBooleanStateRef.current = speechBooleanState;
    }, [speechBooleanState]);

    useEffect(() => {
        if (speechBooleanState === 1) {
            if (!silenceTimerRef.current) {
                silenceTimerRef.current = window.setTimeout(() => {
                    if (hasSpokeRef.current) {
                        setSpeechEndCount(prev => prev + 1);
                        const now = new Date();
                        setLastEndTime(now.toLocaleTimeString());
                        setEndNotification(true);
                        setTimeout(() => setEndNotification(false), 2000);

                        if (onSpeechEnd) onSpeechEnd();
                    }

                    setIsSpeaking(false);
                    setSpeechBooleanState(0);
                    hasSpokeRef.current = false;
                    speechStartTimeRef.current = null;
                    silenceTimerRef.current = null;
                }, silenceTimeout);
            }
        }

        return () => {
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
        };
    }, [speechBooleanState, silenceTimeout, onSpeechEnd]);

    const handleMessageSubmission = async (content: string) => {
        if (processing.current) return;
        processing.current = true;

        try {
            const userMessage: Message = {
                role: "user",
                content,
                timestamp: new Date().toLocaleTimeString(),
            };

            if (messageHistory.current.length === 0) {
                const systemPrompt = {
                    role: "system",
                    content: "Adopte le rôle d'un super psychologue, utilise un ton conversationnel, réponds en une phrase d'environ 30 mots maximum à chaque fois."
                };
                messageHistory.current = [systemPrompt];
            }

            messageHistory.current = [...messageHistory.current, { role: "user", content }];

            setMessages((prev) => [...prev, userMessage]);
            setError("");

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: messageHistory.current,
                    model: "llama3-70b-8192",
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || "Erreur API");
            }

            const data: GroqResponse = await response.json();

            if (data.choices?.[0]?.message?.content) {
                const assistantContent = data.choices[0].message.content;
                const assistantMessage: Message = {
                    role: "assistant",
                    content: assistantContent,
                    timestamp: new Date().toLocaleTimeString(),
                };

                messageHistory.current = [...messageHistory.current, { role: "assistant", content: assistantContent }];
                setMessages((prev) => [...prev, assistantMessage]);

                if (messageHistory.current.length > 20) {
                    messageHistory.current = messageHistory.current.slice(-20);
                }

                // Appel de la fonction speakResponse modifiée
                if (typeof speakResponse === 'function') {
                    speakResponse(assistantContent);
                }
            }
        } catch (error: any) {
            console.error("Erreur:", error);
            setError(`Erreur: ${error.message}`);
        } finally {
            processing.current = false;
        }
    };

    // Fonction speakResponse modifiée
    const speakResponse = async (text:any) => {
      try {
        const response = await fetch("http://localhost:5000/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text, voice: "fr-FR-DeniseNeural" }),
        });
    
        if (!response.ok) {
          throw new Error("Échec de la génération de l'audio.");
        }
    
        // Récupérer l'audio sous forme de Blob
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
    
        // Créer un élément <audio> et l'ajouter au DOM
        const audio = document.createElement("audio");
        audio.src = audioUrl;
        audio.controls = true;
        document.body.appendChild(audio);
    
        // Lecture automatique
        audio.play();
      } catch (error) {
        console.error("Erreur lors de la lecture du TTS:", error);
      }
    };
    
    




    const sendAudioForTranscription = async (audioBlob: Blob): Promise<TranscriptionResult | null> => {
        if (!import.meta.env.VITE_GROQ_API_KEY) {
            console.error('Clé API non trouvée');
            return null;
        }

        try {
            let audioToSend = audioBlob;
            if (audioBlob.type === 'audio/webm') {
                console.log("Attention: envoi d'un fichier webm comme wav");
            }

            const formData = new FormData();
            formData.append('file', audioToSend, 'audio.wav');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('temperature', '0');
            formData.append('response_format', 'json');
            formData.append('language', 'fr');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status} - ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error("Erreur de transcription:", error);
            return null;
        }
    };

    const saveRecording = async (audioBlob: Blob) => {
        const url = URL.createObjectURL(audioBlob);
        const recordingId = `speech-${Date.now()}`;
        const timestamp = new Date().toLocaleTimeString();

        setIsTranscribing(true);
        const transcription = await sendAudioForTranscription(audioBlob);
        setIsTranscribing(false);

        if (transcription && transcription.text) {
            const transcriptionText = transcription.text.trim();
            setTranscriptions(prev => [...prev, {
                id: recordingId,
                text: transcriptionText,
                timestamp
            }]);

            if (transcriptionText && !processing.current) {
                await handleMessageSubmission(transcriptionText);
            }
        }

        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;

        const link = document.createElement('a');
        link.href = url;
        link.download = `${recordingId}.webm`;
        link.innerText = 'Télécharger l\'enregistrement';

        const container = document.createElement('div');
        container.appendChild(audio);
        container.appendChild(document.createElement('br'));
        container.appendChild(link);

        document.body.appendChild(container);
    };

    const startRecording = () => {
        if (!streamRef.current) return;

        audioChunksRef.current = [];
        const options = { mimeType: 'audio/webm' };

        try {
            mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                saveRecording(audioBlob);
            };

            mediaRecorderRef.current.start();
            isRecordingRef.current = true;
            console.log("Enregistrement démarré");
        } catch (err) {
            console.error("Erreur lors du démarrage de l'enregistrement:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            isRecordingRef.current = false;
            console.log("Enregistrement arrêté");

            setSpeechBooleanState(0);
            setIsSpeaking(false);
            speechBooleanStateRef.current = 0;

            hasSpokeRef.current = false;
            speechStartTimeRef.current = null;

            setRecordingEnded(true);
            setTimeout(() => setRecordingEnded(false), 2000);
        }
    };

    const startListening = async () => {
        try {
            audioContextRef.current = await audioContext({ sampleRate: 16000 });
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);

            const vuWorkletName = "speech-detector-vu-meter";
            await audioContextRef.current.audioWorklet.addModule(
                URL.createObjectURL(
                    new Blob(
                        [`registerProcessor("${vuWorkletName}", ${VolMeterWorket})`],
                        { type: "application/javascript" }
                    ))
            );

            vuWorkletRef.current = new AudioWorkletNode(audioContextRef.current, vuWorkletName);
            sourceRef.current.connect(vuWorkletRef.current);

            vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
                const newVolume = ev.data.volume;
                setVolume(newVolume);
                if (onVolumeChange) onVolumeChange(newVolume);

                const now = Date.now();

                if (newVolume > silenceThreshold) {
                    silenceCountRef.current = 0;

                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = null;
                    }
                    if (silenceAlertTimerRef.current) {
                        clearTimeout(silenceAlertTimerRef.current);
                        silenceAlertTimerRef.current = null;
                    }

                    if (!isSpeaking) {
                        if (!speechStartTimeRef.current) {
                            speechStartTimeRef.current = now;
                        } else if (now - speechStartTimeRef.current > minSpeechDuration) {
                            setIsSpeaking(true);
                            setSpeechBooleanState(1);
                            hasSpokeRef.current = true;

                            if (!isRecordingRef.current && streamRef.current) {
                                startRecording();
                            }

                            if (onSpeechStart) onSpeechStart();
                        }
                    }
                } else {
                    silenceCountRef.current += 1;

                    if (speechBooleanStateRef.current === 1 && silenceCountRef.current > 100) {
                        if (isRecordingRef.current) {
                            stopRecording();
                        }

                        silenceCountRef.current = 0;
                    }

                    // console.log("État de silence: Volume en dessous du seuil. Count:", silenceCountRef.current);

                    // console.log("speechBooleanState:", speechBooleanStateRef.current);
                    // console.log("silenceCountRef.current:", silenceCountRef.current);

                    if (isSpeaking && !silenceAlertTimerRef.current) {
                        silenceAlertTimerRef.current = window.setTimeout(() => {
                            alert("🛑 Silence détecté après la parole pendant plus de 200ms !");
                            silenceAlertTimerRef.current = null;
                        }, 200);
                    }
                }
            };

            setIsListening(true);
        } catch (error) {
            console.error("Erreur lors de l'accès au microphone:", error);
        }
    };

    const stopListening = () => {
        if (sourceRef.current) sourceRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());

        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (silenceAlertTimerRef.current) {
            clearTimeout(silenceAlertTimerRef.current);
            silenceAlertTimerRef.current = null;
        }

        if (isRecordingRef.current) {
            stopRecording();
        }

        setIsSpeaking(false);
        setIsListening(false);
        setSpeechBooleanState(0);
        hasSpokeRef.current = false;
        speechStartTimeRef.current = null;
        silenceCountRef.current = 0;
    };

    const toggleListening = async () => {
        if (isListening) {
            stopListening();
        } else {
            await startListening();
        }
    };

    const resetCounters = () => {
        setSpeechBooleanState(0);
        setSpeechEndCount(0);
        setLastEndTime("");
        hasSpokeRef.current = false;
        silenceCountRef.current = 0;
    };

    return (<>
        <div className="relative flex flex-col items-center p-4 border rounded-lg shadow-md bg-gray-100">
            <div className="w-full h-32 bg-gray-200 rounded-lg relative mb-4">
                <div
                    className={`absolute bottom-0 w-full transition-all duration-100 rounded-b-lg ${isSpeaking ? 'bg-green-500' :
                        endNotification ? 'bg-red-500' :
                            isListening ? 'bg-blue-400' : 'bg-gray-400'}`}
                    style={{ height: `${Math.min(volume * 200, 100)}%` }}
                />

                <div className={`absolute top-2 left-2 px-3 py-1 rounded text-sm font-medium ${isSpeaking ? 'bg-green-100 text-green-800 border border-green-500 animate-pulse' :
                    endNotification ? 'bg-red-100 text-red-800 border border-red-500 animate-pulse' :
                        isListening ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                            'bg-gray-100 text-gray-800 border border-gray-300'}`}>
                    {isSpeaking ? 'Parole détectée' :
                        endNotification ? 'Fin de parole' :
                            isListening ? 'En écoute' :
                                'Microphone inactif'}
                </div>

                {isRecordingRef.current && (
                    <div className="absolute top-2 right-2 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium border border-red-500 animate-pulse">
                        ⚫ Enregistrement
                    </div>
                )}

                {isTranscribing && (
                    <div className="absolute bottom-2 right-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs border border-yellow-500">
                        Transcription en cours...
                    </div>
                )}
            </div>

            <div className="w-full mb-4 grid grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded-lg border shadow-sm">
                    <div className="text-sm font-medium mb-2">État de parole:</div>
                    <div className="flex justify-center">
                        <span
                            className={`px-4 py-2 text-2xl font-bold rounded-full w-12 h-12 flex items-center justify-center ${speechBooleanState === 1
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-700'}`}
                        >
                            {speechBooleanState}
                        </span>
                    </div>
                </div>

                <div className="p-3 bg-white rounded-lg border shadow-sm">
                    <div className="text-sm font-medium mb-2">Fins de parole:</div>
                    <div className="flex justify-center">
                        <span className="px-4 py-2 text-2xl font-bold rounded-full w-12 h-12 flex items-center justify-center bg-purple-500 text-white">
                            {speechEndCount}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex space-x-3">
                <button
                    onClick={toggleListening}
                    className={`px-6 py-3 rounded-full font-semibold transition-colors ${isListening
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                >
                    {isListening ? 'Arrêter l\'écoute' : 'Démarrer l\'écoute'}
                </button>

                <button
                    onClick={resetCounters}
                    className="px-6 py-3 rounded-full font-semibold bg-gray-300 hover:bg-gray-400"
                >
                    Réinitialiser compteurs
                </button>
            </div>

            <div className="w-full mt-6 p-4 bg-white rounded-lg border shadow-md">
                <h3 className="text-lg font-medium mb-3">Conversation</h3>

                {error && (
                    <div className="p-3 mb-3 bg-red-50 text-red-700 rounded border border-red-200">
                        {error}
                    </div>
                )}

                <div className="max-h-80 overflow-y-auto mb-4">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`p-3 mb-2 rounded ${msg.role === 'user'
                                ? 'bg-blue-50 border-blue-100 border ml-auto max-w-[80%]'
                                : 'bg-gray-50 border-gray-100 border max-w-[80%]'}`}
                        >
                            <div className="flex justify-between mb-1">
                                <span className="text-xs font-medium">
                                    {msg.role === 'user' ? 'Vous' : 'Assistant'}
                                </span>
                                <span className="text-xs text-gray-500">{msg.timestamp}</span>
                            </div>
                            <p className="text-sm">{msg.content}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Affichage des audios générés */}
            <div className="w-full mt-6 p-4 bg-white rounded-lg border shadow-md">
                <h3 className="text-lg font-medium mb-3">Audios générés</h3>
                {audioUrls.map((url, index) => (
                    <div key={index} className="mb-2">
                        <audio src={url} controls />
                    </div>
                ))}
            </div>
        </div>
    </>);
};

export default SpeechDetector;