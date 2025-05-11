// src/components/DetectionFinal3/components/TechPanel.tsx
import React from "react";

interface TTSVoice {
  id: string;
  name: string;
  api: string;
  voiceId: string;
}

interface TechPanelProps {
  volume: number;
  threshold: number;
  speechBooleanState: number;
  speechEndCount: number;
  isCalibrating: boolean;
  calibrationProgress: number;
  interruptionCount: number;
  interruptionDetected: boolean;
  transcriptions: { id: string; text: string; timestamp: string }[];
  isBackgroundMusicPlaying: boolean;
  backgroundVolume: number;
  selectedVoice: string;
  playbackRate: number;
  availableVoices: TTSVoice[];
  onThresholdChange: (threshold: number) => void;
  onBackgroundVolumeChange: (volume: number) => void;
  onVoiceChange: (voiceId: string) => void;
  onPlaybackRateChange: (rate: number) => void;
  onBackgroundMusicToggle: () => void;
  onCalibrate: () => void;
  onTestVoice: () => void;
  onResetCounters: () => void;
  onDownloadConversation: () => void;
  isListening: boolean;
  minSpeechDuration: number;
  silenceTimeout: number;
}

const TechPanel: React.FC<TechPanelProps> = ({
  volume,
  threshold,
  speechBooleanState,
  speechEndCount,
  isCalibrating,
  calibrationProgress,
  interruptionCount,
  interruptionDetected,
  transcriptions,
  isBackgroundMusicPlaying,
  backgroundVolume,
  selectedVoice,
  playbackRate,
  availableVoices,
  onThresholdChange,
  onBackgroundVolumeChange,
  onVoiceChange,
  onPlaybackRateChange,
  onBackgroundMusicToggle,
  onCalibrate,
  onTestVoice,
  onResetCounters,
  onDownloadConversation,
  isListening,
  minSpeechDuration,
  silenceTimeout,
}) => {
  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newThreshold = parseFloat(e.target.value);
    if (!isNaN(newThreshold) && newThreshold >= 0) {
      onThresholdChange(newThreshold);
    }
  };

  return (
    <div className="fixed top-0 right-0 h-full">
      <div
        id="techPanel"
        className="w-full md:w-96 h-full bg-white border-l border-gray-200 shadow-2xl overflow-y-auto transform translate-x-full transition-transform duration-300 ease-in-out fixed right-0 top-0 z-40"
      >
        <div className="flex justify-around items-center p-5 bg-[#0a2463] text-white">
          <h2 className="text-lg font-bold font-['Montserrat',sans-serif]">
            Technical Panel
          </h2>
          <div className="flex space-x-3">
            <button
              className="bg-[#1e3a8a] text-white p-2.5 rounded-full shadow-lg hover:bg-[#2a4494] transition-all duration-300"
              onClick={onDownloadConversation}
              title="Download conversation"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
          </div>
          <button
            onClick={onBackgroundMusicToggle}
            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 transform hover:scale-105 ${
              isBackgroundMusicPlaying
                ? "bg-[#3d9970] text-white shadow-lg"
                : "bg-[#0a2463] text-white shadow-lg"
            }`}
          >
            {isBackgroundMusicPlaying ? "Pause music" : "Play music"}
          </button>
          <button
            className="bg-[#0a2463] text-white p-3 rounded-l-lg shadow-lg hover:bg-[#1e3a8a] transition-all duration-300"
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
        </div>

        {/* Background music volume section */}
        <div className="p-5 border-b border-gray-200">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Background music volume: {(backgroundVolume * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={backgroundVolume}
              onChange={(e) => onBackgroundVolumeChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Voice selection section */}
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Voice Selection
          </h3>
          <div className="space-y-2">
            {availableVoices.map((voice) => (
              <div key={voice.id} className="flex items-center">
                <input
                  type="radio"
                  id={voice.id}
                  name="voice"
                  value={voice.id}
                  checked={selectedVoice === voice.id}
                  onChange={() => onVoiceChange(voice.id)}
                  className="mr-2 accent-[#0a2463]"
                />
                <label
                  htmlFor={voice.id}
                  className={`cursor-pointer ${
                    selectedVoice === voice.id
                      ? "text-[#0a2463] font-medium"
                      : "text-gray-600"
                  }`}
                >
                  {voice.name}
                </label>
              </div>
            ))}
          </div>

          <button
            onClick={onTestVoice}
            className="mt-4 w-full bg-[#0a2463] hover:bg-[#1e3a8a] text-white py-2 px-4 rounded-lg transition-all duration-300 shadow-md"
          >
            Test Voice
          </button>
        </div>

        {/* Voice speed section */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Voice Speed
          </h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Speed: {playbackRate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={playbackRate}
              onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        {/* Microphone calibration section */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Microphone Calibration
          </h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detection threshold: {threshold.toFixed(4)}
            </label>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={threshold}
              onChange={handleThresholdChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          {isListening && !isCalibrating && (
            <button
              onClick={onCalibrate}
              className="w-full px-4 py-2.5 rounded-md font-medium bg-[#ff9000] hover:bg-[#e67e00] text-white transition-all duration-300 shadow-md"
            >
              Recalibrate microphone
            </button>
          )}
          {isCalibrating && (
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
              <div
                className="bg-[#ff9000] h-2.5 rounded-full"
                style={{ width: `${calibrationProgress}%` }}
              ></div>
              <p className="text-xs text-gray-500 mt-1">
                Calibration: {calibrationProgress.toFixed(0)}%
              </p>
            </div>
          )}
        </div>

        {/* Detection states section */}
        {/* Detection states section */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Detection States
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-100 rounded-xl">
              <div className="text-xs font-medium mb-2 text-gray-700">
                Speech state:
              </div>
              <div className="flex justify-center">
                <span
                  className={`w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full ${
                    speechBooleanState === 1
                      ? "bg-[#3d9970] text-white"
                      : "bg-gray-300 text-gray-600"
                  }`}
                >
                  {speechBooleanState}
                </span>
              </div>
            </div>
            <div className="p-4 bg-gray-100 rounded-xl">
              <div className="text-xs font-medium mb-2 text-gray-700">
                Speech ends:
              </div>
              <div className="flex justify-center">
                <span className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full bg-[#0a2463] text-white">
                  {speechEndCount}
                </span>
              </div>
            </div>
          </div>

          {/* Interruption counter section */}
          <div className="mt-4 p-4 bg-gray-100 rounded-xl">
            <div className="text-xs font-medium mb-2 text-gray-700">
              Interruption count:
            </div>
            <div className="flex justify-center">
              <span className="w-12 h-12 flex items-center justify-center text-xl font-bold rounded-full bg-[#e63946] text-white">
                {interruptionCount}
              </span>
            </div>
          </div>
        </div>

        {/* Transcriptions section */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Transcriptions
          </h3>
          {transcriptions.length === 0 ? (
            <p className="text-gray-500 italic text-sm">
              No transcriptions yet
            </p>
          ) : (
            <div className="space-y-3 max-h-40 overflow-y-auto">
              {transcriptions.map((trans) => (
                <div
                  key={trans.id}
                  className="p-3 bg-gray-100 border border-gray-200 rounded-lg text-sm"
                >
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-[#1e3a8a]">
                      Transcription
                    </span>
                    <span className="text-xs text-gray-500">
                      {trans.timestamp}
                    </span>
                  </div>
                  <p className="text-gray-800">{trans.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Debug information section */}
        <div className="p-5 border-b border-gray-200">
          <h3 className="text-md font-semibold mb-3 text-[#1e3a8a] font-['Montserrat',sans-serif]">
            Debug Information
          </h3>
          <div className="text-xs space-y-2 bg-gray-100 p-3 rounded-lg text-gray-700">
            <p>Current volume: {volume.toFixed(5)}</p>
            <p>Current threshold: {threshold.toFixed(5)}</p>
            <p>
              Threshold after first detection: {(threshold * 0.8).toFixed(5)}
            </p>
            <p>Minimum speech duration: {minSpeechDuration || 50}ms</p>
            <p>Silence before end: {silenceTimeout || 100}ms</p>
            <p>
              Current interruption: {interruptionDetected ? "Detected" : "None"}
            </p>
          </div>
        </div>

        {/* Reset button */}
        <div className="p-5">
          <button
            onClick={onResetCounters}
            className="w-full px-4 py-3 rounded-lg font-medium bg-[#0a2463] hover:bg-[#1e3a8a] text-white transition-all duration-300 shadow-md"
          >
            Reset counters
          </button>
        </div>
      </div>
    </div>
  );
};

export default TechPanel;
