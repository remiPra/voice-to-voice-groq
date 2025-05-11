// src/components/DetectionFinal3/components/VideoDisplay.tsx
import React from "react";
import { FaMicrophone } from "react-icons/fa";
import { BiMicrophoneOff } from "react-icons/bi";

interface VideoDisplayProps {
  isPlaying: boolean;
  isManualRecording: boolean;
  isListening: boolean;
  onToggleManualRecording: () => void;
  onToggleListening: () => void;
}

const VideoDisplay: React.FC<VideoDisplayProps> = ({
  isPlaying,
  isManualRecording,
  isListening,
  onToggleManualRecording,
  onToggleListening,
}) => {
  return (
    <div className="flex-grow relative overflow-hidden">
      <div className="absolute lg:max-w-[450px] inset-0 w-full h-full">
        <div className="relative w-full h-full">
          {isPlaying ? (
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
              onClick={onToggleManualRecording}
              className={`px-5 w-20 h-20 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                isManualRecording
                  ? "bg-[#e63946] text-white shadow-lg"
                  : "bg-[#ff9000] text-white shadow-lg"
              }`}
            >
              {isManualRecording ? "■" : "●"}
            </button>
            <button
              onClick={onToggleListening}
              className={`px-5 py-2.5 w-20 h-20 ml-5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
                isListening
                  ? "bg-[#e63946] text-white shadow-lg"
                  : "bg-[#3d9970] text-white shadow-lg"
              }`}
            >
              {isListening ? <BiMicrophoneOff /> : <FaMicrophone />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDisplay;
