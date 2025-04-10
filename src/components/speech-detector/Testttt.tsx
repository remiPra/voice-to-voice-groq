import React, { useEffect, useState, useRef } from "react";
import { audioContext } from "../../lib/utils/audio-context";
import VolMeterWorket from "../../lib/worklets/vol-meter";
import Navbar from "../NavBarSimple";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";

interface SpeechDetectorProps {
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
  silenceThreshold?: number;
  silenceTimeout?: number;
  minSpeechDuration?: number;
  systemPrompta?: string; // nouvelle prop pour le prompt système
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

const SpeechDetectorClaude: React.FC<SpeechDetectorProps> = ({
  onSpeechStart,
  onSpeechEnd,
  onVolumeChange,
  silenceThreshold = 0.01,
  silenceTimeout = 300,
  minSpeechDuration = 100,
  systemPrompta,
}) => {
  const [isTTSPlaying, setIsTTSPlaying] = useState<boolean>(false);
  const [displayMode, setDisplayMode] = useState<"text" | "video">("text");
  const [volume, setVolume] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechBooleanState, setSpeechBooleanState] = useState<number>(0);
  const [speechEndCount, setSpeechEndCount] = useState<number>(0);
  //@ts-ignore
  const [lastEndTime, setLastEndTime] = useState<string>("");
  //@ts-ignore
  const [endNotification, setEndNotification] = useState<boolean>(false);
  //@ts-ignore
  const [recordingEnded, setRecordingEnded] = useState(false);
  // Ajoutez ceci avec les autres états
  const [selectedVoice, setSelectedVoice] = useState<string>("nathalie"); // Kevin par défaut
  const [transcriptions, setTranscriptions] = useState<
    {
      id: string;
      text: string;
      timestamp: string;
    }[]
  >([]);
  // @ts-ignore
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");
  // @ts-ignore
  const interruptionStartTimeRef = useRef<number | null>(null);
  // @ts-ignore
  const [ttsInterruptEnabled, setTtsInterruptEnabled] = useState<boolean>(true);

  const [threshold, setThreshold] = useState<number>(silenceThreshold);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [isManualRecording, setIsManualRecording] = useState<boolean>(false);
  // Ajout d'un état pour indiquer si une interruption a eu lieu
  const [wasInterrupted, setWasInterrupted] = useState<boolean>(false);

  // Ref pour la calibration
  const noiseFloorRef = useRef<number[]>([]);
  const calibrationTimeRef = useRef<number | null>(null);
  const autoThresholdRef = useRef<number>(silenceThreshold);

  const messageHistory = useRef<{ role: string; content: string }[]>([]);
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const speechValidationRef = useRef<number | null>(null);
  const volumeHistory = useRef<number[]>([]);
  const MAX_HISTORY_LENGTH = 10;
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const firstSpeechDetectedRef = useRef<boolean>(false);
  const graceTimeoutRef = useRef<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(0.85);
  // Nouveau ref pour indiquer si le TTS est en cours de lecture et stocker l'élément audio
  const isTTSAudioPlayingRef = useRef<boolean>(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  // Nouveau ref pour la validation d'interruption
  const interruptValidationRef = useRef<number | null>(null);
  // Ajoutez ceci après les déclarations d'états
  const availableVoices = [
    {
      id: "d5c4211c-9584-4468-a090-86b872b82708",
      name: "Henry de Lesquin",
      api: "cartesia",
      voiceId: "d5c4211c-9584-4468-a090-86b872b82708",
    },
    {
      id: "8600d5ec-d29c-44fe-8457-7d730dbe8323",
      name: "Raël",
      api: "cartesia",
      voiceId: "8600d5ec-d29c-44fe-8457-7d730dbe8323",
    },
    {
      id: "d88eff4c-279d-472a-8ce6-9a805c88cb06",
      name: "Kevin (Alternatif)",
      api: "cartesia",
      voiceId: "d88eff4c-279d-472a-8ce6-9a805c88cb06",
    },
    {
      id: "0b1380da-611b-4d00-83f4-8a969a53e4e0",
      name: "helene",
      api: "cartesia",
      voiceId: "0b1380da-611b-4d00-83f4-8a969a53e4e0",
    },
    {
      id: "7d4f1bf2-696f-4f76-ba51-f804324c7cd2",
      name: "remi",
      api: "cartesia",
      voiceId: "7d4f1bf2-696f-4f76-ba51-f804324c7cd2",
    },
    {
      id: "nathalie",
      name: "Nathalie",
      api: "azure",
      voiceId: "fr-FR-DeniseNeural",
    },
  ];

  // Ref pour stocker les URLs des audios générés
  //@ts-ignore
  const [audioUrls, setAudioUrls] = useState<string[]>([]);

  useEffect(() => {
    speechBooleanStateRef.current = speechBooleanState;
  }, [speechBooleanState]);

  useEffect(() => {
    if (speechBooleanState === 1) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (hasSpokeRef.current) {
            setSpeechEndCount((prev) => prev + 1);
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

  // Fonction pour interrompre le TTS
  const interruptTTS = () => {
    if (isTTSAudioPlayingRef.current && audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
      isTTSAudioPlayingRef.current = false;
      setIsTTSPlaying(false);
      setWasInterrupted(true);
      setTimeout(() => setWasInterrupted(false), 2000);
      console.log("TTS interrompu par l'utilisateur");
    }
  };

  const calibrateMicrophone = () => {
    setIsCalibrating(true);
    noiseFloorRef.current = [];
    calibrationTimeRef.current = Date.now();
    const calibrationInterval = setInterval(() => {
      const elapsed = Date.now() - (calibrationTimeRef.current || 0);
      const progress = Math.min(elapsed / 3000, 1);
      setCalibrationProgress(progress * 100);
      if (progress >= 1) {
        clearInterval(calibrationInterval);
        finishCalibration();
      }
    }, 100);
  };

  const toggleManualRecording = () => {
    if (isManualRecording) {
      // Si on enregistre déjà, on arrête l'enregistrement
      stopRecording();
      setIsManualRecording(false);
    } else {
      // Si on n'enregistre pas, on démarre l'enregistrement
      if (streamRef.current) {
        startRecording();
        setIsManualRecording(true);
      } else {
        // Si le micro n'est pas encore activé, on l'active d'abord
        navigator.mediaDevices
          .getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
          .then((stream) => {
            streamRef.current = stream;
            startRecording();
            setIsManualRecording(true);
          })
          .catch((err) => {
            console.error("Erreur lors de l'accès au microphone:", err);
          });
      }
    }
  };

  const finishCalibration = () => {
    if (noiseFloorRef.current.length > 0) {
      const sum = noiseFloorRef.current.reduce((a, b) => a + b, 0);
      const mean = sum / noiseFloorRef.current.length;
      const variance =
        noiseFloorRef.current.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        noiseFloorRef.current.length;
      const stdDev = Math.sqrt(variance);
      const newThreshold = Math.max(0.005, mean + stdDev * 2);
      setThreshold(newThreshold);
      autoThresholdRef.current = newThreshold;
      console.log(
        `Calibration terminée. Nouveau seuil: ${newThreshold.toFixed(4)}`
      );
    }
    setIsCalibrating(false);
    setCalibrationProgress(0);
  };

  const handleThresholdChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newThreshold = parseFloat(event.target.value);
    if (!isNaN(newThreshold) && newThreshold >= 0) {
      setThreshold(newThreshold);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    }, 100);
  };

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
        if (systemPrompta) {
          const systemPrompt = {
            role: "system",
            content: systemPrompta,
          };
          messageHistory.current = [systemPrompt];
        }
      }
      messageHistory.current = [
        ...messageHistory.current,
        { role: "user", content },
      ];
      setMessages((prev) => [...prev, userMessage]);
      setError("");

      // Son d'attente
      const waitingAudio = new Audio("/no_input.mp3");
      waitingAudio.loop = true;
      waitingAudio.volume = 0.3;
      waitingAudio.play();

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: messageHistory.current,
            model: "gemma2-9b-it",
          }),
        }
      );
      waitingAudio.pause();
      waitingAudio.currentTime = 0;

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Erreur API");
      }
      const data: GroqResponse = await response.json();
      if (data.choices?.[0]?.message?.content) {
        const assistantContent = cleanLLMResponse(
          data.choices[0].message.content
        );

        const assistantMessage: Message = {
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toLocaleTimeString(),
        };
        messageHistory.current = [
          ...messageHistory.current,
          { role: "assistant", content: assistantContent },
        ];
        setMessages((prev) => [...prev, assistantMessage]);
        scrollToBottom();
        if (messageHistory.current.length > 20) {
          messageHistory.current = messageHistory.current.slice(-20);
        }
        if (typeof speakResponse === "function") {
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

  const speakResponse = async (text: string) => {
    // Arrêter l'enregistrement et désactiver la détection de parole pendant le TTS
    stopRecording();
    isTTSAudioPlayingRef.current = true;
    // On ne met pas encore setIsTTSPlaying(true) ici

    // Récupérer la voix actuellement sélectionnée
    const currentSelectedVoice = selectedVoice;
    console.log("Synthèse vocale avec voix ID:", currentSelectedVoice);

    // Trouver les informations de la voix sélectionnée
    const selectedVoiceInfo = availableVoices.find(
      (voice) => voice.id === currentSelectedVoice
    );

    if (!selectedVoiceInfo) {
      console.error(
        "Erreur: Voix non trouvée dans la liste des voix disponibles"
      );
      isTTSAudioPlayingRef.current = false;
      return;
    }

    console.log(
      `Utilisation de la voix: ${selectedVoiceInfo.name} (${selectedVoiceInfo.api})`
    );

    try {
      let response;

      // Appeler l'API appropriée selon le type de voix sélectionné
      if (selectedVoiceInfo.api === "cartesia") {
        // API Cartesia
        console.log(
          "Appel API Cartesia avec voiceId:",
          selectedVoiceInfo.voiceId
        );
        response = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "Cartesia-Version": "2024-06-10",
            "X-API-Key": import.meta.env.VITE_SYNTHESIA,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: "sonic-2",
            transcript: text,
            voice: {
              mode: "id",
              id: selectedVoiceInfo.voiceId,
            },
            output_format: {
              container: "mp3",
              bit_rate: 128000,
              sample_rate: 44100,
            },
            language: "fr",
          }),
        });
      } else if (selectedVoiceInfo.api === "azure") {
        // API Azure
        console.log("Appel API Azure avec voiceId:", selectedVoiceInfo.voiceId);
        response = await fetch(
          "https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: text,
              voice: selectedVoiceInfo.voiceId,
            }),
          }
        );
      } else {
        throw new Error(`API non reconnue: ${selectedVoiceInfo.api}`);
      }

      // Vérifier si la réponse est OK
      if (!response.ok) {
        throw new Error(
          `Erreur HTTP: ${response.status} - ${response.statusText}`
        );
      }

      // Convertir la réponse en blob audio
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Ajouter l'URL à la liste des audios générés
      setAudioUrls((prev) => [...prev, audioUrl]);

      // Créer et jouer l'audio
      const audio = new Audio(audioUrl);
      audioElementRef.current = audio; // Stocker la référence pour l'interruption
      audio.playbackRate = playbackRate;

      // Ajouter un événement onplay qui sera déclenché quand l'audio commence réellement à jouer
      audio.onplay = () => {
        console.log("Lecture audio démarrée - vidéo2 affichée");
        setIsTTSPlaying(true); // Activer vidéo2 quand l'audio commence réellement à jouer
      };

      // Configurer le callback de fin de lecture
      audio.onended = () => {
        // Réactiver la détection une fois le TTS terminé
        console.log("Lecture audio terminée - retour à vidéo1");
        isTTSAudioPlayingRef.current = false;
        setIsTTSPlaying(false); // Revenir à vidéo1 quand l'audio se termine
        audioElementRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      // Gérer les erreurs potentielles lors de la lecture
      audio.onerror = (e) => {
        console.error("Erreur lors de la lecture de l'audio:", e);
        isTTSAudioPlayingRef.current = false;
        setIsTTSPlaying(false);
        audioElementRef.current = null;
        URL.revokeObjectURL(audioUrl);
      };

      // Lancer la lecture
      console.log("Démarrage de la lecture audio");
      try {
        await audio.play();
      } catch (playError) {
        console.error("Erreur de démarrage de l'audio:", playError);
        setIsTTSPlaying(false);
        isTTSAudioPlayingRef.current = false;
        audioElementRef.current = null;
        URL.revokeObjectURL(audioUrl);
      }
    } catch (error) {
      console.error("Erreur lors de la génération ou lecture du TTS:", error);
      // S'assurer que le flag est réinitialisé en cas d'erreur
      isTTSAudioPlayingRef.current = false;
      setIsTTSPlaying(false);
      audioElementRef.current = null;
    }
  };

  const sendAudioForTranscription = async (
    audioBlob: Blob
  ): Promise<TranscriptionResult | null> => {
    if (!import.meta.env.VITE_GROQ_API_KEY) {
      console.error("Clé API non trouvée");
      return null;
    }
    try {
      let audioToSend = audioBlob;
      if (audioBlob.type === "audio/webm") {
        console.log("Envoi d'un fichier webm comme wav");
      }
      const formData = new FormData();
      formData.append("file", audioToSend, "audio.wav");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("temperature", "0");
      formData.append("response_format", "json");
      formData.append("language", "fr");
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
      if (!response.ok) {
        throw new Error(
          `Erreur HTTP: ${response.status} - ${response.statusText}`
        );
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
    const audio = new Audio(url);
    audio.onloadedmetadata = async () => {
      const duration = audio.duration;
      console.log("🎤 Durée de l'audio:", duration, "secondes");
      if (duration < 0.5) {
        console.warn("⏳ Ignoré: Audio trop court (<0.5s)");
        return;
      }
      console.log("✅ Envoi de l'audio à la transcription");
      setIsTranscribing(true);
      const transcription = await sendAudioForTranscription(audioBlob);
      setIsTranscribing(false);
      if (transcription && transcription.text) {
        const transcriptionText = transcription.text.trim();
        if (
          transcriptionText === "..." ||
          transcriptionText === ".." ||
          transcriptionText === "Merci." ||
          transcriptionText === "Merci" ||
          transcriptionText === "merci" ||
          transcriptionText === "." ||
          transcriptionText.length < 3 ||
          /^[.,;:!?…]+$/.test(transcriptionText)
        ) {
          console.warn(
            "⏳ Ignoré: Transcription non significative:",
            transcriptionText
          );
          return;
        }
        setTranscriptions((prev) => [
          ...prev,
          {
            id: `speech-${Date.now()}`,
            text: transcriptionText,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        if (transcriptionText && !processing.current) {
          await handleMessageSubmission(transcriptionText);
        }
      }
    };
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    audioChunksRef.current = [];
    const options = { mimeType: "audio/webm" };
    try {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
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
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
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

  const smoothVolume = (newVolume: number): number => {
    const alpha = 0.3;
    if (volumeHistory.current.length === 0) {
      volumeHistory.current.push(newVolume);
      return newVolume;
    }
    const smoothedValue =
      alpha * newVolume +
      (1 - alpha) * volumeHistory.current[volumeHistory.current.length - 1];
    volumeHistory.current.push(smoothedValue);
    if (volumeHistory.current.length > MAX_HISTORY_LENGTH) {
      volumeHistory.current.shift();
    }
    return smoothedValue;
  };

  const startListening = async () => {
    try {
      audioContextRef.current = await audioContext({ sampleRate: 16000 });
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      sourceRef.current = audioContextRef.current.createMediaStreamSource(
        streamRef.current
      );
      const bandPassFilter = audioContextRef.current.createBiquadFilter();
      bandPassFilter.type = "bandpass";
      bandPassFilter.frequency.value = 300;
      bandPassFilter.Q.value = 0.8;
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 1.2;
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      frequencyDataRef.current = new Uint8Array(
        analyserRef.current.frequencyBinCount
      );
      sourceRef.current.connect(gainNode);
      gainNode.connect(bandPassFilter);
      bandPassFilter.connect(analyserRef.current);
      const vuWorkletName = "speech-detector-vu-meter";
      await audioContextRef.current.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [`registerProcessor("${vuWorkletName}", ${VolMeterWorket})`],
            { type: "application/javascript" }
          )
        )
      );
      vuWorkletRef.current = new AudioWorkletNode(
        audioContextRef.current,
        vuWorkletName
      );
      bandPassFilter.connect(vuWorkletRef.current);
      calibrateMicrophone();
      firstSpeechDetectedRef.current = false;
      vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
        const rawVolume = ev.data.volume;
        if (isCalibrating) {
          noiseFloorRef.current.push(rawVolume);
          return;
        }
        const smoothedVolume = smoothVolume(rawVolume);
        setVolume(smoothedVolume);
        if (onVolumeChange) onVolumeChange(smoothedVolume);

        // Vérifier si l'audio TTS est en cours et si on devrait l'interrompre
        if (isTTSAudioPlayingRef.current && audioElementRef.current) {
          // Utiliser un seuil plus élevé pour l'interruption pour éviter les fausses alertes
          const interruptThreshold = threshold * 1.5;

          if (smoothedVolume > interruptThreshold) {
            // Vérifier les fréquences vocales pour s'assurer que c'est bien de la parole
            if (analyserRef.current && frequencyDataRef.current) {
              analyserRef.current.getByteFrequencyData(
                frequencyDataRef.current
              );
              const voiceFrequencyData = Array.from(
                frequencyDataRef.current.slice(3, 25)
              );
              const hasVoiceFrequency = voiceFrequencyData.some(
                (val) => val > 80
              );

              if (hasVoiceFrequency) {
                // Utiliser un compteur pour éviter les interruptions accidentelles
                silenceCountRef.current = 0;
                if (!interruptValidationRef.current) {
                  interruptValidationRef.current = window.setTimeout(() => {
                    interruptTTS();
                    // Commencer à enregistrer la nouvelle entrée
                    startRecording();
                    interruptValidationRef.current = null;
                  }, 150); // Courte validation pour réactivité
                }
              } else if (interruptValidationRef.current) {
                clearTimeout(interruptValidationRef.current);
                interruptValidationRef.current = null;
              }
            }
          } else if (interruptValidationRef.current) {
            clearTimeout(interruptValidationRef.current);
            interruptValidationRef.current = null;
          }

          // Si le TTS est en cours, ne pas traiter la détection de parole normale
          return;
        }

        if (analyserRef.current && frequencyDataRef.current) {
          analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
          const voiceFrequencyData = Array.from(
            frequencyDataRef.current.slice(3, 25)
          );
          const hasVoiceFrequency = voiceFrequencyData.some((val) => val > 80);
          let currentThreshold = threshold;
          if (firstSpeechDetectedRef.current) {
            currentThreshold = threshold * 0.8;
          }
          const now = Date.now();
          if (smoothedVolume > currentThreshold && hasVoiceFrequency) {
            silenceCountRef.current = 0;
            if (graceTimeoutRef.current) {
              clearTimeout(graceTimeoutRef.current);
              graceTimeoutRef.current = null;
            }
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
                const validationDelay = firstSpeechDetectedRef.current
                  ? 150
                  : 200;
                if (!speechValidationRef.current) {
                  speechValidationRef.current = window.setTimeout(() => {
                    setIsSpeaking(true);
                    setSpeechBooleanState(1);
                    hasSpokeRef.current = true;
                    firstSpeechDetectedRef.current = true;
                    if (!isRecordingRef.current && streamRef.current) {
                      startRecording();
                    }
                    if (onSpeechStart) onSpeechStart();
                    speechValidationRef.current = null;
                  }, validationDelay);
                }
              }
            }
          } else {
            if (speechValidationRef.current) {
              clearTimeout(speechValidationRef.current);
              speechValidationRef.current = null;
            }
            silenceCountRef.current += 1;
            const silenceThreshold = firstSpeechDetectedRef.current ? 40 : 50;
            if (
              speechBooleanStateRef.current === 1 &&
              silenceCountRef.current > silenceThreshold
            ) {
              if (!graceTimeoutRef.current) {
                graceTimeoutRef.current = window.setTimeout(() => {
                  if (isRecordingRef.current) {
                    stopRecording();
                  }
                  silenceCountRef.current = 0;
                  graceTimeoutRef.current = null;
                }, 500);
              }
            }
          }
        }
      };
      setIsListening(true);
    } catch (error) {
      console.error("Erreur lors de l'accès au microphone:", error);
    }
  };

  // Fonction de nettoyage pour supprimer les astérisques
  const cleanLLMResponse = (text: any) => {
    // Supprime tous les astérisques du texte
    return text.replace(/\*/g, "");
  };

  const stopListening = () => {
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current)
      streamRef.current.getTracks().forEach((track) => track.stop());
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (silenceAlertTimerRef.current) {
      clearTimeout(silenceAlertTimerRef.current);
      silenceAlertTimerRef.current = null;
    }
    if (speechValidationRef.current) {
      clearTimeout(speechValidationRef.current);
      speechValidationRef.current = null;
    }
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    if (interruptValidationRef.current) {
      clearTimeout(interruptValidationRef.current);
      interruptValidationRef.current = null;
    }
    if (isRecordingRef.current) {
      stopRecording();
    }
    // Si un TTS est en cours, l'arrêter également
    if (isTTSAudioPlayingRef.current && audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
      isTTSAudioPlayingRef.current = false;
      setIsTTSPlaying(false);
    }
    setIsSpeaking(false);
    setIsListening(false);
    setSpeechBooleanState(0);
    hasSpokeRef.current = false;
    speechStartTimeRef.current = null;
    silenceCountRef.current = 0;
    firstSpeechDetectedRef.current = false;
    volumeHistory.current = [];
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
    firstSpeechDetectedRef.current = false;
    volumeHistory.current = [];
  };

  const [inputText, setInputText] = useState<string>("");

  const handleTextSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputText.trim()) {
      handleMessageSubmission(inputText);
      setInputText("");
    }
  };

  return (
    <>
      <div className="flex h-screen bg-[#f5f7fa] overflow-hidden relative font-['Poppins',sans-serif]">
        {/* Contenu principal */}
        <div className="w-full flex flex-col h-full">
          <div className="bg-[#0a2463] p-5 shadow-lg">
            <div className="flex justify-between items-center">
              <h1 className="hidden md:block text-2xl font-['Montserrat',sans-serif] font-bold text-white tracking-tight">
                <span className="text-[#ff9000]">Chat</span>Assistante
              </h1>
              <Navbar />

              <div className="flex space-x-3">
                <button
                  onClick={toggleManualRecording}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isManualRecording
                      ? "bg-[#e63946] text-white shadow-lg"
                      : "bg-[#ff9000] text-white shadow-lg"
                  }`}
                >
                  {isManualRecording ? "■" : "●"}
                </button>
                <button
                  onClick={toggleListening}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isListening
                      ? "bg-[#e63946] text-white shadow-lg"
                      : "bg-[#3d9970] text-white shadow-lg"
                  }`}
                >
                  {isListening ? <BiMicrophoneOff /> : <FaMicrophone />}
                </button>
                <button
                  className="bg-[#1e3a8a] text-white p-2.5 rounded-full shadow-lg hover:bg-[#2a4494] transition-all duration-300"
                  onClick={() => {
                    const panel = document.getElementById("techPanel");
                    if (panel) {
                      panel.classList.toggle("translate-x-full");
                      panel.classList.toggle("translate-x-0");
                    }
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={() =>
                      setDisplayMode((prev) =>
                        prev === "text" ? "video" : "text"
                      )
                    }
                    className="bg-[#1e3a8a] text-white px-4 py-1.5 rounded-md hover:bg-[#2a4494] transition-all duration-300 shadow-md text-sm font-medium"
                  >
                    {displayMode === "text" ? "Voir vidéo" : "Voir messages"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {displayMode === "text" ? (
            <div
              className="flex-grow overflow-y-auto p-6 bg-[#f5f7fa]"
              style={{
                scrollBehavior: "smooth",
                backgroundImage:
                  "url('https://www.transparenttextures.com/patterns/cubes.png')",
              }}
            >
              {error && (
                <div className="p-4 mb-4 bg-[#e63946] text-white rounded-lg border border-red-600 shadow-lg">
                  {error}
                </div>
              )}
              {/* Notification d'interruption */}
              {wasInterrupted && (
                <div className="p-4 mb-4 bg-[#3d9970] text-white rounded-lg border border-green-600 shadow-lg text-center">
                  Réponse interrompue par l'utilisateur
                </div>
              )}
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`p-5 my-3 rounded-2xl max-w-[80%] shadow-md transition-all duration-300 hover:shadow-lg ${
                    msg.role === "user"
                      ? "bg-[#0a2463] text-white ml-auto"
                      : "bg-white border border-gray-200 text-[#0a2463]"
                  }`}
                  style={{
                    position: "relative",
                    ...(msg.role !== "user" && {
                      "&:before": {
                        content: '""',
                        position: "absolute",
                        top: "20px",
                        left: "-10px",
                        border: "10px solid transparent",
                        borderRight: "10px solid white",
                      },
                    }),
                    ...(msg.role === "user" && {
                      "&:before": {
                        content: '""',
                        position: "absolute",
                        top: "20px",
                        right: "-10px",
                        border: "10px solid transparent",
                        borderLeft: "10px solid #0a2463",
                      },
                    }),
                  }}
                >
                  <div className="flex justify-between mb-2">
                    <span
                      className={`text-xs font-bold ${
                        msg.role === "user"
                          ? "text-[#ff9000]"
                          : "text-[#1e3a8a]"
                      }`}
                    >
                      {msg.role === "user" ? "Vous" : "Assistant"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {msg.timestamp}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content}
                  </p>
                </div>
              ))}
              <div ref={messagesEndRef}></div>
            </div>
          ) : (
            <div className="flex-grow relative overflow-hidden">
              <div className="absolute lg:max-w-[450px] inset-0 w-full h-full">
                {isTTSPlaying ? (
                  <video
                    key="speaking-video"
                    src="/image_26_ins--video2.mp4"
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <video
                    key="idle-video"
                    src="/image_26_ins--video1.mp4"
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                )}
              </div>
            </div>
          )}

          <form
            onSubmit={handleTextSubmit}
            className="bg-white border-t border-gray-200 p-4 shadow-md"
          >
            <div className="flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Écrivez votre message..."
                className="flex-grow px-5 py-3 bg-[#f5f7fa] border border-gray-300 rounded-l-full text-[#0a2463] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] focus:border-transparent"
                disabled={processing.current}
              />
              <button
                type="submit"
                className="bg-[#0a2463] hover:bg-[#1e3a8a] text-white px-6 py-3 rounded-r-full transition-all duration-300 shadow-md"
                disabled={processing.current || !inputText.trim()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </form>

          <div className="bg-[#0a2463] p-4 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    isSpeaking
                      ? "bg-[#3d9970] text-white animate-pulse shadow-lg"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {isSpeaking ? "🎤" : "🔇"}
                </div>
                <span className="text-sm font-medium text-white">
                  {isSpeaking
                    ? "Parole détectée"
                    : isListening
                    ? isTTSPlaying
                      ? "Assistant parle (vous pouvez interrompre)"
                      : "En attente de parole..."
                    : "Microphone désactivé"}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={toggleManualRecording}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isManualRecording
                      ? "bg-[#e63946] text-white shadow-lg"
                      : "bg-[#ff9000] text-white shadow-lg"
                  }`}
                >
                  {isManualRecording ? "■ Stop" : "● REC"}
                </button>
                <button
                  onClick={toggleListening}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isListening
                      ? "bg-[#e63946] text-white shadow-lg"
                      : "bg-[#3d9970] text-white shadow-lg"
                  }`}
                >
                  {isListening ? <BiMicrophoneOff /> : <FaMicrophone />}
                </button>
              </div>
            </div>
            <div className="w-full h-3 bg-[#1e3a8a] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  isSpeaking
                    ? "bg-[#3d9970]"
                    : isTTSPlaying
                    ? "bg-[#ff9000]"
                    : isListening
                    ? "bg-[#ff9000]"
                    : "bg-gray-600"
                }`}
                style={{ width: `${Math.min(volume * 200, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="fixed top-0 right-0 h-full">
          <button
            className="fixed right-12 z-50 top-1/2 transform -translate-y-1/2 bg-[#0a2463] text-white p-3 rounded-l-lg shadow-lg hover:bg-[#1e3a8a] transition-all duration-300"
            onClick={() => {
              const panel = document.getElementById("techPanel");
              if (panel) {
                panel.classList.toggle("translate-x-full");
                panel.classList.toggle("translate-x-0");
              }
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
          <div
            id="techPanel"
            className="w-full md:w-96 h-full bg-white border-l border-gray-200 shadow-2xl overflow-y-auto transform translate-x-full transition-transform duration-300 ease-in-out fixed right-0 top-0 z-40"
          >
            <div className="p-5 bg-[#0a2463] text-white">
              <h2 className="text-lg font-bold font-['Montserrat',sans-serif]">
                Panneau Technique
              </h2>
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Sélection de voix
              </h3>
              <div className="space-y-2">
                {availableVoices.map((voice) => (
                  <div key={voice.id} className="flex items-center">
                    <input
                      type="radio"
                      id={voice.id}
                      name="voice"
                      value={voice.id}
                      checked={selectedVoice === voice.id}
                      onChange={() => setSelectedVoice(voice.id)}
                      className="mr-2 accent-[#0a2463]"
                    />
                    <label
                      htmlFor={voice.id}
                      className={`cursor-pointer ${
                        selectedVoice === voice.id
                          ? "text-[#0a2463] font-medium"
                          : "text-gray-600"
                      }`}
                    >
                      {voice.name}
                    </label>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  if (selectedVoice && !processing.current) {
                    speakResponse(
                      "Ceci est un test de la voix sélectionnée. Vous pouvez m'interrompre en parlant pendant que je vous réponds."
                    );
                  }
                }}
                className="mt-4 w-full bg-[#0a2463] hover:bg-[#1e3a8a] text-white py-2 px-4 rounded-lg transition-all duration-300 shadow-md"
              >
                Tester la voix
              </button>
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Vitesse de la voix
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vitesse: {playbackRate.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Calibration Microphone
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seuil de détection: {threshold.toFixed(4)}
                  {autoThresholdRef.current !== threshold &&
                    " (Ajusté manuellement)"}
                </label>
                <input
                  type="range"
                  min="0.001"
                  max="0.1"
                  step="0.001"
                  value={threshold}
                  onChange={handleThresholdChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              {isListening && !isCalibrating && (
                <button
                  onClick={calibrateMicrophone}
                  className="w-full px-4 py-2.5 rounded-md font-medium bg-[#ff9000] hover:bg-[#e67e00] text-white transition-all duration-300 shadow-md"
                >
                  Recalibrer microphone
                </button>
              )}
              {isCalibrating && (
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-[#ff9000] h-2.5 rounded-full"
                    style={{ width: `${calibrationProgress}%` }}
                  ></div>
                  <p className="text-xs text-gray-500 mt-1">
                    Calibration: {calibrationProgress.toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Paramètres d'interruption
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seuil d'interruption: {(threshold * 1.5).toFixed(4)}
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  (Automatiquement défini à 1.5x le seuil normal)
                </p>
              </div>
              <div className="mt-4">
                <div className="flex items-center space-x-2">
                  <div
                    className={`h-4 w-4 rounded-full ${
                      isTTSAudioPlayingRef.current
                        ? "bg-[#3d9970]"
                        : "bg-gray-300"
                    }`}
                  ></div>
                  <span className="text-sm text-gray-700">
                    Détection d'interruption{" "}
                    {isTTSAudioPlayingRef.current ? "active" : "inactive"}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                États de détection
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-100 rounded-xl">
                  <div className="text-xs font-medium mb-2 text-gray-700">
                    État de parole:
                  </div>
                  <div className="flex justify-center">
                    <span
                      className={`w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full ${
                        speechBooleanState === 1
                          ? "bg-[#3d9970] text-white"
                          : "bg-gray-300 text-gray-600"
                      }`}
                    >
                      {speechBooleanState}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-gray-100 rounded-xl">
                  <div className="text-xs font-medium mb-2 text-gray-700">
                    Fins de parole:
                  </div>
                  <div className="flex justify-center">
                    <span className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full bg-[#0a2463] text-white">
                      {speechEndCount}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Transcriptions
              </h3>
              {transcriptions.length === 0 ? (
                <p className="text-gray-500 italic text-sm">
                  Aucune transcription pour le moment
                </p>
              ) : (
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {transcriptions.map((trans) => (
                    <div
                      key={trans.id}
                      className="p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-medium text-[#1e3a8a]">
                          Transcription
                        </span>
                        <span className="text-xs text-gray-500">
                          {trans.timestamp}
                        </span>
                      </div>
                      <p className="text-gray-800">{trans.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Audios générés
              </h3>
              {audioUrls.length === 0 ? (
                <p className="text-gray-500 italic text-sm">
                  Aucun audio généré pour le moment
                </p>
              ) : (
                <div className="space-y-3">
                  {audioUrls.map((url, index) => (
                    <div key={index} className="mb-2">
                      <audio
                        src={url}
                        controls
                        className="w-full h-10 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
                Informations de débogage
              </h3>
              <div className="text-xs space-y-2 bg-gray-100 p-3 rounded-lg text-gray-700">
                <p>Volume actuel: {volume.toFixed(5)}</p>
                <p>Seuil actuel: {threshold.toFixed(5)}</p>
                <p>
                  Seuil après première détection: {(threshold * 0.8).toFixed(5)}
                </p>
                <p>Seuil d'interruption: {(threshold * 1.5).toFixed(5)}</p>
                <p>
                  Première parole détectée:{" "}
                  {firstSpeechDetectedRef.current ? "Oui" : "Non"}
                </p>
                <p>Durée minimale parole: {minSpeechDuration}ms</p>
                <p>Silence avant fin: {silenceTimeout}ms</p>
                <p>
                  TTS en cours: {isTTSAudioPlayingRef.current ? "Oui" : "Non"}
                </p>
                <p>Interruption récente: {wasInterrupted ? "Oui" : "Non"}</p>
              </div>
            </div>
            <div className="p-5">
              <button
                onClick={resetCounters}
                className="w-full px-4 py-3 rounded-lg font-medium bg-[#0a2463] hover:bg-[#1e3a8a] text-white transition-all duration-300 shadow-md"
              >
                Réinitialiser les compteurs
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SpeechDetectorClaude;
