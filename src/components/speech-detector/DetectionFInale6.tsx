//@ts-nocheck
import React, { useEffect, useState, useRef } from "react";

// Extend the Window interface to include currentPlayingAudio
declare global {
  interface Window {
    currentPlayingAudio: HTMLAudioElement | null;
  }
}
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
  systemPrompta?: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}
//@ts-ignore
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

const DetectionFinal6: React.FC<SpeechDetectorProps> = ({
  onSpeechStart,
  onSpeechEnd,
  onVolumeChange,
  silenceThreshold = 0.01,
  // c'est ici que l'on peut changer le svariabels pour plsu de reactivbité
  silenceTimeout = 100, // Réduit de 300ms à 200ms
  minSpeechDuration = 50,
  systemPrompta,
}) => {
  const [isTTSPlaying, setIsTTSPlaying] = useState<boolean>(false);
  const [displayMode, setDisplayMode] = useState<"text" | "video">("text");
  const [volume, setVolume] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechBooleanState, setSpeechBooleanState] = useState<number>(0);
  const [isLoadingResponse, setIsLoadingResponse] = useState<boolean>(false);
  const [speechEndCount, setSpeechEndCount] = useState<number>(0);
  //@ts-ignore
  const [lastEndTime, setLastEndTime] = useState<string>("");
  //@ts-ignore
  const [endNotification, setEndNotification] = useState<boolean>(false);
  //@ts-ignore
  const [recordingEnded, setRecordingEnded] = useState(false);
  // Nouveaux états pour la détection d'interruption
  const [interruptionDetected, setInterruptionDetected] =
    useState<boolean>(false);
  const [interruptionCount, setInterruptionCount] = useState<number>(0);

  const [selectedVoice, setSelectedVoice] = useState<string>(
    "dc171287-77a6-49b4-b1a5-1c41360fb688"
  ); // Kevin par défaut
  const [transcriptions, setTranscriptions] = useState<
    { id: string; text: string; timestamp: string }[]
  >([]);
  const [isBackgroundMusicPlaying, setIsBackgroundMusicPlaying] =
    useState(false);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const [backgroundVolume, setBackgroundVolume] = useState(0.2); // 0.0 à 1.0
  const SYSTEM_PROMPT = `adopte le role de laora mon ancienne maitresse , 
  je suis remi ton ex amant .

À chaque message, tu t'exprimes en moins de 80 mots , chaleureuses et seductrices , tu m'aimes a la folie`;

  //@ts-ignore
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: SYSTEM_PROMPT,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [error, setError] = useState<string>("");
  const [threshold, setThreshold] = useState<number>(silenceThreshold);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);
  const [isManualRecording, setIsManualRecording] = useState<boolean>(false);

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
  // Nouveaux refs pour la détection d'interruption
  const lastSpeechTimeRef = useRef<number | null>(null);
  const interruptionTimeoutRef = useRef<number | null>(null);
  const interruptionThreshold = 200; // Durée minimale pour détecter une interruption (ms)
  const MAX_MANUAL_RECORDING_DURATION = 20 * 1000; // 30 secondes
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const isTTSAudioPlayingRef = useRef<boolean>(false);
  // Nouveau ref pour compter la stabilité de la parole
  const speechStabilityCountRef = useRef<number>(0);

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
      id: "dc171287-77a6-49b4-b1a5-1c41360fb688",
      name: "dart",
      api: "cartesia",
      voiceId: "dc171287-77a6-49b4-b1a5-1c41360fb688",
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
  const manualRecordingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    messageHistory.current = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
    ];
    // eslint-disable-next-line
  }, []);
  // Ajoutez cet useEffect dans votre composant
  useEffect(() => {
    // Cette fonction s'exécute chaque fois que interruptionDetected change
    if (interruptionDetected && window.currentPlayingAudio) {
      console.log("🚨 INTERRUPTION DÉTECTÉE - ARRÊT FORCÉ DE L'AUDIO");

      // Approche 1: Méthode standard
      window.currentPlayingAudio.pause();
      window.currentPlayingAudio.currentTime = 0;

      // Approche 2: Créer un nouvel élément audio (pour forcer l'arrêt)
      window.currentPlayingAudio.src = "";

      // Approche 3: Supprimer l'élément
      if (window.currentPlayingAudio.parentNode) {
        window.currentPlayingAudio.parentNode.removeChild(
          window.currentPlayingAudio
        );
      }

      // Mettre à jour les états
      isTTSAudioPlayingRef.current = false;
      setIsTTSPlaying(false);

      console.log("✅ Audio forcé à l'arrêt");
    }
  }, [interruptionDetected]);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  useEffect(() => {
    speechBooleanStateRef.current = speechBooleanState;
  }, [speechBooleanState]);
  // AudioManager pour garantir un seul audio à la fois
  const AudioManager = {
    currentAudio: null as HTMLAudioElement | null,

    play: function (url: string, playbackRate: number = 1.0) {
      // Si un audio est en cours, on l'arrête d'abord
      this.stopAll();

      // Créer le nouvel élément audio
      const audio = new Audio(url);
      audio.playbackRate = playbackRate;

      // Stocker la référence
      this.currentAudio = audio;
      window.currentPlayingAudio = audio;

      // Configurer les événements
      audio.onplay = () => {
        console.log("AudioManager: Lecture démarrée");
        setIsTTSPlaying(true);
        isTTSAudioPlayingRef.current = true;
      };

      audio.onended = () => {
        console.log("AudioManager: Lecture terminée");
        this.cleanup();
        URL.revokeObjectURL(url);
      };

      audio.onerror = (e) => {
        console.error("AudioManager: Erreur de lecture", e);
        this.cleanup();
        URL.revokeObjectURL(url);
      };

      // Lancer la lecture
      audio.play().catch((err) => {
        console.error("AudioManager: Impossible de démarrer la lecture", err);
        this.cleanup();
      });

      return audio;
    },

    stopAll: function () {
      console.log("AudioManager: Arrêt de tous les audios");

      // Arrêter l'audio courant s'il existe
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;

          // Revoke URL si c'est un Blob URL
          if (
            this.currentAudio.src &&
            this.currentAudio.src.startsWith("blob:")
          ) {
            URL.revokeObjectURL(this.currentAudio.src);
          }
        } catch (e) {
          console.error("AudioManager: Erreur lors de l'arrêt", e);
        }
      }

      // Nettoyer toutes les références
      this.cleanup();

      // Parcourir le DOM et arrêter tout autre audio en cours
      document.querySelectorAll("audio").forEach((audioElement) => {
        try {
          audioElement.pause();
          audioElement.currentTime = 0;
        } catch (e) {
          console.error(
            "AudioManager: Erreur lors de l'arrêt d'un élément DOM",
            e
          );
        }
      });
    },

    cleanup: function () {
      // Réinitialiser toutes les références et variables d'état
      this.currentAudio = null;
      window.currentPlayingAudio = null;
      setIsTTSPlaying(false);
      isTTSAudioPlayingRef.current = false;
    },
  };
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

  // Fonction pour détecter les interruptions
  // Variables pour la détection basée sur la durée
  //@ts-ignore
  const consecutiveSamplesNeeded = 5; // Environ 500ms si échantillonnage à 10Hz
  const highVolumeSamplesRef = useRef<number>(0);
  const lastHighVolumeTimeRef = useRef<number | null>(null);
  //@ts-ignore
  const interruptionDurationThreshold = 500; // Durée minimale en ms pour confirmer une interruption

  const detectInterruption = (currentVolume: number) => {
    // Constantes pour la détection - seuils optimisés
    const VOLUME_THRESHOLD = 0.06; // Abaissé pour une meilleure sensibilité
    const EXTREME_VOLUME_THRESHOLD = 0.2; // Abaissé pour détecter plus de cas limites

    // Logging pour volumes élevés
    if (currentVolume > 0.04) {
      console.log(
        "Volume:",
        currentVolume.toFixed(4),
        "TTS actif:",
        isTTSAudioPlayingRef.current
      );
    }

    // Détecter les interruptions uniquement lorsque le TTS est actif
    if (isTTSAudioPlayingRef.current) {
      const now = Date.now();

      // Analyse spectrale avancée
      let isExplosiveSound = false;
      let isDoorbell = false;
      let isWindNoise = false;
      let isLoudHumanVoice = false;
      let isSneeze = false;

      if (analyserRef.current && frequencyDataRef.current) {
        analyserRef.current.getByteFrequencyData(frequencyDataRef.current);

        // Récupération des données de bandes de fréquences
        const highFreqs = Array.from(frequencyDataRef.current.slice(30, 50));
        const midHighFreqs = Array.from(frequencyDataRef.current.slice(20, 30));
        const midFreqs = Array.from(frequencyDataRef.current.slice(15, 20));
        const lowMidFreqs = Array.from(frequencyDataRef.current.slice(8, 15));
        const lowFreqs = Array.from(frequencyDataRef.current.slice(2, 8));

        // Calcul de l'énergie par bande
        const highFreqEnergy =
          highFreqs.reduce((a, b) => a + b, 0) / highFreqs.length;
        const midHighFreqEnergy =
          midHighFreqs.reduce((a, b) => a + b, 0) / midHighFreqs.length;
        const midFreqEnergy =
          midFreqs.reduce((a, b) => a + b, 0) / midFreqs.length;
        const lowMidFreqEnergy =
          lowMidFreqs.reduce((a, b) => a + b, 0) / lowMidFreqs.length;
        const lowFreqEnergy =
          lowFreqs.reduce((a, b) => a + b, 0) / lowFreqs.length;

        // 1. DÉTECTION DE SONNETTE - Les sonnettes ont des fréquences moyennes-élevées soutenues
        const hasDoorbellPattern =
          midHighFreqEnergy > 60 &&
          midHighFreqEnergy > lowFreqEnergy * 1.5 &&
          midHighFreqEnergy > highFreqEnergy * 1.2;

        // Vérifier si les midHighFreqs ont un motif de pic typique d'une sonnette
        const hasTonePattern = midHighFreqs.some(
          (val, idx, arr) =>
            idx > 0 &&
            idx < arr.length - 1 &&
            val > 80 &&
            val > arr[idx - 1] * 1.3 &&
            val > arr[idx + 1] * 1.3
        );

        isDoorbell = hasDoorbellPattern && hasTonePattern;

        // 2. DÉTECTION D'ÉTERNUEMENT - Les éternuements ont des fréquences élevées explosives suivies de fréquences moyennes
        const hasInitialSpike =
          currentVolume > 0.12 &&
          volumeHistory.current.length > 2 &&
          currentVolume >
            volumeHistory.current[volumeHistory.current.length - 2] * 1.5;

        const hasTypicalSneezePattern =
          highFreqEnergy > 70 &&
          midFreqEnergy > 50 &&
          highFreqEnergy > lowFreqEnergy * 1.8;

        isSneeze = hasInitialSpike && hasTypicalSneezePattern;

        // 3. DÉTECTION DE SON EXPLOSIF (mais pas un éternuement)
        const freqRatio = highFreqEnergy / lowFreqEnergy;
        isExplosiveSound = hasInitialSpike && freqRatio > 1.2 && !isSneeze;

        // 4. DÉTECTION DE BRUIT DE VENT
        const frequencies = Array.from(frequencyDataRef.current.slice(1, 50));
        const mean =
          frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
        const variance =
          frequencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
          frequencies.length;
        const stdDev = Math.sqrt(variance);

        isWindNoise = stdDev < 12 && mean > 25; // Seuil plus strict

        // 5. DÉTECTION DE VOIX HUMAINE
        isLoudHumanVoice =
          lowFreqEnergy > 45 &&
          lowMidFreqEnergy > 40 &&
          lowFreqEnergy > midHighFreqEnergy * 0.7 &&
          !isExplosiveSound &&
          !isWindNoise &&
          !isDoorbell;

        // Logging amélioré pour le débogage
        if (currentVolume > VOLUME_THRESHOLD || isDoorbell || isSneeze) {
          console.log("Analyse sonore:", {
            volume: currentVolume.toFixed(3),
            freqRatio: freqRatio.toFixed(2),
            stdDev: stdDev.toFixed(2),
            highFreq: highFreqEnergy.toFixed(1),
            midHighFreq: midHighFreqEnergy.toFixed(1),
            midFreq: midFreqEnergy.toFixed(1),
            lowMidFreq: lowMidFreqEnergy.toFixed(1),
            lowFreq: lowFreqEnergy.toFixed(1),
            isDoorbell,
            isSneeze,
            isExplosiveSound,
            isWindNoise,
            isLoudHumanVoice,
          });
        }
      }

      // GESTION DES INTERRUPTIONS PRIORITAIRE

      // 1. VOLUME EXTRÊME - Interruption immédiate
      if (currentVolume > EXTREME_VOLUME_THRESHOLD) {
        console.log("🚨 VOLUME EXTRÊME DÉTECTÉ - INTERRUPTION IMMÉDIATE");
        AudioManager.stopAll();
        setInterruptionDetected(true);
        setInterruptionCount((prev) => prev + 1);
        highVolumeSamplesRef.current = 0;
        lastHighVolumeTimeRef.current = null;
        return;
      }

      // 2. SONNETTE - Interruption haute priorité
      if (isDoorbell && currentVolume > VOLUME_THRESHOLD * 0.8) {
        console.log("🔔 MOTIF DE SONNETTE DÉTECTÉ - INTERRUPTION");
        AudioManager.stopAll();
        setInterruptionDetected(true);
        setInterruptionCount((prev) => prev + 1);
        highVolumeSamplesRef.current = 0;
        lastHighVolumeTimeRef.current = null;
        return;
      }

      // 3. ÉTERNUEMENT - Priorité moyenne, interrompre si évident
      if (isSneeze && currentVolume > VOLUME_THRESHOLD) {
        console.log("🤧 ÉTERNUEMENT DÉTECTÉ - INTERRUPTION");
        AudioManager.stopAll();
        setInterruptionDetected(true);
        setInterruptionCount((prev) => prev + 1);
        highVolumeSamplesRef.current = 0;
        lastHighVolumeTimeRef.current = null;
        return;
      }

      // 4. SONS EXPLOSIFS - Peuvent être ignorés
      if (isExplosiveSound && currentVolume > VOLUME_THRESHOLD) {
        console.log("💥 Son explosif détecté - surveillance...");
        // Incrémenter le compteur mais avec moins de poids
        highVolumeSamplesRef.current += 0.5;
        return;
      }

      // 5. BRUIT DE VENT - Ignorer
      if (isWindNoise && currentVolume > VOLUME_THRESHOLD) {
        console.log("💨 Bruit de fond/vent détecté - ignoré");
        // Diminuer le compteur pour éviter les faux déclenchements
        highVolumeSamplesRef.current = Math.max(
          0,
          highVolumeSamplesRef.current - 0.5
        );
        return;
      }

      // 6. DÉTECTION DE VOIX STANDARD avec seuil adaptatif
      if (currentVolume > VOLUME_THRESHOLD) {
        // Initialiser pour le premier échantillon à volume élevé
        if (highVolumeSamplesRef.current === 0) {
          lastHighVolumeTimeRef.current = now;
          console.log("⏱️ Début possible d'interruption");
        }

        // Incrémenter le compteur (plus rapidement pour la voix humaine claire)
        highVolumeSamplesRef.current += isLoudHumanVoice ? 1.75 : 0.75;
        console.log(
          "📈 Compteur d'interruption:",
          highVolumeSamplesRef.current
        );

        // Vérifier l'interruption soutenue - seuil abaissé à 3.5 pour une réponse plus rapide
        if (highVolumeSamplesRef.current > 3.5) {
          console.log(
            "🚨 INTERRUPTION VOCALE confirmée après",
            highVolumeSamplesRef.current,
            "échantillons"
          );

          AudioManager.stopAll();
          setInterruptionDetected(true);
          setInterruptionCount((prev) => prev + 1);
          highVolumeSamplesRef.current = 0;
          lastHighVolumeTimeRef.current = null;
        }
      } else {
        // Volume sous le seuil - diminuer progressivement le compteur
        if (highVolumeSamplesRef.current > 0) {
          // Décroissance plus rapide pour une réinitialisation plus rapide
          highVolumeSamplesRef.current = Math.max(
            0,
            highVolumeSamplesRef.current - 0.75
          );

          // Réinitialiser si le silence persiste
          if (
            lastHighVolumeTimeRef.current &&
            now - lastHighVolumeTimeRef.current > 400
          ) {
            console.log("⏹️ Fin de détection - silence détecté");
            highVolumeSamplesRef.current = 0;
            lastHighVolumeTimeRef.current = null;
          }
        }
      }
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
      if (manualRecordingTimeoutRef.current) {
        clearTimeout(manualRecordingTimeoutRef.current);
        manualRecordingTimeoutRef.current = null;
      }
      stopRecording();
      setIsManualRecording(false);
    } else {
      // Interrompre le TTS s'il est en cours de lecture
      if (isTTSAudioPlayingRef.current) {
        console.log(
          "🔊 Interruption du TTS pour démarrer l'enregistrement manuel"
        );
        AudioManager.stopAll();

        // Vous pourriez ajouter un petit délai ici pour assurer que l'audio est bien arrêté
        setTimeout(() => {
          startManualRecordingWithFreshStream();
        }, 100);
      } else {
        // Pas de TTS en cours, démarrer directement l'enregistrement
        startManualRecordingWithFreshStream();
      }
    }
  };
  const playBackgroundMusic = () => {
    if (!backgroundMusicRef.current) {
      backgroundMusicRef.current = new Audio("/background.mp3");
      backgroundMusicRef.current.loop = true;
    }
    backgroundMusicRef.current.volume = backgroundVolume;
    backgroundMusicRef.current.play();
    setIsBackgroundMusicPlaying(true);
  };
  useEffect(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.volume = backgroundVolume;
    }
  }, [backgroundVolume]);

  const pauseBackgroundMusic = () => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      setIsBackgroundMusicPlaying(false);
    }
  };
  // Fonction auxiliaire pour démarrer l'enregistrement avec un flux frais
  const startManualRecordingWithFreshStream = () => {
    // Vérifier si le flux existe ET a des pistes actives
    const hasActiveStream =
      streamRef.current &&
      streamRef.current
        .getTracks()
        .some((track) => track.readyState === "live");

    if (hasActiveStream) {
      startRecording();
      setIsManualRecording(true);
      // Démarre le timer de limite de temps
      manualRecordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
        setIsManualRecording(false);
        // Optionnel : notification à l'utilisateur
        setEndNotification(true);
        setTimeout(() => setEndNotification(false), 2000);
      }, MAX_MANUAL_RECORDING_DURATION);
    } else {
      // Toujours obtenir un nouveau flux si le flux actuel n'existe pas ou est inactif
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
  };

  const finishCalibration = () => {
    if (noiseFloorRef.current.length > 0) {
      // Trier les valeurs et prendre le 90e percentile pour éliminer les valeurs aberrantes
      const sortedValues = [...noiseFloorRef.current].sort((a, b) => a - b);
      const p90Index = Math.floor(sortedValues.length * 0.9);
      //@ts-ignore
      const p90Value = sortedValues[p90Index];

      // Calculer la moyenne et l'écart-type des valeurs sous le 90e percentile
      const filteredValues = sortedValues.slice(0, p90Index);
      const sum = filteredValues.reduce((a, b) => a + b, 0);
      const mean = sum / filteredValues.length;
      const variance =
        filteredValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        filteredValues.length;
      const stdDev = Math.sqrt(variance);

      // Utiliser un seuil plus précis
      const newThreshold = Math.max(0.005, mean + stdDev * 2.5);
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

  // const handleMessageSubmission = async (content: string) => {
  //   if (processing.current) return;
  //   processing.current = true;
  //   try {
  //     const userMessage: Message = {
  //       role: "user",
  //       content,
  //       timestamp: new Date().toLocaleTimeString(),
  //     };
  //     if (messageHistory.current.length === 0) {
  //       if (systemPrompta) {
  //         const systemPrompt = {
  //           role: "system",
  //           content: systemPrompta,
  //         };
  //         messageHistory.current = [systemPrompt];
  //       }
  //     }
  //     messageHistory.current = [
  //       ...messageHistory.current,
  //       { role: "user", content },
  //     ];
  //     setMessages((prev) => [...prev, userMessage]);
  //     setError("");

  //     // Son d'attente
  //     const waitingAudio = new Audio("/no_input.mp3");
  //     waitingAudio.loop = true;
  //     waitingAudio.volume = 0.3;
  //     waitingAudio.play();

  //     const response = await fetch(
  //       "https://api.groq.com/openai/v1/chat/completions",
  //       {
  //         method: "POST",
  //         headers: {
  //           Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify({
  //           messages: messageHistory.current,
  //           model: "gemma2-9b-it",
  //         }),
  //       }
  //     );
  //     waitingAudio.pause();
  //     waitingAudio.currentTime = 0;

  //     if (!response.ok) {
  //       const errorData = await response.json();
  //       throw new Error(errorData.error?.message || "Erreur API");
  //     }
  //     const data: GroqResponse = await response.json();
  //     if (data.choices?.[0]?.message?.content) {
  //       const assistantContent = cleanLLMResponse(
  //         data.choices[0].message.content
  //       );

  //       const assistantMessage: Message = {
  //         role: "assistant",
  //         content: assistantContent,
  //         timestamp: new Date().toLocaleTimeString(),
  //       };
  //       messageHistory.current = [
  //         ...messageHistory.current,
  //         { role: "assistant", content: assistantContent },
  //       ];
  //       setMessages((prev) => [...prev, assistantMessage]);
  //       scrollToBottom();
  //       if (messageHistory.current.length > 20) {
  //         messageHistory.current = messageHistory.current.slice(-20);
  //       }
  //       if (typeof speakResponse === "function") {
  //         speakResponse(assistantContent);
  //       }
  //     }
  //   } catch (error: any) {
  //     console.error("Erreur:", error);
  //     setError(`Erreur: ${error.message}`);
  //   } finally {
  //     processing.current = false;
  //   }
  // };
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

      // Utilisation de l'API Mistral au lieu de Groq
      const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: messageHistory.current,
            model: "mistral-small-latest", // Ou "mistral-tiny-latest" si tu préfères
            temperature: 0.7,
            max_tokens: 500,
          }),
        }
      );
      waitingAudio.pause();
      waitingAudio.currentTime = 0;

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Erreur API");
      }

      const data = await response.json();
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

    // Arrêter tout audio en cours de lecture
    AudioManager.stopAll();

    // Réinitialiser l'état d'interruption
    setInterruptionDetected(false);
    lastSpeechTimeRef.current = null;

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
      return;
    }

    console.log(
      `Utilisation de la voix: ${selectedVoiceInfo.name} (${selectedVoiceInfo.api})`
    );

    try {
      let response;

      // Appeler l'API appropriée selon le type de voix sélectionnée
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
      setIsLoadingResponse(false);

      // Convertir la réponse en blob audio
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Ajouter l'URL à la liste des audios générés
      setAudioUrls((prev) => [...prev, audioUrl]);

      // Utiliser le gestionnaire audio pour lire l'audio
      AudioManager.play(audioUrl, playbackRate);

      // Mettre en place une surveillance des interruptions
      let interruptionCheckInterval = setInterval(() => {
        if (interruptionDetected) {
          console.log("🛑 Interruption détectée - arrêt immédiat de l'audio");
          AudioManager.stopAll();
          clearInterval(interruptionCheckInterval);
        }
      }, 100);
    } catch (error) {
      console.error("Erreur lors de la génération ou lecture du TTS:", error);
      AudioManager.cleanup();
    }
  };

  const sendAudioForTranscription = async (
    audioBlob: Blob
  ): Promise<TranscriptionResult | null> => {
    setIsLoadingResponse(true); // Activer le chargement

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
  const [currentTTSAudio, setCurrentTTSAudio] =
    useState<HTMLAudioElement | null>(null);

  const stopTTS = () => {
    AudioManager.stopAll();
  };

  const stopEverything = () => {
    // Arrêter le TTS
    AudioManager.stopAll();

    // Arrêter l'écoute du micro
    stopListening();

    // Arrêter l'enregistrement manuel si actif
    if (isManualRecording) {
      stopRecording();
      setIsManualRecording(false);
    }
  };

  const downloadConversation = () => {
    // Préparer le contenu du fichier texte
    let textContent = "Historique de conversation\n";
    textContent += "=========================\n\n";

    messages.forEach((msg) => {
      const role = msg.role === "user" ? "Vous" : "Assistant";
      textContent += `[${msg.timestamp || ""}] ${role}:\n${msg.content}\n\n`;
    });

    // Créer un blob pour le téléchargement
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Créer un lien de téléchargement temporaire
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `conversation-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;

    // Simuler un clic sur le lien pour lancer le téléchargement
    document.body.appendChild(downloadLink);
    downloadLink.click();

    // Nettoyer
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  const saveRecording = async (audioBlob: Blob) => {
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);

    // Vérification cruciale: Ne pas transcrire si un TTS est en cours
    if (isTTSAudioPlayingRef.current) {
      console.log("TTS en cours : transcription ignorée.");
      URL.revokeObjectURL(url);
      return;
    }

    audio.onloadedmetadata = async () => {
      const duration = audio.duration;
      console.log("🎤 Durée de l'audio:", duration, "secondes");
      if (duration < 0.5) {
        console.warn("⚠ Ignoré: Audio trop court (<0.5s)");
        URL.revokeObjectURL(url);
        return;
      }
      console.log("✅ Envoi de l'audio à la transcription");
      setIsTranscribing(true);
      const transcription = await sendAudioForTranscription(audioBlob);
      setIsTranscribing(false);
      if (transcription && transcription.text) {
        const transcriptionText = transcription.text.trim();

        //mots clefs pour arreter tout
        const stopPhrases = [
          "merci au revoir",
          "arrête tout",
          "stop tout",
          "au revoir",
          "stop écoute",
          "arrête l'écoute",
          "merci beaucoup au revoir",
          "fin de discussion",
          "Fin de discussion",
        ];

        if (stopPhrases.some((phrase) => transcriptionText.includes(phrase))) {
          console.log("🛑 Commande d'arrêt détectée:", transcriptionText);
          // Ajouter un message dans les transcriptions
          setTranscriptions((prev) => [
            ...prev,
            {
              id: `speech-${Date.now()}`,
              text: transcriptionText + " (Commande d'arrêt détectée)",
              timestamp: new Date().toLocaleTimeString(),
            },
          ]);

          // Déclencher l'arrêt complet
          stopEverything();

          // Éventuellement, ajouter un message de confirmation
          await speakResponse("D'accord, à bientôt!");

          return;
        }

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
            "⚠ Ignoré: Transcription non significative:",
            transcriptionText
          );
          URL.revokeObjectURL(url);
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
      URL.revokeObjectURL(url);
    };
  };

  useEffect(() => {
    // Cette fonction s'exécute chaque fois que interruptionDetected change
    if (interruptionDetected) {
      console.log("🚨 INTERRUPTION DÉTECTÉE - ARRÊT FORCÉ DE L'AUDIO");
      AudioManager.stopAll();
      console.log("✅ Audio forcé à l'arrêt");
    }
  }, [interruptionDetected]);

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
    if (manualRecordingTimeoutRef.current) {
      clearTimeout(manualRecordingTimeoutRef.current);
      manualRecordingTimeoutRef.current = null;
    }
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
    // Utiliser un alpha plus élevé pour une réaction plus rapide
    const alpha = 0.5; // Augmenté de 0.3 à 0.5
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
      speechStabilityCountRef.current = 0;
      vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
        const rawVolume = ev.data.volume;
        if (isCalibrating) {
          noiseFloorRef.current.push(rawVolume);
          return;
        }
        const smoothedVolume = smoothVolume(rawVolume);
        setVolume(smoothedVolume);
        if (onVolumeChange) onVolumeChange(smoothedVolume);

        // Appel à la fonction de détection d'interruption
        detectInterruption(smoothedVolume);

        // Le reste de la logique de détection de parole
        if (analyserRef.current && frequencyDataRef.current) {
          analyserRef.current.getByteFrequencyData(frequencyDataRef.current);

          // Amélioration de l'analyse des fréquences
          const voiceFrequencyData = Array.from(
            frequencyDataRef.current.slice(3, 25)
          );

          // Ajouter une analyse plus sophistiquée des fréquences
          const avgFrequency =
            voiceFrequencyData.reduce((sum, val) => sum + val, 0) /
            voiceFrequencyData.length;
          const stdDevFrequency = Math.sqrt(
            voiceFrequencyData.reduce(
              (sum, val) => sum + Math.pow(val - avgFrequency, 2),
              0
            ) / voiceFrequencyData.length
          );

          // Une voix humaine a généralement une distribution de fréquences plus variée qu'un bruit constant
          const hasVoiceFrequency =
            voiceFrequencyData.some((val) => val > 80) && stdDevFrequency > 15;

          let currentThreshold = threshold;
          if (firstSpeechDetectedRef.current) {
            currentThreshold = threshold * 0.8;
          }
          const now = Date.now();

          // Si le TTS est en cours, ne pas démarrer d'enregistrement
          if (
            !isTTSAudioPlayingRef.current &&
            smoothedVolume > currentThreshold &&
            hasVoiceFrequency
          ) {
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
                  // Ajouter un compteur de stabilité
                  if (!speechStabilityCountRef.current)
                    speechStabilityCountRef.current = 0;
                  speechStabilityCountRef.current++;

                  // Ne valider que si la parole est stable pendant plusieurs échantillons
                  if (speechStabilityCountRef.current >= 3) {
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
                      speechStabilityCountRef.current = 0;
                    }, validationDelay);
                  }
                }
              }
            }
          } else {
            if (speechValidationRef.current) {
              clearTimeout(speechValidationRef.current);
              speechValidationRef.current = null;
            }
            silenceCountRef.current += 1;

            // Utiliser un seuil adaptatif basé sur la durée de parole
            const silenceThreshold = firstSpeechDetectedRef.current
              ? Math.max(
                  20,
                  40 -
                    Math.min(
                      20,
                      Math.floor(
                        (now - (speechStartTimeRef.current || now)) / 1000
                      )
                    )
                )
              : 50;

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
                }, 300); // Réduit de 500ms à 300ms
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

  const cleanLLMResponse = (text: any) => {
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
    if (interruptionTimeoutRef.current) {
      clearTimeout(interruptionTimeoutRef.current);
      interruptionTimeoutRef.current = null;
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
    lastSpeechTimeRef.current = null;
    speechStabilityCountRef.current = 0;
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
    setInterruptionCount(0);
    setInterruptionDetected(false);
    hasSpokeRef.current = false;
    silenceCountRef.current = 0;
    firstSpeechDetectedRef.current = false;
    volumeHistory.current = [];
    lastSpeechTimeRef.current = null;
    speechStabilityCountRef.current = 0;
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
        {/* Indicateur d'interruption */}
        {interruptionDetected && (
          <div className="fixed top-4 right-4 bg-[#e63946] text-white px-4 py-2 rounded-lg shadow-lg animate-pulse z-50">
            Interruption détectée !
          </div>
        )}

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
                <div className="relative w-full h-full">
                  {isTTSPlaying ? (
                    <video
                      key="speaking-video"
                      src="/dart2.mp4"
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <video
                      key="idle-video"
                      src="/dart1.mp4"
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  )}
                  <div className="absolute bottom-2 w-full flex justify-center">
                    <button
                      onClick={toggleManualRecording}
                      className={`px-5 w-20 h-20 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                        isManualRecording
                          ? "bg-[#e63946]  text-white shadow-lg"
                          : "bg-[#ff9000]  text-white shadow-lg"
                      }`}
                    >
                      {isManualRecording ? "■" : "●"}
                    </button>
                    <button
                      onClick={toggleListening}
                      className={`px-5 py-2.5 w-20 h-20 ml-5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                        isListening
                          ? "bg-[#e63946] text-white shadow-lg"
                          : "bg-[#3d9970] text-white shadow-lg"
                      }`}
                    >
                      {isListening ? <BiMicrophoneOff /> : <FaMicrophone />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Après les messages */}
          {isLoadingResponse && (
            <div className="w-full h-full fixed z-[55] top-0 left-0 rounded-2xl bg-white border border-gray-200 text-[#0a2463] ">
              <div className="flex items-center space-x-2">
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></div>
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "600ms" }}
                ></div>
                <span className="text-sm text-gray-500 ml-2">
                  Raël réfléchit...
                </span>
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

          <div className="fixed top-0 right-0 h-full">
            <div
              id="techPanel"
              className="w-full md:w-96 h-full bg-white border-l border-gray-200 shadow-2xl overflow-y-auto transform translate-x-full transition-transform duration-300 ease-in-out fixed right-0 top-0 z-40"
            >
              <div className="flex justify-around items-center p-5 bg-[#0a2463] text-white">
                <h2 className="text-lg font-bold font-['Montserrat',sans-serif]">
                  Panneau Technique
                </h2>
                <div className="flex space-x-3">
                  <button
                    className="bg-[#1e3a8a] text-white p-2.5 rounded-full shadow-lg hover:bg-[#2a4494] transition-all duration-300"
                    onClick={downloadConversation}
                    title="Télécharger la conversation"
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
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </button>

                  {/* Vos autres boutons existants */}
                </div>
                <button
                  onClick={() => {
                    if (isBackgroundMusicPlaying) {
                      pauseBackgroundMusic();
                    } else {
                      playBackgroundMusic();
                    }
                  }}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                    isBackgroundMusicPlaying
                      ? "bg-[#3d9970] text-white shadow-lg"
                      : "bg-[#0a2463] text-white shadow-lg"
                  }`}
                >
                  {isBackgroundMusicPlaying ? "Pause musique" : "Jouer musique"}
                </button>
                <button
                  className="bg-[#0a2463] text-white p-3 rounded-l-lg shadow-lg hover:bg-[#1e3a8a] transition-all duration-300"
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
              </div>

              <div className="p-5 border-b border-gray-200">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Volume musique de fond :{" "}
                    {(backgroundVolume * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={backgroundVolume}
                    onChange={(e) =>
                      setBackgroundVolume(Number(e.target.value))
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
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
                        "Ceci est un test de la voix sélectionnée. Comment puis-je vous aider aujourd'hui?"
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
                    onChange={(e) =>
                      setPlaybackRate(parseFloat(e.target.value))
                    }
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

                {/* Section pour le compteur d'interruptions */}
                <div className="mt-4 p-4 bg-gray-100 rounded-xl">
                  <div className="text-xs font-medium mb-2 text-gray-700">
                    Nombre d'interruptions:
                  </div>
                  <div className="flex justify-center">
                    <span className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full bg-[#e63946] text-white">
                      {interruptionCount}
                    </span>
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
                    Seuil après première détection:{" "}
                    {(threshold * 0.8).toFixed(5)}
                  </p>
                  <p>
                    Première parole détectée:{" "}
                    {firstSpeechDetectedRef.current ? "Oui" : "Non"}
                  </p>
                  <p>Durée minimale parole: {minSpeechDuration}ms</p>
                  <p>Silence avant fin: {silenceTimeout}ms</p>
                  <p>Seuil d'interruption: {interruptionThreshold}ms</p>
                  <p>
                    Interruption actuelle:{" "}
                    {interruptionDetected ? "Détectée" : "Aucune"}
                  </p>
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
      </div>
    </>
  );
};

export default DetectionFinal6;
