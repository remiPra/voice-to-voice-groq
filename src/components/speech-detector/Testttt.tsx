import React, { useState, useRef } from "react";
import { audioContext } from "../../lib/utils/audio-context";
import VolMeterWorket from "../../lib/worklets/vol-meter";

interface TranscriptionResult {
  text: string;
}

interface Transcription {
  id: string;
  text: string;
  timestamp: string;
}

const SpeechDetector: React.FC = () => {
  // États de base
  const [volume, setVolume] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [threshold, setThreshold] = useState<number>(0.01);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationProgress, setCalibrationProgress] = useState<number>(0);

  // Références pour la détection, le traitement audio et le timing
  const noiseFloorRef = useRef<number[]>([]);
  const calibrationTimeRef = useRef<number | null>(null);
  const autoThresholdRef = useRef<number>(0.01);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vuWorkletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const firstSpeechDetectedRef = useRef<boolean>(false);
  const silenceCountRef = useRef<number>(0);
  const speechValidationRef = useRef<number | null>(null);
  const volumeHistory = useRef<number[]>([]);
  const MAX_HISTORY_LENGTH = 10;
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);
  const graceTimeoutRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef<boolean>(false);

  // --- Calibration du micro ---
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

  // Lissage du volume pour une détection plus stable
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

  // --- Enregistrement et transcription ---
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
      setIsSpeaking(false);
    }
  };

  const sendAudioForTranscription = async (
    audioBlob: Blob
  ): Promise<TranscriptionResult | null> => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("temperature", "0");
      formData.append("response_format", "json");
      formData.append("language", "fr");
      const response = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.REACT_APP_GROQ_API_KEY}`,
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
      console.log("Durée de l'audio:", duration, "secondes");
      if (duration < 0.5) {
        console.warn("Audio trop court (<0.5s)");
        return;
      }
      console.log("Envoi de l'audio à la transcription");
      setIsTranscribing(true);
      const transcription = await sendAudioForTranscription(audioBlob);
      setIsTranscribing(false);
      if (transcription && transcription.text) {
        const transcriptionText = transcription.text.trim();
        // Ignorer les transcriptions trop courtes ou non significatives
        if (
          transcriptionText.length < 3 ||
          /^[.,;:!?…]+$/.test(transcriptionText)
        ) {
          console.warn("Transcription non significative:", transcriptionText);
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
      }
    };
  };

  // --- Écoute et détection de la parole ---
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

      // Ajout du worklet pour la mesure du volume
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

      // Démarrer la calibration pour définir un seuil adapté
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
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
            if (!isSpeaking) {
              if (!speechStartTimeRef.current) {
                speechStartTimeRef.current = now;
              } else if (now - speechStartTimeRef.current > 100) {
                if (!speechValidationRef.current) {
                  speechValidationRef.current = window.setTimeout(() => {
                    setIsSpeaking(true);
                    firstSpeechDetectedRef.current = true;
                    if (!isRecordingRef.current && streamRef.current) {
                      startRecording();
                    }
                    speechValidationRef.current = null;
                  }, 200);
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
            if (isSpeaking && silenceCountRef.current > silenceThreshold) {
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

  const stopListening = () => {
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current)
      streamRef.current.getTracks().forEach((track) => track.stop());
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    firstSpeechDetectedRef.current = false;
    silenceCountRef.current = 0;
    volumeHistory.current = [];
  };

  const toggleListening = async () => {
    if (isListening) {
      stopListening();
    } else {
      await startListening();
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Speech Detector</h1>
      <button onClick={toggleListening}>
        {isListening ? "Arrêter l'écoute" : "Démarrer l'écoute"}
      </button>
      <div style={{ marginTop: "10px" }}>
        <label>
          Seuil de détection: {threshold.toFixed(4)}
          <input
            type="range"
            min="0.001"
            max="0.1"
            step="0.001"
            value={threshold}
            onChange={handleThresholdChange}
          />
        </label>
      </div>
      {isCalibrating && (
        <div>Calibration : {calibrationProgress.toFixed(0)}%</div>
      )}
      <div style={{ marginTop: "20px" }}>
        <strong>Volume :</strong> {volume.toFixed(5)}
      </div>
      {isTranscribing && <div>Transcription en cours...</div>}
      <div style={{ marginTop: "20px" }}>
        <h2>Transcriptions</h2>
        {transcriptions.length === 0 ? (
          <p>Aucune transcription pour le moment.</p>
        ) : (
          <ul>
            {transcriptions.map((trans) => (
              <li key={trans.id}>
                [{trans.timestamp}] {trans.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default SpeechDetector;
