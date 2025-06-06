// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";

/******************************
 * ConversationVocaleAutos V2 *
 * — détecte la parole          *
 * — joue le TTS par chunks     *
 * — coupe IMMEDIATEMENT le TTS *
 *   dès qu'on parle plus fort  *
 ******************************/

interface VoiceDetectorProps {
  deepInfraToken?: string;
  groqApiKey?: string;
  systemPrompt?: string;
  volumeThreshold?: number; // seuil déclenchement parole
  silenceThreshold?: number; // ms de silence pour fermer l'enregistrement
  maxChunkLength?: number; // découpe du TTS
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

/** Utile pour la variable globale */
declare global {
  interface Window {
    currentPlayingAudio: HTMLAudioElement | null;
  }
}
window.currentPlayingAudio = null;

/****************************************************************
 * AudioManager — garantit qu'UN seul son joue à la fois        *
 ****************************************************************/
const buildAudioManager = (notifyPlaying: (p: boolean) => void) => {
  return {
    current: null as HTMLAudioElement | null,
    play(url: string) {
      this.stop();
      const audio = new Audio(url);
      audio.onplay = () => notifyPlaying(true);
      audio.onended = () => {
        notifyPlaying(false);
        URL.revokeObjectURL(url);
        this.current = null;
        window.currentPlayingAudio = null;
      };
      audio.onerror = () => {
        notifyPlaying(false);
        URL.revokeObjectURL(url);
        this.current = null;
        window.currentPlayingAudio = null;
      };
      this.current = audio;
      window.currentPlayingAudio = audio;
      audio.play().catch(() => notifyPlaying(false));
    },
    stop() {
      if (this.current) {
        try {
          this.current.pause();
          this.current.currentTime = 0;
          if (this.current.src.startsWith("blob:")) URL.revokeObjectURL(this.current.src);
        } catch {}
      }
      this.current = null;
      window.currentPlayingAudio = null;
      notifyPlaying(false);
    },
  };
};

/************************
 * composant principal  *
 ************************/
const ConversationVocaleAutos: React.FC<VoiceDetectorProps> = ({
  deepInfraToken = "T9lFMOSO2Xtcl0CdIpCC9qVQ75Ss2IGV",
  groqApiKey = import.meta.env.VITE_GROQ_API_KEY,
  systemPrompt = "You are a helpful French vocal assistant. Keep responses concise for voice synthesis.",
  // seuil déclenchement parole
  volumeThreshold = 0.2,
  silenceThreshold = 1200,
  maxChunkLength = 140,
}) => {
  /************* state *************/
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTTS, _setIsTTS] = useState(false);
  const [volume, setVolume] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: systemPrompt, timestamp: new Date().toLocaleTimeString() },
  ]);
  const setIsTTS = (v: boolean) => {
    _setIsTTS(v);
    isTTSRef.current = v;
  };

  /************* refs *************/
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const rmsHistory = useRef<number[]>([]);

  const isSpeakingRef = useRef(false);
  const lastVoiceTsRef = useRef(0);
  const silenceTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isTTSRef = useRef(false);
  const interruptCountRef = useRef(0);
  const consecutiveLoudRef = useRef(0);
  // --- réglages interruption ----------------------------------
const INTERRUPT_MULT = 1;   // au lieu de 1.5  → on exige plus de volume
const INTERRUPT_FRAMES = 6;  // au lieu de 6    → ~ 450-500 ms de voix
// ------------------------------------------------------------


  /** AudioManager lié au state */
  const audioMgr = useRef(buildAudioManager(setIsTTS));

  /********************** microphone *************************/
  const startMic = async () => {
    if (isListening) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    streamRef.current = stream;
    setIsListening(true);
    detect();
  };

  const stopMic = () => {
    setIsListening(false);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    analyserRef.current = null;
  };

  /********************** volume loop *************************/
  const detect = () => {
    if (!analyserRef.current) return;
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);

    const loop = () => {
      analyserRef.current!.getByteFrequencyData(buffer);
      const rms = Math.sqrt(buffer.reduce((s, v) => s + (v / 255) ** 2, 0) / buffer.length);
      rmsHistory.current.push(rms);
      if (rmsHistory.current.length > 5) rmsHistory.current.shift();
      const smooth = rmsHistory.current.reduce((a, b) => a + b, 0) / rmsHistory.current.length;
      setVolume(smooth);

      /************ INTERRUPTION PENDANT TTS ************/
      if (isTTSRef.current) {
        const loud = smooth > volumeThreshold * INTERRUPT_MULT;
        consecutiveLoudRef.current = loud
          ? consecutiveLoudRef.current + 1
          : Math.max(0, consecutiveLoudRef.current - 1);
        
        if (consecutiveLoudRef.current >= INTERRUPT_FRAMES) {
        
          interruptTTS();
          consecutiveLoudRef.current = 0;
        }
        frameRef.current = requestAnimationFrame(loop);
        return;
      }

      /************ DETECTION PAROLE ************/
      const now = Date.now();
      if (smooth > volumeThreshold) {
        lastVoiceTsRef.current = now;
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          startRecording();
        }
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (isSpeakingRef.current && !silenceTimerRef.current) {
        const elapsed = now - lastVoiceTsRef.current;
        if (elapsed > 120) {
          silenceTimerRef.current = window.setTimeout(() => {
            stopRecording();
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            silenceTimerRef.current = null;
          }, silenceThreshold);
        }
      }

      frameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  /********************** RECORD *************************/
  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size) transcribe(blob);
    };
    rec.start();
    mediaRecorderRef.current = rec;
  };
  const stopRecording = () => mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();

  /********************** TRANSCRIPTION *************************/
  const transcribe = async (blob: Blob) => {
    setIsTranscribing(true);
    const fd = new FormData();
    fd.append("audio", blob, "audio.webm");
    try {
      const r = await fetch("https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo", {
        method: "POST",
        headers: { Authorization: `bearer ${deepInfraToken}` },
        body: fd,
      });
      const j = await r.json();

      // —————————————— filtre anti-bruit ——————————————
      if (!j.text) return;                     // pas de texte -> on ignore
      const txt = j.text.trim();
  
      // 1. Trop court      2. seulement ponctuation/symboles
      if (txt.length < 10 || /^[\\p{P}\\p{S}]+$/u.test(txt)) {
        console.log("💤 bruit ignoré :", JSON.stringify(txt));
        return;                               // on ne lance PAS le LLM
      }
      // ————————————————————————————————————————————————
  
      handleUserText(txt);                    // <- texte « valide »
        console.log("🗣️ Transcription :", txt);
    } catch (e) {
      console.error(e);
    }
    setIsTranscribing(false);
  };

  /********************** CHAT + TTS *************************/
  const handleUserText = async (text: string) => {
    if (!text) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setIsLoading(true);
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.filter((m) => m.role !== "system").slice(-10),
          userMsg,
        ],
      }),
    });
    console.log(r)
    const j = (await r.json()) as any;
    const reply = j.choices?.[0]?.message?.content?.replace(/\*/g, "").trim() || "(pas de réponse)";
    setMessages((m) => [...m, { role: "assistant", content: reply, timestamp: new Date().toLocaleTimeString() }]);
    setIsLoading(false);
    tts(reply);
  };

  /********************** TTS *************************/
  const splitChunks = (txt: string) => {
    if (txt.length <= maxChunkLength) return [txt];
    const out: string[] = [];
    let cur = "";
    txt.split(/([.!?]+\s*)/).forEach((seg) => {
      if ((cur + seg).length > maxChunkLength) {
        out.push(cur.trim());
        cur = seg;
      } else cur += seg;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  const tts = async (text: string) => {
    setIsTTS(true);
    for (const chunk of splitChunks(text)) {
      if (!isTTSRef.current) break;
      const url = await fetchTTS(chunk);
      if (!url) continue;
      await playChunk(url);
    }
    setIsTTS(false);
  };

  const fetchTTS = async (txt: string): Promise<string | null> => {
    try {
      const r = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepInfraToken}` },
        body: JSON.stringify({ text: txt, output_format: "mp3", preset_voice: ["ff_siwis"], speed: 1.0 }),
      });
      const j = await r.json();
      if (!j.audio) return null;
      const b64 = j.audio.startsWith("data:") ? j.audio.split(",")[1] : j.audio;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const playChunk = (url: string) =>
    new Promise<void>((res) => {
      audioMgr.current.play(url);
      const a = audioMgr.current.current!;
      a.onended = () => {
        res();
      };
    });

  const interruptTTS = () => {
    if (!isTTSRef.current) return;
    audioMgr.current.stop();
    setIsTTS(false);
  };

  /********************** UI *************************/
  return (
    <div className="p-4 max-w-xl mx-auto text-gray-100 bg-gray-900 rounded-lg">
      <h2 className="font-bold text-lg mb-4">🎙️ Assistant Vocal (démo)</h2>
      <div className="flex gap-2 mb-4">
        <button onClick={isListening ? stopMic : startMic} className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700">
          {isListening ? "Stop mic" : "Start mic"}
        </button>
        <button onClick={interruptTTS} disabled={!isTTS} className="px-3 py-1 rounded bg-red-600 disabled:opacity-40">
          Stop TTS
        </button>
      </div>

      <div className="text-sm mb-2">Volume: {volume.toFixed(3)} (th {volumeThreshold})</div>
      {isTTS && <div className="text-orange-300 mb-2">TTS playing… Parlez fort pour couper !</div>}
      {isSpeaking && <div className="text-emerald-400 mb-2">● Enregistrement…</div>}
      {isTranscribing && <div className="text-blue-400 mb-2">Transcription…</div>}
      {isLoading && <div className="text-yellow-400 mb-2">IA…</div>}

      <div className="bg-gray-800 p-2 h-60 overflow-y-auto rounded">
        {messages.filter((m) => m.role !== "system").map((m, i) => (
          <p key={i} className={m.role === "user" ? "text-blue-300" : "text-green-300"}>
            <strong>{m.role === "user" ? "Vous" : "Bot"}</strong>: {m.content}
          </p>
        ))}
      </div>
    </div>
  );
};

export default ConversationVocaleAutos;
