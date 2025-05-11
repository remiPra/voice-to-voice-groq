//@ts-nocheck

import { useState, useRef, useEffect } from "react";
import { audioContext } from "../../lib/utils/audio-context";
import VolMeterWorket from "../../lib/worklets/vol-meter";

interface SpeechDetectionOptions {
  silenceThreshold?: number;
  silenceTimeout?: number;
  minSpeechDuration?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVolumeChange?: (volume: number) => void;
}

export function useSpeechDetection(options: SpeechDetectionOptions = {}) {
  const {
    silenceThreshold = 0.01,
    silenceTimeout = 100,
    minSpeechDuration = 50,
    onSpeechStart,
    onSpeechEnd,
    onVolumeChange,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [speechBooleanState, setSpeechBooleanState] = useState(0);
  const [speechEndCount, setSpeechEndCount] = useState(0);
  const [threshold, setThreshold] = useState(silenceThreshold);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vuWorkletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);

  const silenceTimerRef = useRef<number | null>(null);
  const silenceAlertTimerRef = useRef<number | null>(null);
  const speechStartTimeRef = useRef<number | null>(null);
  const hasSpokeRef = useRef<boolean>(false);
  const silenceCountRef = useRef<number>(0);
  const speechBooleanStateRef = useRef<number>(0);
  const firstSpeechDetectedRef = useRef<boolean>(false);
  const graceTimeoutRef = useRef<number | null>(null);
  const speechValidationRef = useRef<number | null>(null);
  const speechStabilityCountRef = useRef<number>(0);
  const volumeHistory = useRef<number[]>([]);
  const noiseFloorRef = useRef<number[]>([]);
  const calibrationTimeRef = useRef<number | null>(null);
  const autoThresholdRef = useRef<number>(silenceThreshold);

  // Sync ref with state
  useEffect(() => {
    speechBooleanStateRef.current = speechBooleanState;
  }, [speechBooleanState]);

  // Speech end detection
  useEffect(() => {
    if (speechBooleanState === 1) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (hasSpokeRef.current) {
            setSpeechEndCount((prev) => prev + 1);
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

  // Smooth volume calculation
  const smoothVolume = (newVolume: number): number => {
    const alpha = 0.5; // Higher alpha for faster reaction
    if (volumeHistory.current.length === 0) {
      volumeHistory.current.push(newVolume);
      return newVolume;
    }
    const smoothedValue =
      alpha * newVolume +
      (1 - alpha) * volumeHistory.current[volumeHistory.current.length - 1];
    volumeHistory.current.push(smoothedValue);
    if (volumeHistory.current.length > 10) {
      // MAX_HISTORY_LENGTH
      volumeHistory.current.shift();
    }
    return smoothedValue;
  };

  // Calibration functions
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
      // Sort values and take 90th percentile to eliminate outliers
      const sortedValues = [...noiseFloorRef.current].sort((a, b) => a - b);
      const p90Index = Math.floor(sortedValues.length * 0.9);
      const p90Value = sortedValues[p90Index];

      // Calculate mean and standard deviation of values below 90th percentile
      const filteredValues = sortedValues.slice(0, p90Index);
      const sum = filteredValues.reduce((a, b) => a + b, 0);
      const mean = sum / filteredValues.length;
      const variance =
        filteredValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        filteredValues.length;
      const stdDev = Math.sqrt(variance);

      // Use more precise threshold
      const newThreshold = Math.max(0.005, mean + stdDev * 2.5);
      setThreshold(newThreshold);
      autoThresholdRef.current = newThreshold;
      console.log(
        `Calibration finished. New threshold: ${newThreshold.toFixed(4)}`
      );
    }
    setIsCalibrating(false);
    setCalibrationProgress(0);
  };

  // Start audio processing
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

      // Create and connect audio processing nodes
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

      // Create VU meter worklet
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

      // Setup speech detection
      const SPEECH_STABILITY_TARGET = 1;

      vuWorkletRef.current.port.onmessage = (ev: MessageEvent) => {
        const rawVolume = ev.data.volume;

        if (isCalibrating) {
          noiseFloorRef.current.push(rawVolume);
          return;
        }

        const smoothedVolume = smoothVolume(rawVolume);
        setVolume(smoothedVolume);
        if (onVolumeChange) onVolumeChange(smoothedVolume);

        if (analyserRef.current && frequencyDataRef.current) {
          analyserRef.current.getByteFrequencyData(frequencyDataRef.current);
          const voiceFrequencyData = Array.from(
            frequencyDataRef.current.slice(3, 25)
          );
          const avgFrequency =
            voiceFrequencyData.reduce((sum, val) => sum + val, 0) /
            voiceFrequencyData.length;
          const stdDevFrequency = Math.sqrt(
            voiceFrequencyData.reduce(
              (sum, val) => sum + Math.pow(val - avgFrequency, 2),
              0
            ) / voiceFrequencyData.length
          );
          const hasVoiceFrequency =
            voiceFrequencyData.some((val) => val > 80) && stdDevFrequency > 15;

          let currentThreshold = threshold;
          if (firstSpeechDetectedRef.current) {
            currentThreshold = threshold * 0.8;
          }
          const now = Date.now();

          // Speech detection logic
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
                  ? 50
                  : 80;

                if (!speechValidationRef.current) {
                  if (!speechStabilityCountRef.current) {
                    speechStabilityCountRef.current = 0;
                  }
                  speechStabilityCountRef.current++;

                  if (
                    speechStabilityCountRef.current >= SPEECH_STABILITY_TARGET
                  ) {
                    speechValidationRef.current = window.setTimeout(() => {
                      setIsSpeaking(true);
                      setSpeechBooleanState(1);
                      hasSpokeRef.current = true;
                      firstSpeechDetectedRef.current = true;

                      if (onSpeechStart) onSpeechStart();
                      speechValidationRef.current = null;
                      speechStabilityCountRef.current = 0;
                    }, validationDelay);
                  }
                }
              }
            }
          } else {
            // Volume below threshold OR no voice frequency
            if (speechValidationRef.current) {
              clearTimeout(speechValidationRef.current);
              speechValidationRef.current = null;
              speechStabilityCountRef.current = 0;
            }

            // Silence handling logic
            silenceCountRef.current += 1;

            const dynamicSilenceThreshold = firstSpeechDetectedRef.current
              ? Math.max(
                  15,
                  30 -
                    Math.min(
                      15,
                      Math.floor(
                        (now - (speechStartTimeRef.current || now)) / 1000
                      )
                    )
                )
              : 40;

            if (
              speechBooleanStateRef.current === 1 &&
              silenceCountRef.current > dynamicSilenceThreshold
            ) {
              if (!graceTimeoutRef.current) {
                graceTimeoutRef.current = window.setTimeout(() => {
                  setIsSpeaking(false);
                  setSpeechBooleanState(0);
                  hasSpokeRef.current = false;
                  speechStartTimeRef.current = null;

                  silenceCountRef.current = 0;
                  graceTimeoutRef.current = null;
                }, 200);
              }
            }
          }
        }
      };

      calibrateMicrophone();
      firstSpeechDetectedRef.current = false;
      speechStabilityCountRef.current = 0;
      setIsListening(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  // Stop audio processing
  const stopListening = () => {
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Clear all timers
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

    setIsSpeaking(false);
    setIsListening(false);
    setSpeechBooleanState(0);
    hasSpokeRef.current = false;
    speechStartTimeRef.current = null;
    silenceCountRef.current = 0;
    firstSpeechDetectedRef.current = false;
    volumeHistory.current = [];
    speechStabilityCountRef.current = 0;
  };

  return {
    isListening,
    isSpeaking,
    volume,
    threshold,
    speechBooleanState,
    speechEndCount,
    isCalibrating,
    calibrationProgress,
    startListening,
    stopListening,
    calibrateMicrophone,
    setThreshold,
    stream: streamRef.current,
  };
}
