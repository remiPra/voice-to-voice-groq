import { useState } from "react";

interface TranscriptionOptions {
  onTranscriptionComplete?: (text: string) => void;
  onTranscriptionStart?: () => void;
  apiKey?: string;
}

export function useTranscription(options: TranscriptionOptions = {}) {
  const { onTranscriptionComplete, onTranscriptionStart, apiKey } = options;

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptions, setTranscriptions] = useState<
    { id: string; text: string; timestamp: string }[]
  >([]);

  const sendAudioForTranscription = async (audioBlob: Blob) => {
    if (!apiKey) {
      console.error("API key not found");
      return null;
    }

    setIsTranscribing(true);
    if (onTranscriptionStart) onTranscriptionStart();

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
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(
          `HTTP error: ${response.status} - ${response.statusText}`
        );
      }

      const result = await response.json();

      // Add transcription to list if it exists
      if (result && result.text) {
        const transcriptionText = result.text.trim();

        // Filter out non-meaningful transcriptions
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
            "⚠ Ignored: Non-meaningful transcription:",
            transcriptionText
          );
          return null;
        }

        // Add to transcription list
        const newTranscription = {
          id: `speech-${Date.now()}`,
          text: transcriptionText,
          timestamp: new Date().toLocaleTimeString(),
        };

        setTranscriptions((prev) => [...prev, newTranscription]);

        // Call completion callback
        if (onTranscriptionComplete) {
          onTranscriptionComplete(transcriptionText);
        }

        return result;
      }

      return null;
    } catch (error) {
      console.error("Transcription error:", error);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  // Check if the transcription is a stop command
  const isStopCommand = (text: string) => {
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

    return stopPhrases.some((phrase) => text.includes(phrase));
  };

  const clearTranscriptions = () => {
    setTranscriptions([]);
  };

  return {
    isTranscribing,
    transcriptions,
    sendAudioForTranscription,
    isStopCommand,
    clearTranscriptions,
  };
}
