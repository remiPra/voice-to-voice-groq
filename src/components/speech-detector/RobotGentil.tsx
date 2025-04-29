import React, { useState, useEffect, useRef, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, Stats } from "@react-three/drei";
import { SkinnedMesh, Group, Euler, MathUtils, Object3D, Bone } from "three";

// --- Types ---

interface Viseme {
  A: number;
  I: number;
  E: number;
  O: number;
  U: number;
}

interface PhonemeMapping {
  [key: string]: Viseme;
}

interface ExpressionMorphs {
  blink?: string;
  eyebrowUp?: string;
  eyebrowDown?: string;
  smile?: string;
  sad?: string;
  angry?: string;
  surprised?: string;
}

interface MorphMeshInfo {
  mesh: SkinnedMesh;
  mouthIndices: Record<keyof Viseme, number | undefined>;
  expressionMorphs: ExpressionMorphs;
}

interface AvatarProps {
  modelPath: string;
  text: string;
  speaking: boolean;
  onSpeechEnd: () => void;
  intensity: number;
  animationEnabled: boolean;
}

// --- Constantes ---

const PHONEME_INTERVAL_MS = 100;
const LIP_SYNC_LERP_FACTOR = 0.5;
const HEAD_ROTATION_LERP_FACTOR = 0.05;
// --- MODIFICATIONS: Réduction des mouvements du corps et colonne ---
const BODY_SWAY_LERP_FACTOR = 0.06;
const BODY_SWAY_AMPLITUDE_Y = 0.01; // Réduit
const BODY_SWAY_AMPLITUDE_ROT_Y = 0.02; // Réduit
const BODY_SWAY_FREQ_Y = 0.6;
const BODY_SWAY_FREQ_ROT_Y = 0.4;
const SPINE_ROTATION_LERP_FACTOR = 0.04;
const SPINE_ROTATION_MAX_DEG = 5;

const phonemeToViseme: PhonemeMapping = {
  a: { A: 0.8, I: 0.0, E: 0.1, O: 0.1, U: 0.0 },
  e: { A: 0.1, I: 0.1, E: 0.8, O: 0.0, U: 0.0 },
  i: { A: 0.0, I: 0.8, E: 0.1, O: 0.0, U: 0.1 },
  o: { A: 0.1, I: 0.0, E: 0.0, O: 0.8, U: 0.1 },
  u: { A: 0.0, I: 0.1, E: 0.0, O: 0.1, U: 0.8 },
  p: { A: 0.0, I: 0.0, E: 0.1, O: 0.0, U: 0.0 },
  b: { A: 0.0, I: 0.0, E: 0.1, O: 0.0, U: 0.0 },
  m: { A: 0.0, I: 0.0, E: 0.1, O: 0.0, U: 0.0 },
  f: { A: 0.0, I: 0.3, E: 0.2, O: 0.0, U: 0.0 },
  v: { A: 0.0, I: 0.3, E: 0.2, O: 0.0, U: 0.0 },
  t: { A: 0.1, I: 0.2, E: 0.4, O: 0.0, U: 0.0 },
  d: { A: 0.1, I: 0.2, E: 0.4, O: 0.0, U: 0.0 },
  s: { A: 0.0, I: 0.4, E: 0.5, O: 0.0, U: 0.0 },
  z: { A: 0.0, I: 0.4, E: 0.5, O: 0.0, U: 0.0 },
  _: { A: 0.0, I: 0.0, E: 0.0, O: 0.0, U: 0.0 },
};

// --- Fonctions Utilitaires ---

const textToPhonemes = (text: string): string[] => {
  const phonemes: string[] = [];
  const cleanText = text
    .toLowerCase()
    .replace(/[^\w\sàáâãäåçèéêëìíîïñòóôõöùúûüýÿ]/g, "");
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if ("aàáâãäå".includes(char)) phonemes.push("a");
    else if ("eèéêë".includes(char)) phonemes.push("e");
    else if ("iìíîï".includes(char)) phonemes.push("i");
    else if ("oòóôõö".includes(char)) phonemes.push("o");
    else if ("uùúûü".includes(char)) phonemes.push("u");
    else if ("p".includes(char)) phonemes.push("p");
    else if ("b".includes(char)) phonemes.push("b");
    else if ("m".includes(char)) phonemes.push("m");
    else if ("f".includes(char)) phonemes.push("f");
    else if ("v".includes(char)) phonemes.push("v");
    else if ("t".includes(char)) phonemes.push("t");
    else if ("d".includes(char)) phonemes.push("d");
    else if ("sç".includes(char)) phonemes.push("s");
    else if ("z".includes(char)) phonemes.push("z");
    else if (char === " ") phonemes.push("_");
  }
  if (phonemes.length > 0 && phonemes[phonemes.length - 1] !== "_") {
    phonemes.push("_");
  }
  return phonemes;
};

// --- Composant Avatar ---

const Avatar: React.FC<AvatarProps> = ({
  modelPath,
  text,
  speaking,
  onSpeechEnd,
  intensity,
  animationEnabled,
}) => {
  const groupRef = useRef<Group>(null);
  const { scene } = useGLTF(modelPath);
  useEffect(() => {
    scene.rotation.y = Math.PI;
  }, [scene]);

  useEffect(() => {
    scene.rotation.set(
      MathUtils.degToRad(18),
      -1.03 * Math.PI,
      MathUtils.degToRad(2.2)
    );
    scene.position.set(0, -0.45, 0);
    // --- Mouvement de la tête désactivé (regard fixe) ---
    if (headBone.current) {
      headBone.current.rotation.set(MathUtils.degToRad(5), 0, 0);
    }
  }, [scene]);

  const morphMeshesInfo = useRef<MorphMeshInfo[]>([]);
  const headBone = useRef<Bone | null>(null);
  const spineBone = useRef<Bone | null>(null);

  const targetViseme = useRef<Viseme>({ A: 0, I: 0, E: 0, O: 0, U: 0 });
  const currentViseme = useRef<Viseme>({ A: 0, I: 0, E: 0, O: 0, U: 0 });
  const phonemes = useRef<string[]>([]);
  const currentPhonemeIndex = useRef<number>(-1);
  const speechIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const animTime = useRef<number>(0);
  const nextBlinkTime = useRef<number>(Math.random() * 3 + 1);
  const isBlinking = useRef<boolean>(false);
  const nextMoodChangeTime = useRef<number>(Math.random() * 5 + 8);
  const currentMood = useRef<"neutral" | "smile" | "sad">("neutral");
  // --- MODIFICATIONS: Réduction des mouvements du corps et colonne ---
  const targetBodyPosition = useRef<{ y: number; rotY: number }>({
    y: -1,
    rotY: 0,
  });
  const currentBodyPosition = useRef<{ y: number; rotY: number }>({
    y: -1,
    rotY: 0,
  });
  const targetSpineRotation = useRef<Euler>(new Euler(0, 0, 0));
  const currentSpineRotation = useRef<Euler>(new Euler(0, 0, 0));
  const nextSpineMoveTime = useRef<number>(Math.random() * 6 + 5);

  useEffect(() => {
    const meshesInfoFound: MorphMeshInfo[] = [];
    let headBoneFound: Bone | null = null;
    let spineBoneFound: Bone | null = null;

    scene.traverse((object: Object3D) => {
      if (object instanceof Bone) {
        const nameLower = object.name.toLowerCase();
        if (nameLower === "head") {
          headBoneFound = object;
        } else if (!headBoneFound && nameLower.includes("head")) {
          headBoneFound = object;
        }
        if (nameLower === "spine") {
          spineBoneFound = object;
        } else if (!spineBoneFound && nameLower === "chest") {
          spineBoneFound = object;
        } else if (!spineBoneFound && nameLower.includes("spine")) {
          spineBoneFound = object;
        } else if (!spineBoneFound && nameLower.includes("chest")) {
          spineBoneFound = object;
        }
      }
      if (
        object instanceof SkinnedMesh &&
        object.morphTargetDictionary &&
        object.morphTargetInfluences
      ) {
        const morphDict = object.morphTargetDictionary;
        const morphNames = Object.keys(morphDict);
        const mouthIndices: Record<keyof Viseme, number | undefined> = {
          A: morphDict[
            morphNames.find(
              (name) => name === "Fcl_MTH_A" || name.toLowerCase() === "a"
            ) ?? ""
          ],
          I: morphDict[
            morphNames.find(
              (name) => name === "Fcl_MTH_I" || name.toLowerCase() === "i"
            ) ?? ""
          ],
          E: morphDict[
            morphNames.find(
              (name) => name === "Fcl_MTH_E" || name.toLowerCase() === "e"
            ) ?? ""
          ],
          O: morphDict[
            morphNames.find(
              (name) => name === "Fcl_MTH_O" || name.toLowerCase() === "o"
            ) ?? ""
          ],
          U: morphDict[
            morphNames.find(
              (name) => name === "Fcl_MTH_U" || name.toLowerCase() === "u"
            ) ?? ""
          ],
        };
        const expressionMorphs: ExpressionMorphs = {
          blink: morphNames.find(
            (name) =>
              name === "Fcl_EYE_Close" || name.toLowerCase().includes("blink")
          ),
          eyebrowUp: morphNames.find(
            (name) =>
              name === "Fcl_BRW_Up" || name.toLowerCase().includes("browup")
          ),
          eyebrowDown: morphNames.find(
            (name) =>
              name === "Fcl_BRW_Down" || name.toLowerCase().includes("browdown")
          ),
          smile: morphNames.find(
            (name) =>
              name === "Fcl_MTH_Smile" ||
              name.toLowerCase().includes("smile") ||
              name.toLowerCase().includes("joy")
          ),
          sad: morphNames.find(
            (name) =>
              name === "Fcl_MTH_Sad" ||
              name.toLowerCase().includes("sad") ||
              name.toLowerCase().includes("sorrow")
          ),
          angry: morphNames.find(
            (name) =>
              name === "Fcl_ALL_Angry" || name.toLowerCase().includes("angry")
          ),
          surprised: morphNames.find(
            (name) =>
              name === "Fcl_ALL_Surprised" ||
              name.toLowerCase().includes("surprise")
          ),
        };
        if (
          Object.values(mouthIndices).some((idx) => idx !== undefined) ||
          Object.values(expressionMorphs).some((name) => name !== undefined)
        ) {
          meshesInfoFound.push({
            mesh: object,
            mouthIndices,
            expressionMorphs,
          });
        }
      }
    });

    morphMeshesInfo.current = meshesInfoFound;
    headBone.current = headBoneFound;
    spineBone.current = spineBoneFound;
  }, [scene, modelPath]);

  useEffect(() => {
    phonemes.current = textToPhonemes(text);
  }, [text]);

  useEffect(() => {
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }
    if (speaking && phonemes.current.length > 0) {
      currentPhonemeIndex.current = 0;
      const firstPhoneme = phonemes.current[0];
      targetViseme.current =
        phonemeToViseme[firstPhoneme] ?? phonemeToViseme["_"];
      speechIntervalRef.current = setInterval(() => {
        currentPhonemeIndex.current++;
        if (currentPhonemeIndex.current >= phonemes.current.length) {
          targetViseme.current = phonemeToViseme["_"];
          if (speechIntervalRef.current)
            clearInterval(speechIntervalRef.current);
          speechIntervalRef.current = null;
          setTimeout(onSpeechEnd, PHONEME_INTERVAL_MS * 2);
        } else {
          const phoneme = phonemes.current[currentPhonemeIndex.current];
          targetViseme.current =
            phonemeToViseme[phoneme] ?? phonemeToViseme["_"];
        }
      }, PHONEME_INTERVAL_MS);
    } else {
      targetViseme.current = phonemeToViseme["_"];
      currentPhonemeIndex.current = -1;
    }
    return () => {
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
        speechIntervalRef.current = null;
      }
    };
  }, [speaking, onSpeechEnd]);

  useFrame((state: any, delta) => {
    animTime.current += delta;
    const lerp = (current: number, target: number, factor: number) =>
      MathUtils.lerp(current, target, 1 - Math.exp(-factor * delta * 60));

    // 1. Animation LipSync
    Object.keys(currentViseme.current).forEach((key) => {
      const shape = key as keyof Viseme;
      currentViseme.current[shape] = lerp(
        currentViseme.current[shape],
        targetViseme.current[shape],
        LIP_SYNC_LERP_FACTOR
      );
    });

    morphMeshesInfo.current.forEach(({ mesh, mouthIndices }) => {
      if (!mesh.morphTargetInfluences) return;
      Object.entries(mouthIndices).forEach(([shape, index]) => {
        if (index !== undefined) {
          mesh.morphTargetInfluences![index] =
            currentViseme.current[shape as keyof Viseme] * intensity;
        }
      });
    });

    // 2. Animations secondaires (clignement, humeur, corps, colonne)
    if (animationEnabled) {
      let blinkValue = 0;
      let smileValue = 0;
      let sadValue = 0;
      let eyebrowUpValue = 0;
      let eyebrowDownValue = 0;

      // Clignement
      if (!isBlinking.current && animTime.current > nextBlinkTime.current) {
        isBlinking.current = true;
        nextBlinkTime.current = animTime.current + 0.15;
      }
      if (isBlinking.current) {
        const blinkProgress = MathUtils.mapLinear(
          animTime.current,
          nextBlinkTime.current - 0.15,
          nextBlinkTime.current,
          0,
          1
        );
        blinkValue = Math.sin(blinkProgress * Math.PI);
        if (animTime.current >= nextBlinkTime.current) {
          isBlinking.current = false;
          nextBlinkTime.current = animTime.current + Math.random() * 3 + 2;
        }
      }

      // Humeur
      if (animTime.current > nextMoodChangeTime.current) {
        const moods: ("neutral" | "smile" | "sad")[] = [
          "neutral",
          "smile",
          "sad",
        ];
        currentMood.current = moods[Math.floor(Math.random() * moods.length)];
        nextMoodChangeTime.current = animTime.current + Math.random() * 5 + 5;
      }
      if (currentMood.current === "smile") {
        smileValue = speaking
          ? 0.6 + Math.sin(animTime.current * 2.5) * 0.15
          : 0.7;
      } else if (currentMood.current === "neutral") {
        smileValue = 0.1;
      }
      if (currentMood.current === "sad") sadValue = 0.6;

      morphMeshesInfo.current.forEach(({ mesh, expressionMorphs }) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
        const applyMorph = (morphName: string | undefined, value: number) => {
          if (morphName) {
            const index = mesh.morphTargetDictionary![morphName];
            if (index !== undefined) mesh.morphTargetInfluences![index] = value;
          }
        };
        applyMorph(expressionMorphs.blink, blinkValue);
        applyMorph(expressionMorphs.smile, smileValue);
        applyMorph(expressionMorphs.sad, sadValue);
        applyMorph(expressionMorphs.eyebrowUp, eyebrowUpValue);
        applyMorph(expressionMorphs.eyebrowDown, eyebrowDownValue);
        applyMorph(expressionMorphs.angry, 0);
        applyMorph(expressionMorphs.surprised, 0);
      });

      // --- Mouvement de la tête (désactivé pour regard fixe) ---
      if (headBone.current) {
        headBone.current.rotation.set(MathUtils.degToRad(5), 0, 0);
      }

      // --- Mouvement de la colonne (amplitude réduite) ---
      if (spineBone.current) {
        if (animTime.current > nextSpineMoveTime.current) {
          targetSpineRotation.current.set(
            MathUtils.degToRad(Math.random() * 2 - 1),
            MathUtils.degToRad(Math.random() * 3 - 1.5),
            MathUtils.degToRad(Math.random() * 2 - 1)
          );
          nextSpineMoveTime.current = animTime.current + Math.random() * 6 + 5;
        }
        currentSpineRotation.current.x = lerp(
          currentSpineRotation.current.x,
          targetSpineRotation.current.x,
          SPINE_ROTATION_LERP_FACTOR
        );
        currentSpineRotation.current.y = lerp(
          currentSpineRotation.current.y,
          targetSpineRotation.current.y,
          SPINE_ROTATION_LERP_FACTOR
        );
        currentSpineRotation.current.z = lerp(
          currentSpineRotation.current.z,
          targetSpineRotation.current.z,
          SPINE_ROTATION_LERP_FACTOR
        );
        spineBone.current.rotation.copy(currentSpineRotation.current);
      }

      // --- Balancement du corps (amplitude réduite) ---
      if (groupRef.current) {
        targetBodyPosition.current.y =
          -3.5 +
          Math.sin(animTime.current * BODY_SWAY_FREQ_Y) * BODY_SWAY_AMPLITUDE_Y;
        targetBodyPosition.current.rotY =
          Math.sin(animTime.current * BODY_SWAY_FREQ_ROT_Y) *
          BODY_SWAY_AMPLITUDE_ROT_Y;

        currentBodyPosition.current.y = lerp(
          currentBodyPosition.current.y,
          targetBodyPosition.current.y,
          BODY_SWAY_LERP_FACTOR
        );
        currentBodyPosition.current.rotY = lerp(
          currentBodyPosition.current.rotY,
          targetBodyPosition.current.rotY,
          BODY_SWAY_LERP_FACTOR
        );

        groupRef.current.position.y = currentBodyPosition.current.y;
        groupRef.current.rotation.y = currentBodyPosition.current.rotY;
      }
    } else {
      morphMeshesInfo.current.forEach(({ mesh, expressionMorphs }) => {
        if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary) return;
        Object.values(expressionMorphs).forEach((morphName) => {
          if (morphName) {
            const index = mesh.morphTargetDictionary![morphName];
            if (index !== undefined) mesh.morphTargetInfluences![index] = 0;
          }
        });
      });
      if (headBone.current) headBone.current.rotation.set(0, 0, 0);
      if (spineBone.current) spineBone.current.rotation.set(0, 0, 0);
      if (groupRef.current) {
        groupRef.current.position.y = -1;
        groupRef.current.rotation.y = 0;
      }
    }
  });

  return (
    <group
      ref={groupRef}
      rotation={[0, 0, 0]}
      position={[0, -3, 0]}
      scale={2.5}
    >
      <primitive object={scene} scale={1.5} />
    </group>
  );
};

// --- Composant Principal UI ---

const VRMLipSync: React.FC = () => {
  const [text, setText] = useState<string>(
    "Bonjour, je suis un avatar virtuel."
  );
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [modelPath, setModelPath] = useState<string>("/avatar.vrm");
  const [showStats, setShowStats] = useState<boolean>(false);
  const [animationEnabled, setAnimationEnabled] = useState<boolean>(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0) {
        const frenchVoice = voices.find((v) => v.lang.startsWith("fr"));
        setSelectedVoice(frenchVoice ? frenchVoice.name : voices[0].name);
      }
    };
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      speechSynthesis.cancel();
    };
  }, []);

  const handleSpeak = useCallback(() => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      utteranceRef.current = null;
    } else if (text.trim()) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = availableVoices.find((v) => v.name === selectedVoice);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setSpeaking(true);
      };
      utterance.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = (event) => {
        console.error("SpeechSynthesis Error:", event);
        setSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    }
  }, [text, availableVoices, selectedVoice, speaking]);

  const handleInternalSpeechEnd = useCallback(() => {}, []);

  const examplePhrases = [
    "Bonjour, je suis un avatar virtuel qui parle français.",
    "Les avatars 3D sont très utiles pour créer des expériences interactives.",
    "Abracadabra, voici une démonstration de synchronisation labiale.",
    "Je peux prononcer toutes les voyelles: A E I O U.",
    "Parler est un art qui demande beaucoup de pratique.",
  ];

  return (
    <div className="flex flex-col h-screen w-full">
      <div className="flex-1 bg-gray-100 relative">
        <Canvas camera={{ position: [0, 0, 3], fov: 40 }} shadows>
          <React.Suspense fallback={null}>
            <color attach="background" args={["#e0e0e0"]} />
            <ambientLight intensity={0.6} />
            <directionalLight
              position={[5, 10, 7.5]}
              intensity={1.0}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -1, 0]}
              receiveShadow
            >
              <planeGeometry args={[10, 10]} />
              <shadowMaterial opacity={0.3} />
            </mesh>
            <Avatar
              key={modelPath}
              modelPath={modelPath}
              text={text}
              speaking={speaking}
              onSpeechEnd={handleInternalSpeechEnd}
              intensity={intensity}
              animationEnabled={animationEnabled}
            />
            <Environment preset="sunset" />
            <OrbitControls target={[0, 1.5, 0]} />
          </React.Suspense>
          {showStats && <Stats />}
        </Canvas>
        <button
          onClick={() => setShowStats(!showStats)}
          className="absolute top-2 right-2 bg-gray-800 text-white p-2 rounded-full opacity-50 hover:opacity-100 z-10"
          title={showStats ? "Masquer Stats" : "Afficher Stats"}
        >
          📊
        </button>
      </div>

      <div className="bg-white p-4 md:p-6 shadow-lg border-t border-gray-200 overflow-y-auto max-h-[50vh]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">
            Contrôles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="voice-select"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Voix:
                </label>
                <select
                  id="voice-select"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={speaking}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {availableVoices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="intensity"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Intensité Lèvres: {intensity.toFixed(1)}
                </label>
                <input
                  type="range"
                  id="intensity"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={intensity}
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label
                  htmlFor="model-path"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Modèle VRM:
                </label>
                <input
                  type="text"
                  id="model-path"
                  value={modelPath}
                  onChange={(e) => setModelPath(e.target.value)}
                  placeholder="/chemin/vers/avatar.vrm"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center">
                <input
                  id="animation-toggle"
                  type="checkbox"
                  checked={animationEnabled}
                  onChange={() => setAnimationEnabled(!animationEnabled)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="animation-toggle"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Activer animations secondaires
                </label>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="speech-text"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Texte:
                </label>
                <textarea
                  id="speech-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Entrez le texte ici..."
                  rows={4}
                  disabled={speaking}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                />
              </div>
              <button
                onClick={handleSpeak}
                disabled={!text.trim()}
                className={`w-full py-3 px-4 rounded-md text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  speaking
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {speaking ? "Arrêter" : "Parler"}
              </button>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Exemples:
                </h3>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {examplePhrases.map((phrase, index) => (
                    <button
                      key={index}
                      onClick={() => setText(phrase)}
                      disabled={speaking}
                      className="block w-full text-left px-3 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VRMLipSync;
