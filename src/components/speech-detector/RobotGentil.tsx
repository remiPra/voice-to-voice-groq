import React, { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment } from "@react-three/drei";
//@ts-ignore
import { SkinnedMesh, Bone, Object3D, MathUtils, Euler, Group } from "three";

// Types
interface Viseme {
  A: number;
  I: number;
  E: number;
  O: number;
  U: number;
}

//@ts-ignore
interface PhonemeMapping {
  [key: string]: Viseme;
}

interface MorphMeshInfo {
  mesh: SkinnedMesh;
  mouthIndices: Record<keyof Viseme, number | undefined>;
  expressionIndices: Record<string, number | undefined>;
}

interface AvatarProps {
  modelPath: string;
  text: string;
  speaking: boolean;
  onSpeechEnd: () => void;
  intensity: number;
  phonemeSpeed: number;
  advancedAnimation: boolean;
}

// Utilitaire de débogage
const logMorphTargets = (scene: Object3D) => {
  console.log("=== MORPH TARGETS DEBUG ===");
  scene.traverse((object: Object3D) => {
    if (object instanceof SkinnedMesh && object.morphTargetDictionary) {
      console.log(`Mesh: ${object.name}`);
      console.log(
        "Available morphs:",
        Object.keys(object.morphTargetDictionary)
      );
    }
    if (object instanceof Bone) {
      console.log(`Bone: ${object.name}`);
    }
  });
  console.log("=========================");
};

// Fonction avancée pour appliquer les visèmes créativement
const applyAdvancedViseme = (
  mesh: SkinnedMesh,
  mouthOpenIndex: number | undefined,
  mouthSmileIndex: number | undefined,
  phoneme: string,
  intensity: number,
  time: number,
  speaking: boolean
) => {
  if (!mesh.morphTargetInfluences || mouthOpenIndex === undefined) return;

  // Valeurs de base pour chaque phonème
  let openValue = 0;
  let smileValue = 0;

  switch (phoneme) {
    case "a":
      // A - bouche grande ouverte, pas de sourire
      openValue = 1.0 * intensity;
      smileValue = 0.0;
      break;
    case "e":
      // E - bouche mi-ouverte avec léger sourire
      openValue = 0.5 * intensity;
      smileValue = 0.3 * intensity;
      break;
    case "i":
      // I - bouche peu ouverte, grand sourire
      openValue = 0.2 * intensity;
      smileValue = 0.9 * intensity;
      break;
    case "o":
      // O - bouche assez ouverte, légèrement arrondie
      openValue = 0.8 * intensity;
      smileValue = -0.1 * intensity; // Valeur négative pour "désourire" si possible
      break;
    case "u":
      // U - bouche peu ouverte, lèvres projetées
      openValue = 0.3 * intensity;
      smileValue = -0.2 * intensity; // Valeur négative pour simuler la projection des lèvres
      break;
    // Consonnes
    case "p":
    case "b":
    case "m":
      // Consonnes labiales - ouverture rapide puis fermeture
      openValue = speaking
        ? Math.sin(time * 15) * 0.6 * intensity
        : 0.2 * intensity;
      smileValue = 0;
      break;
    case "f":
    case "v":
      // Consonnes labiodentales
      openValue = 0.2 * intensity;
      smileValue = 0.5 * intensity;
      break;
    case "t":
    case "d":
      // Consonnes dentales
      openValue = 0.4 * intensity;
      smileValue = 0.1 * intensity;
      break;
    case "s":
    case "z":
      // Sifflantes
      openValue = 0.3 * intensity;
      smileValue = 0.4 * intensity;
      break;
    case "_":
    default:
      // Silence ou autres consonnes
      openValue = 0;
      smileValue = 0;
      break;
  }

  // Ajouter de légères variations pour plus de naturel
  if (speaking) {
    const microMovement = Math.sin(time * 12) * 0.05;
    openValue += microMovement;
  }

  // Appliquer les valeurs aux blendshapes
  mesh.morphTargetInfluences[mouthOpenIndex] = Math.max(
    0,
    Math.min(1, openValue)
  );
  if (mouthSmileIndex !== undefined) {
    mesh.morphTargetInfluences[mouthSmileIndex] = Math.max(
      0,
      Math.min(1, smileValue)
    );
  }
};

// Convertir texte en phonèmes avec une logique améliorée
const textToPhonemes = (text: string): string[] => {
  const phonemes: string[] = [];
  const cleanText = text
    .toLowerCase()
    .replace(/[^\w\sàáâãäåçèéêëìíîïñòóôõöùúûüýÿ]/g, "");

  // Ajouter des phonèmes silencieux entre certaines transitions difficiles
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1] || "";

    if ("aàáâãäå".includes(char)) phonemes.push("a");
    else if ("eèéêë".includes(char)) phonemes.push("e");
    else if ("iìíîï".includes(char)) phonemes.push("i");
    else if ("oòóôõö".includes(char)) phonemes.push("o");
    else if ("uùúûü".includes(char)) phonemes.push("u");
    else if ("pbm".includes(char)) {
      phonemes.push(char);
      // Insérer un phonème de transition pour consonnes labiales
      if ("aeiou".includes(nextChar)) phonemes.push("_");
    } else if ("fv".includes(char)) phonemes.push(char);
    else if ("td".includes(char)) phonemes.push(char);
    else if ("sçz".includes(char)) phonemes.push("s");
    else if (char === " ") phonemes.push("_");
    else phonemes.push("_"); // Pour les autres consonnes, utiliser un phonème neutre
  }

  // Terminer par un silence
  if (phonemes.length > 0 && phonemes[phonemes.length - 1] !== "_") {
    phonemes.push("_");
  }

  return phonemes;
};

// Composant Avatar 3D
const Avatar: React.FC<AvatarProps> = ({
  modelPath,
  text,
  speaking,
  onSpeechEnd,
  intensity,
  phonemeSpeed,
  advancedAnimation,
}) => {
  const groupRef = useRef<Group>(null);
  const { scene } = useGLTF(modelPath);

  const morphMeshesInfo = useRef<MorphMeshInfo[]>([]);
  const headBone = useRef<Bone | null>(null);

  const targetViseme = useRef<Viseme>({ A: 0, I: 0, E: 0, O: 0, U: 0 });
  const currentViseme = useRef<Viseme>({ A: 0, I: 0, E: 0, O: 0, U: 0 });
  const phonemes = useRef<string[]>([]);
  const currentPhonemeIndex = useRef<number>(-1);
  const speechIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const phonemeStartTime = useRef<number>(0);

  const animTime = useRef<number>(0);
  const isBlinking = useRef<boolean>(false);
  const nextBlinkTime = useRef<number>(Math.random() * 3 + 1);
  const phonemeIntervalMs = useRef<number>(100 / phonemeSpeed);

  // Initialisation et rotation du modèle
  useEffect(() => {
    scene.rotation.y = 0; // Pour qu'il soit de face
    scene.position.set(0, -2.5, 2);

    // Déboguer les blendshapes
    logMorphTargets(scene);
  }, [scene]);

  // Mise à jour de l'intervalle des phonèmes quand la vitesse change
  useEffect(() => {
    phonemeIntervalMs.current = 100 / phonemeSpeed;
  }, [phonemeSpeed]);

  // Recherche des mesh avec blendshapes et des os importants
  useEffect(() => {
    const meshesInfoFound: MorphMeshInfo[] = [];
    let headBoneFound: Bone | null = null;

    scene.traverse((object: Object3D) => {
      // Recherche des os
      if (object instanceof Bone) {
        const nameLower = object.name.toLowerCase();
        if (nameLower === "head" || nameLower.includes("head")) {
          headBoneFound = object;
        }
      }

      // Recherche des meshes avec morphs
      if (
        object instanceof SkinnedMesh &&
        object.morphTargetDictionary &&
        object.morphTargetInfluences
      ) {
        const morphDict = object.morphTargetDictionary;
        const morphNames = Object.keys(morphDict);

        // Mappage pour Ready Player Me GLB
        const mouthIndices: Record<keyof Viseme, number | undefined> = {
          A: morphDict[
            morphNames.find(
              (name) =>
                name === "viseme_aa" ||
                name === "mouthOpen" ||
                name.toLowerCase().includes("mouth")
            ) ?? ""
          ],
          I: morphDict[
            morphNames.find(
              (name) =>
                name === "viseme_I" ||
                name === "mouthSmile" ||
                name.toLowerCase().includes("smile")
            ) ?? ""
          ],
          E: morphDict[
            morphNames.find(
              (name) =>
                name === "viseme_E" ||
                name === "mouthOpen" ||
                name.toLowerCase().includes("e")
            ) ?? ""
          ],
          O: morphDict[
            morphNames.find(
              (name) =>
                name === "viseme_O" ||
                name === "mouthOpen" ||
                name.toLowerCase().includes("o")
            ) ?? ""
          ],
          U: morphDict[
            morphNames.find(
              (name) =>
                name === "viseme_U" ||
                name === "mouthPucker" ||
                name.toLowerCase().includes("u")
            ) ?? ""
          ],
        };

        // Expressions faciales
        const expressionIndices: Record<string, number | undefined> = {
          blink:
            morphDict[
              morphNames.find(
                (name) =>
                  name === "eyesClosed" ||
                  name === "eyeBlink_L" ||
                  name.toLowerCase().includes("blink") ||
                  name.toLowerCase().includes("eyes")
              ) ?? ""
            ],
          smile:
            morphDict[
              morphNames.find(
                (name) =>
                  name === "mouthSmile" ||
                  name.toLowerCase().includes("smile") ||
                  name.toLowerCase().includes("joy")
              ) ?? ""
            ],
          jawOpen:
            morphDict[
              morphNames.find(
                (name) =>
                  name === "jawOpen" ||
                  name.toLowerCase().includes("jaw") ||
                  name.toLowerCase().includes("mouth")
              ) ?? ""
            ],
        };

        if (
          Object.values(mouthIndices).some((idx) => idx !== undefined) ||
          Object.values(expressionIndices).some((idx) => idx !== undefined)
        ) {
          meshesInfoFound.push({
            mesh: object,
            mouthIndices,
            expressionIndices,
          });
        }
      }
    });

    morphMeshesInfo.current = meshesInfoFound;
    headBone.current = headBoneFound;

    console.log("Found morphs:", meshesInfoFound.length > 0);
    console.log("Found head bone:", headBoneFound !== null);
  }, [scene, modelPath]);

  // Convertir le texte en phonèmes
  useEffect(() => {
    phonemes.current = textToPhonemes(text);
  }, [text]);

  // Gérer l'animation de parole
  useEffect(() => {
    if (speechIntervalRef.current) {
      clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }

    if (speaking && phonemes.current.length > 0) {
      currentPhonemeIndex.current = 0;
      phonemeStartTime.current = animTime.current;
      //@ts-ignore

      const firstPhoneme = phonemes.current[0];
      targetViseme.current = { A: 0, I: 0, E: 0, O: 0, U: 0 };

      const intervalTime = phonemeIntervalMs.current;

      speechIntervalRef.current = setInterval(() => {
        currentPhonemeIndex.current++;
        phonemeStartTime.current = animTime.current;

        if (currentPhonemeIndex.current >= phonemes.current.length) {
          targetViseme.current = { A: 0, I: 0, E: 0, O: 0, U: 0 };
          if (speechIntervalRef.current)
            clearInterval(speechIntervalRef.current);
          speechIntervalRef.current = null;
          setTimeout(onSpeechEnd, intervalTime * 2);
        }
      }, intervalTime);
    } else {
      targetViseme.current = { A: 0, I: 0, E: 0, O: 0, U: 0 };
      currentPhonemeIndex.current = -1;
    }

    return () => {
      if (speechIntervalRef.current) {
        clearInterval(speechIntervalRef.current);
        speechIntervalRef.current = null;
      }
    };
  }, [speaking, onSpeechEnd, phonemeSpeed]);

  // Animation frame
  useFrame((_, delta) => {
    animTime.current += delta;

    // Fonction lerp pour transition douce
    const lerp = (current: number, target: number, factor: number) =>
      MathUtils.lerp(current, target, 1 - Math.exp(-factor * delta * 60));

    // Mode d'animation standard ou avancé
    if (advancedAnimation) {
      // Animation avancée avec blendshapes combinés de façon créative
      let currentPhoneme = "_";
      //@ts-ignore

      let nextPhoneme = "_";

      if (
        speaking &&
        currentPhonemeIndex.current >= 0 &&
        currentPhonemeIndex.current < phonemes.current.length
      ) {
        currentPhoneme = phonemes.current[currentPhonemeIndex.current];
        nextPhoneme = phonemes.current[currentPhonemeIndex.current + 1] || "_";
      }

      morphMeshesInfo.current.forEach(
        ({ mesh, mouthIndices, expressionIndices }) => {
          if (!mesh.morphTargetInfluences || !mesh.morphTargetDictionary)
            return;

          const mouthOpenIndex = mouthIndices.A;
          const mouthSmileIndex = mouthIndices.I;

          // Utiliser la fonction avancée pour appliquer les visèmes
          applyAdvancedViseme(
            mesh,
            mouthOpenIndex,
            mouthSmileIndex,
            currentPhoneme,
            intensity,
            animTime.current,
            speaking
          );

          // Ajouter un mouvement de mâchoire coordonné si disponible
          if (
            expressionIndices.jawOpen !== undefined &&
            mouthOpenIndex !== undefined
          ) {
            const jawValue = mesh.morphTargetInfluences[mouthOpenIndex] * 0.7;
            mesh.morphTargetInfluences[expressionIndices.jawOpen] = jawValue;
          }
        }
      );

      // Micro-mouvements de tête synchronisés si parlant
      if (headBone.current && speaking) {
        const emphasisFactor =
          currentPhoneme === "a" || currentPhoneme === "o"
            ? 0.5
            : currentPhoneme === "e" || currentPhoneme === "i"
            ? 0.3
            : 0.1;

        const headNod = Math.sin(animTime.current * 8) * 0.02 * emphasisFactor;
        const headTilt = Math.cos(animTime.current * 5) * 0.01 * emphasisFactor;

        headBone.current.rotation.x = MathUtils.lerp(
          headBone.current.rotation.x,
          MathUtils.degToRad(5 + headNod * 15),
          0.1
        );
        headBone.current.rotation.z = MathUtils.lerp(
          headBone.current.rotation.z,
          headTilt * 10,
          0.05
        );
      } else if (headBone.current) {
        // Position neutre quand silencieux
        headBone.current.rotation.x = MathUtils.lerp(
          headBone.current.rotation.x,
          MathUtils.degToRad(5),
          0.1
        );
        headBone.current.rotation.z = MathUtils.lerp(
          headBone.current.rotation.z,
          0,
          0.05
        );
      }
    } else {
      // Animation standard - mise à jour des visèmes
      if (speaking) {
        const currentPhoneme =
          currentPhonemeIndex.current >= 0 &&
          currentPhonemeIndex.current < phonemes.current.length
            ? phonemes.current[currentPhonemeIndex.current]
            : "_";

        // Mappage simple phonème-visème
        if (currentPhoneme === "a")
          targetViseme.current = { A: 1.0 * intensity, I: 0, E: 0, O: 0, U: 0 };
        else if (currentPhoneme === "e")
          targetViseme.current = {
            A: 0.5 * intensity,
            I: 0.3 * intensity,
            E: 0,
            O: 0,
            U: 0,
          };
        else if (currentPhoneme === "i")
          targetViseme.current = {
            A: 0.2 * intensity,
            I: 1.0 * intensity,
            E: 0,
            O: 0,
            U: 0,
          };
        else if (currentPhoneme === "o")
          targetViseme.current = { A: 0.8 * intensity, I: 0, E: 0, O: 0, U: 0 };
        else if (currentPhoneme === "u")
          targetViseme.current = { A: 0.5 * intensity, I: 0, E: 0, O: 0, U: 0 };
        else if (["p", "b", "m"].includes(currentPhoneme))
          targetViseme.current = { A: 0.2 * intensity, I: 0, E: 0, O: 0, U: 0 };
        else if (["f", "v"].includes(currentPhoneme))
          targetViseme.current = {
            A: 0.1 * intensity,
            I: 0.6 * intensity,
            E: 0,
            O: 0,
            U: 0,
          };
        else if (["t", "d"].includes(currentPhoneme))
          targetViseme.current = {
            A: 0.3 * intensity,
            I: 0.2 * intensity,
            E: 0,
            O: 0,
            U: 0,
          };
        else if (["s", "z"].includes(currentPhoneme))
          targetViseme.current = {
            A: 0.2 * intensity,
            I: 0.4 * intensity,
            E: 0,
            O: 0,
            U: 0,
          };
        else targetViseme.current = { A: 0, I: 0, E: 0, O: 0, U: 0 };
      } else {
        targetViseme.current = { A: 0, I: 0, E: 0, O: 0, U: 0 };
      }

      // Transition douce entre les visèmes
      Object.keys(currentViseme.current).forEach((key) => {
        const shape = key as keyof Viseme;
        currentViseme.current[shape] = lerp(
          currentViseme.current[shape],
          targetViseme.current[shape],
          0.7 // Facteur de lerp plus élevé pour des transitions plus rapides
        );
      });

      // Appliquer les morphs de bouche
      morphMeshesInfo.current.forEach(({ mesh, mouthIndices }) => {
        if (!mesh.morphTargetInfluences) return;

        Object.entries(mouthIndices).forEach(([shape, index]) => {
          if (index !== undefined) {
            mesh.morphTargetInfluences![index] =
              currentViseme.current[shape as keyof Viseme];
          }
        });
      });
    }

    // Animation de clignement (indépendante du mode d'animation)
    let blinkValue = 0;
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

    // Appliquer le clignement
    morphMeshesInfo.current.forEach(({ mesh, expressionIndices }) => {
      if (!mesh.morphTargetInfluences) return;
      if (expressionIndices.blink !== undefined) {
        mesh.morphTargetInfluences![expressionIndices.blink] = blinkValue;
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, -1, 0]}>
      <primitive object={scene} scale={2} />
    </group>
  );
};

// Fonction pour communiquer avec l'API Groq
const fetchLLMResponse = async (question: any, messageHistory: any) => {
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messageHistory, { role: "user", content: question }],
          model: "gemma2-9b-it",
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    return {
      text: data.choices[0]?.message?.content || "",
      updatedHistory: [
        ...messageHistory,
        { role: "user", content: question },
        { role: "assistant", content: data.choices[0]?.message?.content || "" },
      ],
    };
  } catch (error) {
    console.error("Erreur lors de la communication avec Groq:", error);
    return {
      text: "Je suis désolé, je n'ai pas pu traiter votre demande.",
      updatedHistory: messageHistory,
    };
  }
};

// Composant principal avec intégration LLM
const GLBAvatarWithLLM = () => {
  const [question, setQuestion] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [modelPath, setModelPath] = useState<string>("./public/man.glb");
  const [intensity, setIntensity] = useState<number>(1.5);
  const [phonemeSpeed, setPhonemeSpeed] = useState<number>(1.0);
  const [advancedAnimation, setAdvancedAnimation] = useState<boolean>(true);
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");

  // Référence pour maintenir l'historique des messages
  const messageHistoryRef = useRef([
    {
      role: "system",
      content:
        "Tu es un assistant virtuel français serviable et concis. Réponds aux questions en français. Sois poli et informatif.",
    },
  ]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Chargement des voix disponibles
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

  // Fonction pour gérer les questions
  const handleQuestionSubmit = async (e: any) => {
    e.preventDefault();

    if (!question.trim() || loading) return;

    setLoading(true);

    // Annuler toute parole en cours
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
    }

    try {
      // Obtenir la réponse du LLM avec Groq
      const { text, updatedHistory } = await fetchLLMResponse(
        question,
        messageHistoryRef.current
      );

      setResponse(text);
      messageHistoryRef.current = updatedHistory;

      // Déclencher la synthèse vocale avec la réponse
      speakResponse(text);
    } catch (error) {
      console.error("Erreur:", error);
      setResponse(
        "Désolé, une erreur est survenue lors de la communication avec l'IA."
      );
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour faire parler l'avatar avec la réponse
  const speakResponse = (text: any) => {
    if (!text.trim()) return;

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
  };

  const handleSpeechEnd = () => {
    // Cette fonction est appelée après la fin de l'animation de la bouche
  };

  const exampleQuestions = [
    "Bonjour, comment vas-tu aujourd'hui ?",
    "Peux-tu m'expliquer comment fonctionne l'intelligence artificielle ?",
    "Raconte-moi une blague courte.",
    "Quelle est la capitale de la France ?",
    "Parle-moi des avancées récentes en robotique.",
  ];

  return (
    <div className="flex flex-col h-screen w-full">
      <div className="flex-1 bg-gray-100 relative">
        <Canvas camera={{ position: [0, 0, 3], fov: 40 }}>
          <color attach="background" args={["#e0e0e0"]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 7.5]} intensity={1.0} />
          <Avatar
            modelPath={modelPath}
            text={response} // Utiliser la réponse du LLM pour l'animation
            speaking={speaking}
            onSpeechEnd={handleSpeechEnd}
            intensity={intensity}
            phonemeSpeed={phonemeSpeed}
            advancedAnimation={advancedAnimation}
          />
          <Environment preset="sunset" />
          <OrbitControls />
        </Canvas>
      </div>

      <div className="bg-white p-4 md:p-6 shadow-lg border-t border-gray-200">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-gray-800 mb-4">
            Assistant IA avec Avatar 3D
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              {/* Formulaire de question */}
              <form onSubmit={handleQuestionSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="question"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Posez votre question:
                  </label>
                  <textarea
                    id="question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Que voulez-vous savoir ?"
                    rows={3}
                    disabled={loading || speaking}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !question.trim() || speaking}
                  className={`w-full py-3 px-4
                  rounded-md text-white font-medium 
                   ${
                     loading
                       ? "bg-yellow-500"
                       : speaking
                       ? "bg-red-600"
                       : "bg-blue-600 hover:bg-blue-700"
                   }
                   disabled:opacity-50`}
                >
                  {loading
                    ? "Réflexion en cours..."
                    : speaking
                    ? "Écouter la réponse..."
                    : "Envoyer la question"}
                </button>
              </form>

              {/* Contrôles de l'avatar */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Paramètres de l'avatar:
                </h3>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="model-path"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Modèle 3D:
                    </label>
                    <input
                      type="text"
                      id="model-path"
                      value={modelPath}
                      onChange={(e) => setModelPath(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                  </div>

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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
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
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={intensity}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="speed"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Vitesse Parole: {phonemeSpeed.toFixed(1)}x
                    </label>
                    <input
                      type="range"
                      id="speed"
                      min="0.7"
                      max="1.5"
                      step="0.1"
                      value={phonemeSpeed}
                      onChange={(e) =>
                        setPhonemeSpeed(parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center mt-2">
                    <input
                      type="checkbox"
                      id="advanced-animation"
                      checked={advancedAnimation}
                      onChange={() => setAdvancedAnimation(!advancedAnimation)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label
                      htmlFor="advanced-animation"
                      className="ml-2 block text-sm text-gray-700"
                    >
                      Animation avancée
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Réponse:
                </label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 h-72 overflow-y-auto">
                  {loading ? (
                    <div className="flex justify-center items-center h-full">
                      <div className="animate-pulse text-gray-500">
                        Réflexion en cours...
                      </div>
                    </div>
                  ) : response ? (
                    <p className="whitespace-pre-wrap">{response}</p>
                  ) : (
                    <p className="text-gray-400 italic">
                      La réponse apparaîtra ici...
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Questions suggérées:
                </h3>
                <div className="space-y-1">
                  {exampleQuestions.map((phrase, index) => (
                    <button
                      key={index}
                      onClick={() => setQuestion(phrase)}
                      disabled={loading || speaking}
                      className="block w-full text-left px-3 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md disabled:opacity-50"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>

              {/* Historique de conversation */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Historique de conversation:
                </h3>
                <div className="h-48 overflow-y-auto border border-gray-300 rounded-md p-2 bg-gray-50">
                  {messageHistoryRef.current.length <= 1 ? (
                    <p className="text-gray-400 italic text-xs">
                      L'historique s'affichera ici...
                    </p>
                  ) : (
                    messageHistoryRef.current.slice(1).map((msg, index) => (
                      <div key={index} className="mb-2">
                        <p
                          className={`text-xs font-semibold ${
                            msg.role === "user"
                              ? "text-blue-600"
                              : "text-green-600"
                          }`}
                        >
                          {msg.role === "user" ? "Vous:" : "Assistant:"}
                        </p>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">
                          {msg.content.length > 150
                            ? `${msg.content.substring(0, 150)}...`
                            : msg.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="mt-4 flex space-x-2 justify-end">
            <button
              onClick={() => {
                if (speaking) {
                  speechSynthesis.cancel();
                  setSpeaking(false);
                }
                setQuestion("");
                setResponse("");
                messageHistoryRef.current = [messageHistoryRef.current[0]]; // Garder seulement le message système
              }}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium"
            >
              Nouvelle conversation
            </button>

            {speaking && (
              <button
                onClick={() => {
                  speechSynthesis.cancel();
                  setSpeaking(false);
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm font-medium"
              >
                Arrêter la parole
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GLBAvatarWithLLM;
