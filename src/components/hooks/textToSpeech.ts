//@ts-nocheck

interface TTSVoice {
  id: string;
  name: string;
  api: string;
  voiceId: string;
}

interface TTSOptions {
  apiKeys: {
    cartesia?: string;
    azure?: string;
  };
  onTTSStart?: () => void;
  onTTSEnd?: () => void;
  onError?: (error: Error) => void;
}

export class TextToSpeechService {
  private voices: TTSVoice[];
  private apiKeys: {
    cartesia: string;
    azure: string;
  };
  private onTTSStart?: () => void;
  private onTTSEnd?: () => void;
  private onError?: (error: Error) => void;

  constructor(options: TTSOptions) {
    this.apiKeys = {
      cartesia: options.apiKeys.cartesia || "",
      azure: options.apiKeys.azure || "",
    };

    this.onTTSStart = options.onTTSStart;
    this.onTTSEnd = options.onTTSEnd;
    this.onError = options.onError;

    // Initialize available voices
    this.voices = [
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
        id: "7a87c6e4-5c33-4e0b-a53c-5ffd70c69231",
        name: "macron",
        api: "cartesia",
        voiceId: "7a87c6e4-5c33-4e0b-a53c-5ffd70c69231",
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
  }

  // Get all available voices
  public getVoices(): TTSVoice[] {
    return this.voices;
  }

  // Synthesize a single sentence with the selected voice
  public async synthesizeSentence(
    text: string,
    voiceId: string
  ): Promise<Blob> {
    const voice = this.voices.find((v) => v.id === voiceId);

    if (!voice) {
      throw new Error(`Voice not found with ID: ${voiceId}`);
    }

    let response;

    if (voice.api === "cartesia") {
      if (!this.apiKeys.cartesia) {
        throw new Error("Cartesia API key not configured");
      }

      response = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "Cartesia-Version": "2024-06-10",
          "X-API-Key": this.apiKeys.cartesia,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-2",
          transcript: text,
          voice: {
            mode: "id",
            id: voice.voiceId,
          },
          output_format: {
            container: "mp3",
            bit_rate: 128000,
            sample_rate: 44100,
          },
          language: "fr",
        }),
      });
    } else if (voice.api === "azure") {
      if (!this.apiKeys.azure) {
        throw new Error("Azure API key not configured");
      }

      response = await fetch(
        "https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text,
            voice: voice.voiceId,
          }),
        }
      );
    } else {
      throw new Error(`Unsupported API: ${voice.api}`);
    }

    if (!response.ok) {
      throw new Error(
        `HTTP error: ${response.status} - ${response.statusText}`
      );
    }

    return await response.blob();
  }

  // Synthesize full text by breaking it into sentences and processing each
  public async synthesizeText(
    text: string,
    voiceId: string
  ): Promise<{ text: string; url: string; source: string }[]> {
    // Find the selected voice
    const voice = this.voices.find((v) => v.id === voiceId);

    if (!voice) {
      throw new Error(`Voice not found with ID: ${voiceId}`);
    }

    // Split text into sentences
    const sentences = text
      .split(/(?<=[.!?])\s+/) // Split at punctuation followed by space
      .filter((sentence) => sentence.trim().length > 0) // Remove empty sentences
      .map((sentence) => sentence.trim());

    console.log("Sentences to synthesize:", sentences);

    const results: { text: string; url: string; source: string }[] = [];

    try {
      // Process each sentence
      for (const sentence of sentences) {
        // Skip sentences that are too short
        if (sentence.length < 2) continue;

        console.log(`Synthesizing sentence: "${sentence}"`);

        // Get audio blob for this sentence
        const audioBlob = await this.synthesizeSentence(sentence, voiceId);

        // Create object URL
        const audioUrl = URL.createObjectURL(audioBlob);

        // Add to results
        results.push({
          text: sentence,
          url: audioUrl,
          source: voice.api,
        });
      }

      return results;
    } catch (error) {
      console.error("Error during TTS synthesis:", error);
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
      return [];
    }
  }
}
