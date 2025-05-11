import { useState, useRef } from "react";

export interface AudioManagerOptions {
  onPlay?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export function useAudioManager(options?: AudioManagerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Store global reference for interruption detection
  if (typeof window !== "undefined") {
    window.currentPlayingAudio = currentAudioRef.current;
  }

  const play = (url: string, playbackRate: number = 1.0) => {
    // Stop current audio if playing
    stopCurrent();

    // Create new audio element
    const audio = new Audio(url);
    audio.playbackRate = playbackRate;

    // Store reference
    currentAudioRef.current = audio;
    if (typeof window !== "undefined") {
      window.currentPlayingAudio = audio;
    }

    // Setup event handlers
    audio.onplay = () => {
      console.log("AudioManager: Playback started");
      setIsPlaying(true);
      options?.onPlay?.();
    };

    audio.onended = () => {
      console.log("AudioManager: Playback ended");
      currentAudioRef.current = null;
      if (typeof window !== "undefined") {
        window.currentPlayingAudio = null;
      }
      setIsPlaying(false);
      URL.revokeObjectURL(url);
      options?.onEnd?.();
    };

    audio.onerror = (e) => {
      console.error("AudioManager: Playback error", e);
      currentAudioRef.current = null;
      if (typeof window !== "undefined") {
        window.currentPlayingAudio = null;
      }
      setIsPlaying(false);
      URL.revokeObjectURL(url);
      options?.onError?.(e);
    };

    // Start playback
    audio.play().catch((err) => {
      console.error("AudioManager: Unable to start playback", err);
      currentAudioRef.current = null;
      if (typeof window !== "undefined") {
        window.currentPlayingAudio = null;
      }
      setIsPlaying(false);
      options?.onError?.(err);
    });

    return audio;
  };

  const stopCurrent = () => {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        if (
          currentAudioRef.current.src &&
          currentAudioRef.current.src.startsWith("blob:")
        ) {
          URL.revokeObjectURL(currentAudioRef.current.src);
        }
      } catch (e) {
        console.error("AudioManager: Error stopping playback", e);
      }
      currentAudioRef.current = null;
      if (typeof window !== "undefined") {
        window.currentPlayingAudio = null;
      }
    }
    setIsPlaying(false);
  };

  const stopAll = () => {
    console.log("AudioManager: Stopping all audio");
    stopCurrent();

    // Find and stop any other audio elements in the DOM
    if (typeof document !== "undefined") {
      document.querySelectorAll("audio").forEach((audioElement) => {
        try {
          audioElement.pause();
          audioElement.currentTime = 0;
        } catch (e) {
          console.error("AudioManager: Error stopping DOM audio element", e);
        }
      });
    }
  };

  return {
    isPlaying,
    play,
    stopCurrent,
    stopAll,
    currentAudio: currentAudioRef.current,
  };
}
