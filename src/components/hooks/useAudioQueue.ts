import { useState, useRef, useEffect } from "react";
import { useAudioManager } from "./useAudioManager";

interface AudioQueueItem {
  text: string;
  url: string;
  source?: string;
}

export function useAudioQueue() {
  const [queue, setQueue] = useState<AudioQueueItem[]>([]);
  const queueRef = useRef<AudioQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interruptionDetected, setInterruptionDetected] = useState(false);
  const { isPlaying, play, stopAll } = useAudioManager({
    onEnd: processQueue,
    onError: processQueue,
  });

  // Sync the ref with state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  function addToQueue(item: AudioQueueItem) {
    const newQueue = [...queueRef.current, item];
    queueRef.current = newQueue;
    setQueue(newQueue);

    // If not currently processing, start processing
    if (!isProcessing && !isPlaying) {
      processQueue();
    }
  }

  function processQueue() {
    console.log("processQueue: Processing queue");

    // Don't process if interruption detected or queue is empty
    if (interruptionDetected || queueRef.current.length === 0) {
      console.log("Queue processing ended: interruption or empty queue");
      setIsProcessing(false);
      return;
    }

    // If already playing, don't process yet
    if (isPlaying) {
      console.log("An audio is already playing");
      return;
    }

    setIsProcessing(true);

    // Get next item from queue
    const nextItem = queueRef.current.shift();
    setQueue([...queueRef.current]);

    if (nextItem) {
      console.log("Playing next item:", nextItem.text);

      // Different delay based on source
      const delay = nextItem.source === "cartesia" ? 300 : 50;

      setTimeout(() => {
        if (!interruptionDetected) {
          // Special handling for Cartesia source
          if (nextItem.source === "cartesia") {
            // Create new audio element with more control
            const audio = new Audio(nextItem.url);

            // Force block mode playback for Cartesia
            audio.preload = "auto";

            // Ensure onended event triggers
            audio.addEventListener("ended", () => {
              console.log("Cartesia audio finished via addEventListener");
              URL.revokeObjectURL(nextItem.url);
              setIsProcessing(false);

              // Wait longer before processing next item
              setTimeout(processQueue, 100);
            });

            // Handle errors
            audio.addEventListener("error", () => {
              console.error("Cartesia playback error");
              URL.revokeObjectURL(nextItem.url);
              setIsProcessing(false);

              setTimeout(processQueue, 100);
            });

            // Start playback
            audio.play().catch((err) => {
              console.error("Error starting Cartesia audio:", err);
              setIsProcessing(false);
              setTimeout(processQueue, 100);
            });
          } else {
            // Use AudioManager for other sources
            play(nextItem.url);
          }
        }
      }, delay);
    } else {
      setIsProcessing(false);
    }
  }

  function clearQueue() {
    queueRef.current = [];
    setQueue([]);
    stopAll();
    setIsProcessing(false);
  }

  function setInterruption(interrupted: boolean) {
    setInterruptionDetected(interrupted);
    if (interrupted) {
      stopAll();
      clearQueue();
    }
  }

  return {
    queue,
    addToQueue,
    clearQueue,
    isProcessing,
    interruptionDetected,
    setInterruption,
  };
}
