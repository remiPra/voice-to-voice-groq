import { useState, useRef } from "react";

interface RecordingOptions {
  onRecordingStop?: (audioBlob: Blob) => void;
  maxDuration?: number;
}

export function useRecording(options: RecordingOptions = {}) {
  const {
    onRecordingStop,
    maxDuration = 20 * 1000, // 20 seconds by default
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isManualRecording, setIsManualRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const manualRecordingTimeoutRef = useRef<number | null>(null);

  const startRecording = (stream: MediaStream) => {
    if (!stream) {
      console.error("Cannot start recording: No stream provided");
      return;
    }

    audioChunksRef.current = [];
    const options = { mimeType: "audio/webm" };

    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (onRecordingStop) {
          onRecordingStop(audioBlob);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      console.log("Recording started");
    } catch (err) {
      console.error("Error starting recording:", err);
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
      setIsRecording(false);
      setIsManualRecording(false);
      console.log("Recording stopped");
    }
  };

  const startManualRecording = (stream: MediaStream) => {
    // Check if stream exists AND has active tracks
    const hasActiveStream =
      stream && stream.getTracks().some((track) => track.readyState === "live");

    if (hasActiveStream) {
      startRecording(stream);
      setIsManualRecording(true);

      // Start duration limit timer
      manualRecordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, maxDuration);
    } else {
      console.error("Cannot start manual recording: No active stream");
    }
  };

  const toggleManualRecording = (stream: MediaStream) => {
    if (isManualRecording) {
      stopRecording();
    } else {
      startManualRecording(stream);
    }
  };

  return {
    isRecording,
    isManualRecording,
    startRecording,
    stopRecording,
    toggleManualRecording,
    startManualRecording,
  };
}
