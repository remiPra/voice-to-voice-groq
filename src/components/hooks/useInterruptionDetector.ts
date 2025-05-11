import { useState, useRef, useEffect } from "react";

interface InterruptionDetectorOptions {
  onInterruption?: () => void;
  analyserNode?: AnalyserNode | null;
}

export function useInterruptionDetector(
  options: InterruptionDetectorOptions = {}
) {
  const { onInterruption, analyserNode } = options;

  const [interruptionDetected, setInterruptionDetected] = useState(false);
  const [interruptionCount, setInterruptionCount] = useState(0);

  // Refs for detection state
  const highVolumeSamplesRef = useRef<number>(0);
  const lastHighVolumeTimeRef = useRef<number | null>(null);
  const frequencyDataRef = useRef<Uint8Array | null>(null);

  // Initialize frequency data if analyser provided
  useEffect(() => {
    if (analyserNode) {
      frequencyDataRef.current = new Uint8Array(analyserNode.frequencyBinCount);
    }
  }, [analyserNode]);

  const detectInterruption = (currentVolume: number, isTTSPlaying: boolean) => {
    // Only detect interruptions when TTS is playing
    if (!isTTSPlaying) return false;

    // Constants for detection - optimized thresholds
    const VOLUME_THRESHOLD = 0.06;
    const EXTREME_VOLUME_THRESHOLD = 0.2;

    // Log for high volumes
    if (currentVolume > 0.04) {
      console.log(
        "Volume:",
        currentVolume.toFixed(4),
        "TTS active:",
        isTTSPlaying
      );
    }

    const now = Date.now();

    // Initialize detection flags
    let isExplosiveSound = false;
    let isDoorbell = false;
    let isWindNoise = false;
    let isLoudHumanVoice = false;
    let isSneeze = false;

    // Spectral analysis if analyzer node available
    if (analyserNode && frequencyDataRef.current) {
      analyserNode.getByteFrequencyData(frequencyDataRef.current);

      // Get frequency band data
      const highFreqs = Array.from(frequencyDataRef.current.slice(30, 50));
      const midHighFreqs = Array.from(frequencyDataRef.current.slice(20, 30));
      const midFreqs = Array.from(frequencyDataRef.current.slice(15, 20));
      const lowMidFreqs = Array.from(frequencyDataRef.current.slice(8, 15));
      const lowFreqs = Array.from(frequencyDataRef.current.slice(2, 8));

      // Calculate energy per band
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

      // 1. DOORBELL DETECTION
      const hasDoorbellPattern =
        midHighFreqEnergy > 60 &&
        midHighFreqEnergy > lowFreqEnergy * 1.5 &&
        midHighFreqEnergy > highFreqEnergy * 1.2;

      const hasTonePattern = midHighFreqs.some(
        (val, idx, arr) =>
          idx > 0 &&
          idx < arr.length - 1 &&
          val > 80 &&
          val > arr[idx - 1] * 1.3 &&
          val > arr[idx + 1] * 1.3
      );

      isDoorbell = hasDoorbellPattern && hasTonePattern;

      // 2. SNEEZE DETECTION
      const hasInitialSpike = currentVolume > 0.12;

      const hasTypicalSneezePattern =
        highFreqEnergy > 70 &&
        midFreqEnergy > 50 &&
        highFreqEnergy > lowFreqEnergy * 1.8;

      isSneeze = hasInitialSpike && hasTypicalSneezePattern;

      // 3. EXPLOSIVE SOUND DETECTION
      const freqRatio = highFreqEnergy / lowFreqEnergy;
      isExplosiveSound = hasInitialSpike && freqRatio > 1.2 && !isSneeze;

      // 4. WIND NOISE DETECTION
      const frequencies = Array.from(frequencyDataRef.current.slice(1, 50));
      const mean = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
      const variance =
        frequencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
        frequencies.length;
      const stdDev = Math.sqrt(variance);

      isWindNoise = stdDev < 12 && mean > 25;

      // 5. HUMAN VOICE DETECTION
      isLoudHumanVoice =
        lowFreqEnergy > 45 &&
        lowMidFreqEnergy > 40 &&
        lowFreqEnergy > midHighFreqEnergy * 0.7 &&
        !isExplosiveSound &&
        !isWindNoise &&
        !isDoorbell;

      // Enhanced logging for debugging
      if (currentVolume > VOLUME_THRESHOLD || isDoorbell || isSneeze) {
        console.log("Sound analysis:", {
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

    // INTERRUPTION HANDLING LOGIC

    // 1. EXTREME VOLUME - Immediate interruption
    if (currentVolume > EXTREME_VOLUME_THRESHOLD) {
      console.log("🚨 EXTREME VOLUME DETECTED - IMMEDIATE INTERRUPTION");
      setInterruptionDetected(true);
      setInterruptionCount((prev) => prev + 1);
      if (onInterruption) onInterruption();

      highVolumeSamplesRef.current = 0;
      lastHighVolumeTimeRef.current = null;
      return true;
    }

    // 2. DOORBELL - High priority interruption
    if (isDoorbell && currentVolume > VOLUME_THRESHOLD * 0.8) {
      console.log("🔔 DOORBELL PATTERN DETECTED - INTERRUPTION");
      setInterruptionDetected(true);
      setInterruptionCount((prev) => prev + 1);
      if (onInterruption) onInterruption();

      highVolumeSamplesRef.current = 0;
      lastHighVolumeTimeRef.current = null;
      return true;
    }

    // 3. SNEEZE - Medium priority, interrupt if obvious
    if (isSneeze && currentVolume > VOLUME_THRESHOLD) {
      console.log("🤧 SNEEZE DETECTED - INTERRUPTION");
      setInterruptionDetected(true);
      setInterruptionCount((prev) => prev + 1);
      if (onInterruption) onInterruption();

      highVolumeSamplesRef.current = 0;
      lastHighVolumeTimeRef.current = null;
      return true;
    }

    // 4. EXPLOSIVE SOUNDS - Can be ignored
    if (isExplosiveSound && currentVolume > VOLUME_THRESHOLD) {
      console.log("💥 Explosive sound detected - monitoring...");
      // Increment counter with less weight
      highVolumeSamplesRef.current += 0.5;
      return false;
    }

    // 5. WIND NOISE - Ignore
    if (isWindNoise && currentVolume > VOLUME_THRESHOLD) {
      console.log("💨 Background/wind noise detected - ignored");
      // Decrease counter to avoid false triggers
      highVolumeSamplesRef.current = Math.max(
        0,
        highVolumeSamplesRef.current - 0.5
      );
      return false;
    }

    // 6. STANDARD VOICE DETECTION with adaptive threshold
    if (currentVolume > VOLUME_THRESHOLD) {
      // Initialize for first high volume sample
      if (highVolumeSamplesRef.current === 0) {
        lastHighVolumeTimeRef.current = now;
        console.log("⏱️ Possible interruption start");
      }

      // Increment counter (faster for clear human voice)
      highVolumeSamplesRef.current += isLoudHumanVoice ? 1.75 : 0.75;
      console.log("📈 Interruption counter:", highVolumeSamplesRef.current);

      // Check for sustained interruption - lowered threshold to 3.5 for faster response
      if (highVolumeSamplesRef.current > 3.5) {
        console.log(
          "🚨 VOICE INTERRUPTION confirmed after",
          highVolumeSamplesRef.current,
          "samples"
        );

        setInterruptionDetected(true);
        setInterruptionCount((prev) => prev + 1);
        if (onInterruption) onInterruption();

        highVolumeSamplesRef.current = 0;
        lastHighVolumeTimeRef.current = null;
        return true;
      }
    } else {
      // Volume below threshold - gradually decrease counter
      if (highVolumeSamplesRef.current > 0) {
        // Faster decay for quicker reset
        highVolumeSamplesRef.current = Math.max(
          0,
          highVolumeSamplesRef.current - 0.75
        );

        // Reset if silence persists
        if (
          lastHighVolumeTimeRef.current &&
          now - lastHighVolumeTimeRef.current > 400
        ) {
          console.log("⏹️ Detection end - silence detected");
          highVolumeSamplesRef.current = 0;
          lastHighVolumeTimeRef.current = null;
        }
      }
    }

    return false;
  };

  const resetInterruption = () => {
    setInterruptionDetected(false);
    highVolumeSamplesRef.current = 0;
    lastHighVolumeTimeRef.current = null;
  };

  return {
    interruptionDetected,
    interruptionCount,
    detectInterruption,
    resetInterruption,
    setInterruptionCount,
  };
}
