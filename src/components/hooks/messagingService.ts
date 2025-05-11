interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface MessageServiceOptions {
  systemPrompt?: string;
  apiKey?: string;
  modelName?: string;
}

export class MessagingService {
  private messageHistory: Message[];
  private systemPrompt: string;
  private apiKey: string;
  private modelName: string;
  private isProcessing: boolean;

  constructor(options: MessageServiceOptions = {}) {
    const {
      systemPrompt = `adopte le roel d'agent conversationel expert en tout, tu peux changer le role si remi te le demande.
  
  À chaque message, tu t'exprimes en moins de 80 mots, chaleureuses et encourageantes, qui réchauffent le cœur`,
      apiKey = "",
      modelName = "gemma2-9b-it",
    } = options;

    this.messageHistory = [];
    this.systemPrompt = systemPrompt;
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.isProcessing = false;

    // Initialize with system prompt
    this.messageHistory.push({
      role: "system",
      content: this.systemPrompt,
    });
  }

  // Clean LLM response
  private cleanLLMResponse(text: string): string {
    return text.replace(/\*/g, "");
  }

  // Send a message and get a response
  public async sendMessage(userContent: string): Promise<Message | null> {
    if (this.isProcessing) return null;
    this.isProcessing = true;

    try {
      // Add user message to history
      const userMessage: Message = {
        role: "user",
        content: userContent,
        timestamp: new Date().toLocaleTimeString(),
      };

      this.messageHistory.push(userMessage);

      // Call the API
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: this.messageHistory,
            model: this.modelName,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "API Error");
      }

      const data = await response.json();

      if (data.choices?.[0]?.message?.content) {
        const assistantContent = this.cleanLLMResponse(
          data.choices[0].message.content
        );

        const assistantMessage: Message = {
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toLocaleTimeString(),
        };

        this.messageHistory.push(assistantMessage);

        // Trim history if it gets too long
        if (this.messageHistory.length > 20) {
          this.messageHistory = [
            this.messageHistory[0], // Keep system prompt
            ...this.messageHistory.slice(-19),
          ];
        }

        return assistantMessage;
      }

      return null;
    } catch (error) {
      console.error("Error:", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  // Get all messages
  public getMessages(): Message[] {
    return this.messageHistory.filter((msg) => msg.role !== "system");
  }

  // Reset conversation
  public resetConversation(): void {
    this.messageHistory = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  // Set a new system prompt
  public setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    // Update the first message if it's a system message
    if (this.messageHistory[0].role === "system") {
      this.messageHistory[0].content = prompt;
    } else {
      // Insert at beginning if not
      this.messageHistory.unshift({
        role: "system",
        content: prompt,
      });
    }
  }
}
