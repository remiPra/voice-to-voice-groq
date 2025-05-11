// src/components/DetectionFinal3/index.tsx
//@ts-nocheck
import React, { useEffect, useState, useRef } from "react";
import { useAudioManager } from "./useAudioManager";
import { useAudioQueue } from "./useAudioQueue";
import { useSpeechDetection } from "./useSpeechdetection";
import { useInterruptionDetector } from "./useInterruptionDetector";
import { useRecording } from "./useRecording";
import { useTranscription } from "./useTranscription";
import { MessagingService } from "./messagingService";
import { TextToSpeechService } from "./textToSpeech";
import Navbar from "../NavBarSimple";
import TechPanel from "./TechPanel";
import MessagesList from "./MessageList";
import VideoDisplay from "./VideoDisplay";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";

// Declare global window property for currentPlayingAudio
declare global {
  interface Window {
    currentPlayingAudio: HTMLAudioElement | null;
  }
}

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

const VoiceComponent: React.FC<SpeechDetectorProps> = ({
  onSpeechStart,
  onSpeechEnd,
  onVolumeChange,
  silenceThreshold = 0.01,
  silenceTimeout = 100,
  minSpeechDuration = 50,
  systemPrompta,
}) => {
  // State
  const [displayMode, setDisplayMode] = useState<"text" | "video">("text");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  const [isBackgroundMusicPlaying, setIsBackgroundMusicPlaying] =
    useState(false);
  const [backgroundVolume, setBackgroundVolume] = useState(0.2);
  const [selectedVoice, setSelectedVoice] = useState<string>("nathalie");
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLoadingResponse, setIsLoadingResponse] = useState<boolean>(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const processing = useRef<boolean>(false);

  // Custom hooks
  const audioManager = useAudioManager();
  const audioQueue = useAudioQueue();
  const speechDetection = useSpeechDetection({
    silenceThreshold,
    silenceTimeout,
    minSpeechDuration,
    onSpeechStart,
    onSpeechEnd,
    onVolumeChange,
  });

  const interruptionDetector = useInterruptionDetector({
    // analyserNode: speechDetection.analyserNode, // Removed as it does not exist
    onInterruption: () => {
      audioManager.stopAll();
      audioQueue.clearQueue();
    },
  });

  const recording = useRecording({
    onRecordingStop: handleRecordingStop,
  });

  const transcription = useTranscription({
    onTranscriptionComplete: handleTranscriptionComplete,
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });

  // Initialize services
  const messagingService = useRef(
    new MessagingService({
      systemPrompt:
        systemPrompta ||
        `adopte le roel d'agent conversationel expert en tout , tu peux changer le role si remi te le demande.

À chaque message, tu t'exprimes en moins de 80 mots , chaleureuses et encourageantes, qui réchauffent le cœur`,
      apiKey: import.meta.env.VITE_GROQ_API_KEY,
      modelName: "gemma2-9b-it",
    })
  );

  const ttsService = useRef(
    new TextToSpeechService({
      apiKeys: {
        cartesia: import.meta.env.VITE_SYNTHESIA,
        azure: "", // Add your Azure API key here if needed
      },
      onError: (error) => console.error("TTS Error:", error),
    })
  );

  // Effect to sync messages state with messaging service
  useEffect(() => {
    setMessages(messagingService.current.getMessages());
  }, []);

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Effect to handle interruption detection
  useEffect(() => {
    if (interruptionDetector.interruptionDetected) {
      audioManager.stopAll();
      audioQueue.clearQueue();
    }
  }, [interruptionDetector.interruptionDetected]);

  // Handlers
  async function handleRecordingStop(audioBlob: Blob) {
    // Don't transcribe if TTS is playing
    if (audioManager.isPlaying) {
      console.log("TTS playing: transcription ignored.");
      return;
    }

    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);

    audio.onloadedmetadata = async () => {
      const duration = audio.duration;
      console.log("🎤 Audio duration:", duration, "seconds");

      if (duration < 0.5) {
        console.warn("⚠ Ignored: Audio too short (<0.5s)");
        URL.revokeObjectURL(url);
        return;
      }

      console.log("✅ Sending audio for transcription");
      const result = await transcription.sendAudioForTranscription(audioBlob);

      if (result && result.text) {
        const text = result.text.trim();

        // Check for stop commands
        if (transcription.isStopCommand(text)) {
          console.log("🛑 Stop command detected:", text);
          stopEverything();
          await speakResponse("D'accord, à bientôt!");
          return;
        }

        // Handle the transcription
        if (text && !processing.current) {
          await handleMessageSubmission(text);
        }
      }

      URL.revokeObjectURL(url);
    };
  }

  async function handleTranscriptionComplete(text: string) {
    if (!processing.current) {
      await handleMessageSubmission(text);
    }
  }

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

  const handleMessageSubmission = async (content: string) => {
    if (processing.current) return;
    processing.current = true;

    try {
      // Play waiting audio
      const waitingAudio = new Audio("/no_input.mp3");
      waitingAudio.loop = true;
      waitingAudio.volume = 0.3;
      waitingAudio.play();

      setIsLoadingResponse(true);
      const assistantMessage = await messagingService.current.sendMessage(
        content
      );
      waitingAudio.pause();
      waitingAudio.currentTime = 0;

      if (assistantMessage) {
        // Update messages state
        setMessages(messagingService.current.getMessages());
        scrollToBottom();

        // Speak the response
        await speakResponse(assistantMessage.content);
      }
    } catch (error: any) {
      console.error("Error:", error);
      setError(`Error: ${error.message}`);
    } finally {
      processing.current = false;
      setIsLoadingResponse(false);
    }
  };

  const handleTextSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputText.trim()) {
      handleMessageSubmission(inputText);
      setInputText("");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setInputText(newText);

    // If the user starts typing and audio is playing, stop it
    if (newText && audioManager.isPlaying) {
      console.log("🖋️ Input detected - Stopping current audio");
      audioManager.stopAll();
      audioQueue.clearQueue();
    }
  };

  const speakResponse = async (text: string) => {
    // Stop recording and disable speech detection during TTS
    recording.stopRecording();

    // Stop any playing audio
    audioManager.stopAll();

    // Reset interruption state
    interruptionDetector.resetInterruption();

    try {
      // Generate speech for each sentence
      const speechItems = await ttsService.current.synthesizeText(
        text,
        selectedVoice
      );

      // Add all items to the queue
      for (const item of speechItems) {
        audioQueue.addToQueue(item);
      }
    } catch (error) {
      console.error("Error generating or playing TTS:", error);
      audioManager.stopCurrent();
    }
  };

  const toggleManualRecording = () => {
    // If TTS is playing, stop it before starting manual recording
    if (audioManager.isPlaying) {
      console.log("🔊 Interrupting TTS to start manual recording");
      audioManager.stopAll();
      audioQueue.clearQueue();

      // Add a small delay to ensure audio is stopped
      setTimeout(() => {
        if (speechDetection.stream) {
          recording.toggleManualRecording(speechDetection.stream);
        } else {
          console.error("No active stream for manual recording");
        }
      }, 100);
    } else {
      // No TTS playing, start recording directly
      if (speechDetection.stream) {
        recording.toggleManualRecording(speechDetection.stream);
      } else {
        console.error("No active stream for manual recording");
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

  const pauseBackgroundMusic = () => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      setIsBackgroundMusicPlaying(false);
    }
  };

  // Update background music volume when it changes
  useEffect(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.volume = backgroundVolume;
    }
  }, [backgroundVolume]);

  const stopEverything = () => {
    // Stop TTS
    audioManager.stopAll();

    // Clear audio queue
    audioQueue.clearQueue();

    // Stop microphone listening
    speechDetection.stopListening();

    // Stop manual recording if active
    if (recording.isManualRecording) {
      recording.stopRecording();
    }
  };

  const downloadConversation = () => {
    // Prepare text file content
    let textContent = "Conversation History\n";
    textContent += "=========================\n\n";

    messages.forEach((msg) => {
      const role = msg.role === "user" ? "You" : "Assistant";
      textContent += `[${msg.timestamp || ""}] ${role}:\n${msg.content}\n\n`;
    });

    // Create blob for download
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create download link
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `conversation-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;

    // Trigger download
    document.body.appendChild(downloadLink);
    downloadLink.click();

    // Clean up
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  const resetCounters = () => {
    // Removed resetCounters as it does not exist on speechDetection
    console.warn("resetCounters is not implemented on speechDetection.");
    interruptionDetector.setInterruptionCount(0);
    interruptionDetector.resetInterruption();
  };

  return (
    <>
      <div className="flex h-screen bg-[#f5f7fa] overflow-hidden relative font-['Poppins',sans-serif]">
        {/* Interruption indicator */}
        {interruptionDetector.interruptionDetected && (
          <div className="fixed top-4 right-4 bg-[#e63946] text-white px-4 py-2 rounded-lg shadow-lg animate-pulse z-50">
            Interruption detected!
          </div>
        )}

        {/* Main content */}
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
                    {displayMode === "text" ? "View video" : "View messages"}
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
                      {msg.role === "user" ? "You" : "Assistant"}
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
                  {audioManager.isPlaying ? (
                    <video
                      key="speaking-video"
                      src="/robot2.mp4"
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <video
                      key="idle-video"
                      src="/robot1.mp4"
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
                        recording.isManualRecording
                          ? "bg-[#e63946] text-white shadow-lg"
                          : "bg-[#ff9000] text-white shadow-lg"
                      }`}
                    >
                      {recording.isManualRecording ? "■" : "●"}
                    </button>
                    <button
                      onClick={
                        speechDetection.isListening
                          ? speechDetection.stopListening
                          : speechDetection.startListening
                      }
                      className={`px-5 py-2.5 w-20 h-20 ml-5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                        speechDetection.isListening
                          ? "bg-[#e63946] text-white shadow-lg"
                          : "bg-[#3d9970] text-white shadow-lg"
                      }`}
                    >
                      {speechDetection.isListening ? (
                        <BiMicrophoneOff />
                      ) : (
                        <FaMicrophone />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoadingResponse && (
            <div className="w-full h-full fixed z-[55] top-0 left-0 rounded-2xl bg-white border border-gray-200 text-[#0a2463] flex items-center justify-center">
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
                  Raël is thinking...
                </span>
              </div>
            </div>
          )}

          {/* Input form */}
          <form
            onSubmit={handleTextSubmit}
            className="bg-white border-t border-gray-200 p-4 shadow-md"
          >
            <div className="flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={handleInputChange}
                placeholder="Write your message..."
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
        </div>

        {/* Technical panel */}
        <TechPanel
          volume={speechDetection.volume}
          threshold={speechDetection.threshold}
          speechBooleanState={speechDetection.speechBooleanState}
          speechEndCount={speechDetection.speechEndCount}
          isCalibrating={speechDetection.isCalibrating}
          calibrationProgress={speechDetection.calibrationProgress}
          interruptionCount={interruptionDetector.interruptionCount}
          interruptionDetected={interruptionDetector.interruptionDetected}
          transcriptions={transcription.transcriptions}
          isBackgroundMusicPlaying={isBackgroundMusicPlaying}
          backgroundVolume={backgroundVolume}
          selectedVoice={selectedVoice}
          playbackRate={playbackRate}
          availableVoices={ttsService.current.getVoices()}
          onThresholdChange={(val) => speechDetection.setThreshold(val)}
          onBackgroundVolumeChange={setBackgroundVolume}
          onVoiceChange={setSelectedVoice}
          minSpeechDuration={minSpeechDuration}
          silenceTimeout={silenceTimeout}
          onPlaybackRateChange={setPlaybackRate}
          onBackgroundMusicToggle={() => {
            if (isBackgroundMusicPlaying) {
              pauseBackgroundMusic();
            } else {
              playBackgroundMusic();
            }
          }}
          onCalibrate={speechDetection.calibrateMicrophone}
          onTestVoice={() => {
            if (selectedVoice && !processing.current) {
              speakResponse(
                "This is a test of the selected voice. How can I help you today?"
              );
            }
          }}
          onResetCounters={resetCounters}
          onDownloadConversation={downloadConversation}
          isListening={speechDetection.isListening}
        />
      </div>
    </>
  );
};

export default VoiceComponent;
