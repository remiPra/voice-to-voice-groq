// src/components/DetectionFinal3/components/MessagesList.tsx
import React, { useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

interface MessagesListProps {
  messages: Message[];
  error: string;
}

const MessagesList: React.FC<MessagesListProps> = ({ messages, error }) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  return (
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
                msg.role === "user" ? "text-[#ff9000]" : "text-[#1e3a8a]"
              }`}
            >
              {msg.role === "user" ? "You" : "Assistant"}
            </span>
            <span className="text-xs text-gray-500">{msg.timestamp}</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
            {msg.content}
          </p>
        </div>
      ))}
      <div ref={messagesEndRef}></div>
    </div>
  );
};

export default MessagesList;
