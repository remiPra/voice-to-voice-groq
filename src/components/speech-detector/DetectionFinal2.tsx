// @ts-nocheck
import React, { useState, useRef } from "react";

/******************************
 * DetectionFinal2 V3 *
 * — détection RMS + gate      *
 * — WebSpeech Recognition     *
 * — TTS par chunks + cut      *
 ******************************/

interface VoiceDetectorProps {
  deepInfraToken?: string;       // <-- juste pour le TTS
  systemPrompt?: string;
  volumeThreshold?: number;      // seuil déclenchement parole
  silenceThreshold?: number;     // ms de silence pour “fin”
  maxChunkLength?: number;       // découpe TTS
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

/* ----------------- helpers ------------------ */
declare global {
  interface Window {
    currentPlayingAudio: HTMLAudioElement | null;
  }
}
window.currentPlayingAudio = null;

const buildAudioManager = (notify: (p: boolean) => void) => ({
  current: null as HTMLAudioElement | null,
  play(url: string) {
    this.stop();
    const a = new Audio(url);
    a.onplay   = () => notify(true);
    a.onended  = () => { notify(false); URL.revokeObjectURL(url); this.current = null; window.currentPlayingAudio = null; };
    a.onerror  = () => { notify(false); URL.revokeObjectURL(url); this.current = null; window.currentPlayingAudio = null; };
    this.current = a;
    window.currentPlayingAudio = a;
    a.play().catch(() => notify(false));
  },
  stop() {
    if (this.current) {
      try { this.current.pause(); this.current.currentTime = 0; if (this.current.src.startsWith("blob:")) URL.revokeObjectURL(this.current.src); } catch {}
    }
    this.current = null;
    window.currentPlayingAudio = null;
    notify(false);
  },
});

/* -------------- composant principal --------------- */
const DetectionFinal2: React.FC<VoiceDetectorProps> = ({
  deepInfraToken = "T9lFMOSO2Xtcl0CdIpCC9qVQ75Ss2IGV",
  systemPrompt   = "You are a helpful French vocal assistant tu es un assistant vocal francophone. Tes réponses sont en français, limitées à trois phrases maximum, bien structurées, et contiennent des informations concrètes et directement actionnables.",
  volumeThreshold   = 0.08,
  silenceThreshold  = 1200,
  maxChunkLength    = 140,
}) => {
  /* ---------- state ---------- */
  const [isListening, setIsListening]     = useState(false);
  const [isSpeaking,  setIsSpeaking]      = useState(false);
  const [isLoading,   setIsLoading]       = useState(false);
  const [isTTS,       _setIsTTS]          = useState(false);
  const [volume,      setVolume]          = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: systemPrompt, timestamp: new Date().toLocaleTimeString() },
  ]);
  const setIsTTS = (v: boolean) => { _setIsTTS(v); isTTSRef.current = v; };

  /* ---------- refs ---------- */
  const audioContextRef  = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const frameRef         = useRef<number | null>(null);
  const rmsHistRef       = useRef<number[]>([]);
  const isSpeakingRef    = useRef(false);
  const lastVoiceRef     = useRef(0);
  const silenceTimerRef  = useRef<number | null>(null);
  const isTTSRef         = useRef(false);
  const loudFramesRef    = useRef(0);

  /* --- Web Speech --- */
  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognitionRef    = useRef<SpeechRecognition | null>(null);

  /* --- coupure TTS --- */
  const INTERRUPT_MULT   = 1.8;
  const INTERRUPT_FRAMES = 8;

  /* --- Audio manager --- */
  const audioMgr = useRef(buildAudioManager(setIsTTS));

  /* ========================================================
   *                 MICRO + ANALYSER LOOP
   * ====================================================== */
  const startMic = async () => {
    if (isListening) return;
    if (!SpeechRecognition) { alert("Web Speech API non supportée 🙁"); return; }

    /* audio graph */
    const ctx     = new (window.AudioContext || (window as any).webkitAudioContext)();
    const stream  = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const analyser= ctx.createAnalyser(); analyser.fftSize = 2048;

    /* petit filtre passe-bande pour réduire souffles / klaxons */
    const band = ctx.createBiquadFilter();
    band.type = "bandpass"; band.frequency.value = 800; band.Q.value = 0.7;
    ctx.createMediaStreamSource(stream).connect(band); band.connect(analyser);

    audioContextRef.current = ctx;
    analyserRef.current     = analyser;
    streamRef.current       = stream;
    setIsListening(true);

    /* Web Speech config */
    const rec = new SpeechRecognition();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const txt = ev.results[0][0].transcript.trim();
      console.log("🎤 WebSpeech:", txt);
      if (txt.length < 10 || /^[\p{P}\p{S}]+$/u.test(txt)) return;
      handleUserText(txt);
    };
    rec.onerror  = (e) => console.warn("Speech error:", e.error);
    recognitionRef.current = rec;

    detect();            // lance la boucle
  };

  const stopMic = () => {
    setIsListening(false);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    recognitionRef.current?.abort(); recognitionRef.current = null;
    audioContextRef.current?.close(); audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    analyserRef.current = null;
  };

  /* ---------------- Boucle de détection RMS ---------------- */
  const detect = () => {
    if (!analyserRef.current) return;
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);

    const loop = () => {
      analyserRef.current!.getByteFrequencyData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + (v / 255) ** 2, 0) / buf.length);
      const hist = rmsHistRef.current;
      hist.push(rms); if (hist.length > 5) hist.shift();
      const smooth = hist.reduce((a, b) => a + b, 0) / hist.length;
      setVolume(smooth);

      /* === coupure TTS === */
      if (isTTSRef.current) {
        const loud = smooth > volumeThreshold * INTERRUPT_MULT;
        loudFramesRef.current = loud ? loudFramesRef.current + 1 : Math.max(0, loudFramesRef.current - 1);
        if (loudFramesRef.current >= INTERRUPT_FRAMES) { interruptTTS(); loudFramesRef.current = 0; }
        frameRef.current = requestAnimationFrame(loop); return;
      }

      /* === détection parole === */
      const now = Date.now();
      if (smooth > volumeThreshold && smooth > 0.03) {        // gate supplémentaire
        lastVoiceRef.current = now;
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          setIsSpeaking(true);
          recognitionRef.current?.start();
        }
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      } else if (isSpeakingRef.current && !silenceTimerRef.current) {
        if (now - lastVoiceRef.current > 150) {
          silenceTimerRef.current = window.setTimeout(() => {
            recognitionRef.current?.stop();   // déclenche onresult
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

  /* ========================================================
   *            LLM + TTS   (inchangés vs ta v2)
   * ====================================================== */
  const handleUserText = async (text: string) => {
    const userMsg: Message = { role: "user", content: text };
    setMessages(m => [...m, userMsg]);
    setIsLoading(true);
    try {
      const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: "mistral-small-latest",
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.filter(m => m.role !== "system").slice(-10),
            userMsg,
          ],
        }),
      });
      const j = await r.json();
      const reply = j.choices?.[0]?.message?.content?.replace(/\*/g, "").trim() || "(pas de réponse)";
      setMessages(m => [...m, { role: "assistant", content: reply, timestamp: new Date().toLocaleTimeString() }]);
      tts(reply);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const splitChunks = (txt: string) => {
    if (txt.length <= maxChunkLength) return [txt];
    const out: string[] = []; let cur = "";
    txt.split(/([.!?]+\s*)/).forEach(seg => {
      if ((cur + seg).length > maxChunkLength) { out.push(cur.trim()); cur = seg; }
      else cur += seg;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
  };

  const fetchTTS = async (txt: string): Promise<string | null> => {
    try {
      const r = await fetch("https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepInfraToken}` },
        body: JSON.stringify({ text: txt, output_format: "mp3", preset_voice: ["ff_siwis"], speed: 1.0 }),
      });
      const j = await r.json(); if (!j.audio) return null;
      const b64 = j.audio.startsWith("data:") ? j.audio.split(",")[1] : j.audio;
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    } catch (e) { console.error(e); return null; }
  };

  const playChunk = (url: string) => new Promise<void>(res => {
    audioMgr.current.play(url);
    audioMgr.current.current!.onended = () => res();
  });

  const tts = async (txt: string) => {
    setIsTTS(true);
    for (const chunk of splitChunks(txt)) {
      if (!isTTSRef.current) break;
      const url = await fetchTTS(chunk);
      if (url) await playChunk(url);
    }
    setIsTTS(false);
  };

  const interruptTTS = () => { if (isTTSRef.current) { audioMgr.current.stop(); setIsTTS(false); } };

  /* ======================================================== */
  return (
    <div className="p-4 max-w-xl mx-auto text-gray-100 bg-gray-900 rounded-lg">
      <h2 className="font-bold text-lg mb-4">🎙️ Assistant Vocal (WebSpeech)</h2>

      <div className="flex gap-2 mb-4">
        <button onClick={isListening ? stopMic : startMic} className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700">
          {isListening ? "Stop mic" : "Start mic"}
        </button>
        <button onClick={interruptTTS} disabled={!isTTS} className="px-3 py-1 rounded bg-red-600 disabled:opacity-40">
          Stop TTS
        </button>
      </div>

      <div className="text-sm mb-2">Volume : {volume.toFixed(3)} (th {volumeThreshold})</div>
      {isTTS      && <div className="text-orange-300 mb-2">TTS en cours… Parlez fort pour couper !</div>}
      {isSpeaking && <div className="text-emerald-400 mb-2">● Enregistrement…</div>}
      {isLoading  && <div className="text-yellow-400 mb-2">IA…</div>}

      <div className="bg-gray-800 p-2 h-60 overflow-y-auto rounded">
        {messages.filter(m => m.role !== "system").map((m, i) => (
          <p key={i} className={m.role === "user" ? "text-blue-300" : "text-green-300"}>
            <strong>{m.role === "user" ? "Vous" : "Bot"}</strong> : {m.content}
          </p>
        ))}
      </div>
    </div>
  );
};

export default DetectionFinal2;
