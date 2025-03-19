import React, { useEffect, useState, useRef } from "react";
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
  silenceThreshold = 0.01, // Valeur par défaut plus basse
  // silenceTimeout = 500,
  silenceTimeout = 300,
  minSpeechDuration = 100, // Réduit à 100ms au lieu de 200ms
}) => {
  const [volume, setVolume] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechBooleanState, setSpeechBooleanState] = useState<number>(0);
  const [speechEndCount, setSpeechEndCount] = useState<number>(0);
  // @ts-ignore
  const [lastEndTime, setLastEndTime] = useState<string>("");
  // @ts-ignore

  const [endNotification, setEndNotification] = useState<boolean>(false);
  // @ts-ignore

  const [recordingEnded, setRecordingEnded] = useState(false);
  const [transcriptions, setTranscriptions] = useState<
    { id: string; text: string; timestamp: string }[]
  >([]);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(silenceThreshold);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [allowInterruption, setAllowInterruption] = useState<boolean>(false);
  // Nouvelles références pour la calibration
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
  const MAX_HISTORY_LENGTH = 10; // Augmenté pour un meilleur lissage
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const firstSpeechDetectedRef = useRef<boolean>(false);
  const graceTimeoutRef = useRef<number | null>(null);

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

  // Fonction pour calibrer automatiquement le seuil
  const calibrateMicrophone = () => {
    setIsCalibrating(true);
    noiseFloorRef.current = [];
    calibrationTimeRef.current = Date.now();

    const calibrationInterval = setInterval(() => {
      const elapsed = Date.now() - (calibrationTimeRef.current || 0);
      const progress = Math.min(elapsed / 3000, 1); // 3 secondes de calibration
      setCalibrationProgress(progress * 100);

      if (progress >= 1) {
        clearInterval(calibrationInterval);
        finishCalibration();
      }
    }, 100);
  };

  const finishCalibration = () => {
    if (noiseFloorRef.current.length > 0) {
      // Calculer la moyenne et l'écart-type du bruit de fond
      const sum = noiseFloorRef.current.reduce((a, b) => a + b, 0);
      const mean = sum / noiseFloorRef.current.length;

      const variance =
        noiseFloorRef.current.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        noiseFloorRef.current.length;
      const stdDev = Math.sqrt(variance);

      // Définir le seuil à la moyenne + 2x écart-type (capturera ~95% du bruit)
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

      // Ajouter au message history
      if (messageHistory.current.length === 0) {
        const systemPrompt = {
          role: "system",
          content: `Adopte le role de dieu , le connaisseur universel . reponse en maximum 80 mots`,
        };
        messageHistory.current = [systemPrompt];
      }

      messageHistory.current = [
        ...messageHistory.current,
        { role: "user", content },
      ];

      setMessages((prev) => [...prev, userMessage]);
      setError("");

      // Jouer un son d'attente
      const waitingAudio = new Audio("/no_input.mp3"); // Remplace par le chemin vers ton son
      waitingAudio.loop = true; // Pour que le son se répète tant que la réponse n'est pas prête
      waitingAudio.volume = 0.3; // Volume plus bas pour ne pas être trop intrusif
      waitingAudio.play();

      // Appel API
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
            model: "llama-3.1-8b-instant",
            // model: "llama3-70b-8192",
          }),
        }
      );

      // Arrêter le son d'attente
      waitingAudio.pause();
      waitingAudio.currentTime = 0;

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

  // const speakResponse = async (text: string) => {
  //   try {
  //     const response = await fetch("https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ text: text, voice: "fr-FR-DeniseNeural" }),
  //     });

  //     if (!response.ok) {
  //       throw new Error("Échec de la génération de l'audio.");
  //     }

  //     const audioBlob = await response.blob();
  //     const audioUrl = URL.createObjectURL(audioBlob);

  //     setAudioUrls(prev => [...prev, audioUrl]);

  //     const audio = document.createElement("audio");
  //     audio.src = audioUrl;
  //     audio.controls = true;
  //     document.body.appendChild(audio);

  //     // Indiquer que l'audio est en cours de lecture
  //     setIsAudioPlaying(true);

  //     // Lecture automatique
  //     audio.play();

  //     // Si l'interruption est autorisée, ajouter un observateur
  //     if (allowInterruption) {
  //       const observer = new MutationObserver(() => {
  //         if (speechBooleanStateRef.current === 1) {
  //           if (!audio.paused) {
  //             audio.pause();
  //             audio.currentTime = 0;
  //             setIsAudioPlaying(false);
  //           }
  //         }
  //       });
  //       observer.observe(document.body, { attributes: true, childList: true, subtree: true });

  //       // Nettoyer l'observateur quand l'audio se termine
  //       audio.onended = () => {
  //         observer.disconnect();
  //         setIsAudioPlaying(false);
  //       };
  //     } else {
  //       // Si l'interruption n'est pas autorisée, désactiver l'enregistrement pendant la lecture
  //       const wasRecording = isRecordingRef.current;
  //       if (wasRecording) {
  //         stopRecording();
  //       }

  //       // Réactiver l'enregistrement une fois l'audio terminé
  //       audio.onended = () => {
  //         setIsAudioPlaying(false);
  //         if (wasRecording && isListening) {
  //           setTimeout(() => {
  //             if (isListening) startRecording();
  //           }, 300);
  //         }
  //       };
  //     }
  //   } catch (error) {
  //     console.error("Erreur lors de la lecture du TTS:", error);
  //     setIsAudioPlaying(false);
  //   }
  // };
  const speakResponse = async (text: string) => {
    try {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("speed", "1.0");

      // // Charger le fichier MP3 en tant que Blob
      const responsez = await fetch("/macron.wav"); // 📌 Assurez-vous que kevin.mp3 est dans `public/`
      const blob = await responsez.blob();
      const file = new File([blob], "macron.wav", { type: "audio/mpeg" });
      formData.append("voice_file", file); // ✅ Envoyer en tant que FICHIER

      const response = await fetch(
        "http://localhost:8020/synthesize_with_upload/",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Échec de la génération de l'audio.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Ajouter l'URL à notre liste
      setAudioUrls((prev) => [...prev, audioUrl]);

      // Créer un élément <audio> et l'ajouter au DOM
      const audio = document.createElement("audio");
      audio.src = audioUrl;
      audio.controls = true;
      document.body.appendChild(audio);

      // Lecture automatique
      audio.play();

      // Variable pour suivre le délai de validation
      let speechStartTimeout: number | null = null;

      // Fonction pour arrêter l'audio
      const stopAudioOnSpeech = () => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      };

      // Observer avec délai de validation
      const observer = new MutationObserver(() => {
        if (speechBooleanStateRef.current === 1) {
          if (!speechStartTimeout) {
            speechStartTimeout = window.setTimeout(() => {
              stopAudioOnSpeech();
              speechStartTimeout = null;
            }, 500); // Exige 500ms de parole continue avant d'arrêter l'audio
          }
        } else {
          // Réinitialiser le timeout si la parole s'arrête
          if (speechStartTimeout) {
            clearTimeout(speechStartTimeout);
            speechStartTimeout = null;
          }
        }
      });

      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });

      // Nettoyage lorsque l'audio se termine
      audio.onended = () => {
        observer.disconnect();
        if (speechStartTimeout) {
          clearTimeout(speechStartTimeout);
        }
      };
    } catch (error) {
      console.error("Erreur lors de la lecture du TTS:", error);
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

      // Même les audios courts peuvent contenir des mots, on abaisse le seuil
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
        // NOUVELLE CONDITION: Vérifier que la transcription n'est pas juste des points, des sons courts, etc.
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

  // Fonction de lissage exponentiel pour le volume
  const smoothVolume = (newVolume: number): number => {
    // Alpha plus élevé donne plus de poids aux nouvelles valeurs (0-1)
    const alpha = 0.3;

    if (volumeHistory.current.length === 0) {
      volumeHistory.current.push(newVolume);
      return newVolume;
    }

    // Moyenne pondérée exponentielle
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
      // Création de l'AudioContext
      audioContextRef.current = await audioContext({ sampleRate: 16000 });

      // Activation du microphone
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Création de la source audio à partir du microphone
      sourceRef.current = audioContextRef.current.createMediaStreamSource(
        streamRef.current
      );

      // Création du filtre passe-bande optimisé pour la voix humaine
      const bandPassFilter = audioContextRef.current.createBiquadFilter();
      bandPassFilter.type = "bandpass";
      bandPassFilter.frequency.value = 300; // Centre ajusté pour mieux capter la voix
      bandPassFilter.Q.value = 0.8; // Bande plus large pour capter plus de fréquences vocales

      // Ajouter un gain pour amplifier légèrement le signal
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 1.2; // Amplification légère

      // Création de l'analyseur pour les fréquences
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      frequencyDataRef.current = new Uint8Array(
        analyserRef.current.frequencyBinCount
      );

      // Chaîne de traitement: source -> gain -> filtre -> analyseur
      sourceRef.current.connect(gainNode);
      gainNode.connect(bandPassFilter);
      bandPassFilter.connect(analyserRef.current);

      // Chargement du Worklet pour mesurer le volume
      const vuWorkletName = "speech-detector-vu-meter";
      await audioContextRef.current.audioWorklet.addModule(
        URL.createObjectURL(
          new Blob(
            [`registerProcessor("${vuWorkletName}", ${VolMeterWorket})`],
            { type: "application/javascript" }
          )
        )
      );

      // Création du Worklet pour mesurer le volume
      vuWorkletRef.current = new AudioWorkletNode(
        audioContextRef.current,
        vuWorkletName
      );

      // Connexion du traitement au Worklet
      bandPassFilter.connect(vuWorkletRef.current);

      // Démarrer la calibration automatique
      calibrateMicrophone();
      firstSpeechDetectedRef.current = false;

      // Gestion de la détection vocale avec sensibilité progressive
      vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
        const rawVolume = ev.data.volume;

        // Pendant la calibration, collecter les données de bruit
        if (isCalibrating) {
          noiseFloorRef.current.push(rawVolume);
          return;
        }

        // Si l'audio est en cours de lecture et que l'interruption n'est pas autorisée,
        // ne pas traiter la détection vocale
        if (isAudioPlaying && !allowInterruption) {
          return;
        }

        // Appliquer le lissage exponentiel
        const smoothedVolume = smoothVolume(rawVolume);
        setVolume(smoothedVolume);
        if (onVolumeChange) onVolumeChange(smoothedVolume);

        // Vérifier les fréquences pour s'assurer qu'il s'agit de voix humaine
        if (analyserRef.current && frequencyDataRef.current) {
          analyserRef.current.getByteFrequencyData(frequencyDataRef.current);

          // Analyse des fréquences (85-255 Hz pour voix grave, 165-400 Hz pour voix médium)
          const voiceFrequencyData = Array.from(
            frequencyDataRef.current.slice(3, 25)
          );
          const hasVoiceFrequency = voiceFrequencyData.some((val) => val > 80);

          // Seuil dynamique basé sur si on a déjà détecté la parole
          let currentThreshold = threshold;

          // Une fois que la parole a été détectée une première fois, on peut baisser le seuil
          // pour mieux capter la continuation de la parole
          if (firstSpeechDetectedRef.current) {
            currentThreshold = threshold * 0.8; // 20% plus sensible après la première détection
          }

          const now = Date.now();

          if (smoothedVolume > currentThreshold && hasVoiceFrequency) {
            silenceCountRef.current = 0;

            // Si la parole reprend pendant la période de grâce, annuler le timeout
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
                // Validation plus rapide après la première détection
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
            // Annuler la validation si le son s'arrête
            if (speechValidationRef.current) {
              clearTimeout(speechValidationRef.current);
              speechValidationRef.current = null;
            }

            silenceCountRef.current += 1;

            // Arrêt de l'enregistrement après une période de silence
            // Différence: moins de silence nécessaire pour arrêter si on a déjà parlé
            const silenceThreshold = firstSpeechDetectedRef.current ? 40 : 50;

            if (
              speechBooleanStateRef.current === 1 &&
              silenceCountRef.current > silenceThreshold
            ) {
              // Ajouter une logique de temps de grâce
              if (!graceTimeoutRef.current) {
                graceTimeoutRef.current = window.setTimeout(() => {
                  if (isRecordingRef.current) {
                    stopRecording();
                  }
                  silenceCountRef.current = 0;
                  graceTimeoutRef.current = null;
                }, 500); // 500ms de grâce pour les pauses
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

    if (isRecordingRef.current) {
      stopRecording();
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
  // @ts-ignore
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>("");

  const handleTextSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputText.trim()) {
      handleMessageSubmission(inputText);
      setInputText("");
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden relative">
      {/* Chat principal - occupe la majorité de l'écran */}
      <div className="w-full flex flex-col h-full">
        {/* En-tête */}
        <div className="bg-white p-4 border-b shadow-sm">
          <h1 className="text-xl font-bold text-gray-800">Assistant Médical</h1>

          <button
            onClick={toggleListening}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              isListening
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-green-500 hover:bg-green-600 text-white"
            }`}
          >
            {isListening ? "Arrêter l'écoute" : "Commencer l'écoute"}
          </button>
          <button
            className=" bg-gray-800 text-white p-2 rounded-l-lg shadow-md"
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
          {isListening && !isCalibrating && (
            <button
              onClick={calibrateMicrophone}
              className="px-3 py-2 rounded-md font-medium bg-yellow-400 hover:bg-yellow-500 text-white"
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
              </svg>{" "}
            </button>
          )}
          <div className="flex items-center space-x-2 mt-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isListening ? "bg-green-500 animate-pulse" : "bg-gray-400"
              }`}
            ></div>
            <span className="text-sm font-medium text-gray-600">
              {isListening ? "Microphone actif" : "Microphone inactif"}
            </span>
            {isTranscribing && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-2">
                Transcription en cours...
              </span>
            )}
          </div>
        </div>

        {/* Zone de conversation avec défilement */}
        <div
          className="flex-grow overflow-y-auto p-4 bg-gray-50"
          style={{ scrollBehavior: "smooth" }}
        >
          {error && (
            <div className="p-3 mb-3 bg-red-50 text-red-700 rounded border border-red-200">
              {error}
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`p-4 my-2 rounded-lg max-w-[80%] shadow-sm ${
                msg.role === "user"
                  ? "bg-blue-100 ml-auto"
                  : "bg-white border border-gray-200"
              }`}
            >
              <div className="flex justify-between mb-1">
                <span
                  className={`text-xs font-bold ${
                    msg.role === "user" ? "text-blue-700" : "text-gray-700"
                  }`}
                >
                  {msg.role === "user" ? "Vous" : "Assistant Médical"}
                </span>
                <span className="text-xs text-gray-500">{msg.timestamp}</span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </p>
            </div>
          ))}
          <div ref={messagesEndRef}></div>
        </div>
        {/* Zone de saisie de texte */}
        <form onSubmit={handleTextSubmit} className="bg-white border-t p-4">
          <div className="flex items-center mb-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Écrivez votre message..."
              className="flex-grow px-4 py-2 border rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              disabled={processing.current}
            />
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-r-lg"
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

        {/* Zone d'indicateur de parole */}
        <div className="bg-white border-t p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  isSpeaking
                    ? "bg-green-500 text-white animate-pulse"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {isSpeaking ? "🎤" : "🔇"}
              </div>
              <span className="text-sm font-medium">
                {isSpeaking
                  ? "Parole détectée"
                  : isListening
                  ? "En attente de parole..."
                  : "Microphone désactivé"}
              </span>
            </div>
            <button
              onClick={toggleListening}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                isListening
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {isListening ? "Arrêter l'écoute" : "Commencer l'écoute"}
            </button>
          </div>

          {/* Barre de volume */}
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                isSpeaking
                  ? "bg-green-500"
                  : isListening
                  ? "bg-blue-400"
                  : "bg-gray-400"
              }`}
              style={{ width: `${Math.min(volume * 200, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Panneau technique latéral - collapsible */}
      <div className="fixed top-0 right-0 h-full">
        {/* Bouton pour ouvrir/fermer le panneau */}
        {/* Dans la zone des contrôles ou le panneau technique */}

        <button
          className="fixed right-12 z-55 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white p-2 rounded-l-lg shadow-md"
          onClick={() => {
            const panel = document.getElementById("techPanel");
            if (panel) {
              panel.classList.toggle("translate-x-full");
              panel.classList.toggle("translate-x-0");
            }
          }}
        >
          {/* Icône d'engrenage */}
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

        {/* Panneau technique */}
        <div
          id="techPanel"
          className="w-96 h-full bg-white border-l shadow-lg overflow-y-auto transform translate-x-full transition-transform duration-300 ease-in-out fixed right-0 top-0 z-40"
        >
          <div className="p-4 bg-gray-800 text-white">
            <h2 className="text-lg font-bold">Panneau Technique</h2>
          </div>
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">
              Options de conversation
            </h3>
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={allowInterruption}
                    onChange={() => setAllowInterruption(!allowInterruption)}
                  />
                  <div
                    className={`block w-14 h-8 rounded-full ${
                      allowInterruption ? "bg-green-400" : "bg-gray-300"
                    }`}
                  ></div>
                  <div
                    className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                      allowInterruption ? "transform translate-x-6" : ""
                    }`}
                  ></div>
                </div>
                <div className="ml-3 text-sm font-medium">
                  {allowInterruption
                    ? "Interruption autorisée"
                    : "Pas d'interruption"}
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {allowInterruption
                ? "L'assistant s'arrêtera de parler quand vous commencerez à parler"
                : "L'assistant finira de parler même si vous commencez à parler"}
            </p>
          </div>
          {/* Calibration */}
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">
              Calibration Microphone
            </h3>

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-3 py-2 rounded-md font-medium bg-yellow-400 hover:bg-yellow-500 text-white"
              >
                Recalibrer microphone
              </button>
            )}

            {isCalibrating && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div
                  className="bg-yellow-400 h-2.5 rounded-full"
                  style={{ width: `${calibrationProgress}%` }}
                ></div>
                <p className="text-xs text-gray-500 mt-1">
                  Calibration: {calibrationProgress.toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {/* États de détection */}
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">États de détection</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-100 rounded-lg">
                <div className="text-xs font-medium mb-1">État de parole:</div>
                <div className="flex justify-center">
                  <span
                    className={`w-10 h-10 flex items-center justify-center text-xl font-bold rounded-full ${
                      speechBooleanState === 1
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {speechBooleanState}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-gray-100 rounded-lg">
                <div className="text-xs font-medium mb-1">Fins de parole:</div>
                <div className="flex justify-center">
                  <span className="w-10 h-10 flex items-center justify-center text-xl font-bold rounded-full bg-purple-500 text-white">
                    {speechEndCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transcriptions */}
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">Transcriptions</h3>
            {transcriptions.length === 0 ? (
              <p className="text-gray-500 italic text-sm">
                Aucune transcription pour le moment
              </p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {transcriptions.map((trans) => (
                  <div
                    key={trans.id}
                    className="p-2 bg-gray-50 border rounded text-sm"
                  >
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium">Transcription</span>
                      <span className="text-xs text-gray-500">
                        {trans.timestamp}
                      </span>
                    </div>
                    <p>{trans.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audios générés */}
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">Audios générés</h3>
            {audioUrls.length === 0 ? (
              <p className="text-gray-500 italic text-sm">
                Aucun audio généré pour le moment
              </p>
            ) : (
              <div className="space-y-2">
                {audioUrls.map((url, index) => (
                  <div key={index} className="mb-2">
                    <audio src={url} controls className="w-full h-8" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Informations de débogage */}
          <div className="p-4 border-b">
            <h3 className="text-md font-semibold mb-2">
              Informations de débogage
            </h3>
            <div className="text-xs space-y-1 bg-gray-50 p-2 rounded">
              <p>Volume actuel: {volume.toFixed(5)}</p>
              <p>Seuil actuel: {threshold.toFixed(5)}</p>
              <p>
                Seuil après première détection: {(threshold * 0.8).toFixed(5)}
              </p>
              <p>
                Première parole détectée:{" "}
                {firstSpeechDetectedRef.current ? "Oui" : "Non"}
              </p>
              <p>Durée minimale parole: {minSpeechDuration}ms</p>
              <p>Silence avant fin: {silenceTimeout}ms</p>
            </div>
          </div>

          {/* Bouton de réinitialisation */}
          <div className="p-4">
            <button
              onClick={resetCounters}
              className="w-full px-3 py-2 rounded-md font-medium bg-gray-600 hover:bg-gray-700 text-white"
            >
              Réinitialiser les compteurs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeechDetector;
