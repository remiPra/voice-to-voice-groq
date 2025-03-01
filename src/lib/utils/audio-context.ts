// /lib/utils/audio-context.ts

export type GetAudioContextOptions = AudioContextOptions & {
    id?: string;
  };
  
  const map: Map<string, AudioContext> = new Map();
  
  export const audioContext: (
    options?: GetAudioContextOptions,
  ) => Promise<AudioContext> = (() => {
    const didInteract = new Promise((res) => {
      window.addEventListener("pointerdown", res, { once: true });
      window.addEventListener("keydown", res, { once: true });
    });
  
    return async (options?: GetAudioContextOptions) => {
      try {
        const a = new Audio();
        a.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        await a.play();
        if (options?.id && map.has(options.id)) {
          const ctx = map.get(options.id);
          if (ctx) {
            return ctx;
          }
        }
        const ctx = new AudioContext(options);
        if (options?.id) {
          map.set(options.id, ctx);
        }
        return ctx;
      } catch (e) {
        await didInteract;
        if (options?.id && map.has(options.id)) {
          const ctx = map.get(options.id);
          if (ctx) {
            return ctx;
          }
        }
        const ctx = new AudioContext(options);
        if (options?.id) {
          map.set(options.id, ctx);
        }
        return ctx;
      }
    };
  })();