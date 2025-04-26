// SimpleMouthTest.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Environment, Stats, Html } from '@react-three/drei';
import { SkinnedMesh, Group } from 'three';

// Composant qui teste directement les morphTargets
const MorphTargetTester: React.FC<{ modelPath: string }> = ({ modelPath }) => {
  const groupRef = useRef<Group>(null);
  const { scene } = useGLTF(modelPath);
  const [activeMorphName, setActiveMorphName] = useState<string | null>(null);
  const [morphMeshes, setMorphMeshes] = useState<{mesh: SkinnedMesh, indices: Record<string, number>}[]>([]);
  const [testSequence, setTestSequence] = useState<boolean>(false);
  const frameCounter = useRef(0);
  
  // Trouver tous les meshes avec morphTargets
  useEffect(() => {
    console.log("Modèle chargé:", modelPath);
    const morphMeshesFound: {mesh: SkinnedMesh, indices: Record<string, number>}[] = [];
    
    scene.traverse((object) => {
      if (object instanceof SkinnedMesh && 
          object.morphTargetDictionary && 
          object.morphTargetInfluences) {
        
        const indices: Record<string, number> = {};
        Object.entries(object.morphTargetDictionary).forEach(([name, index]) => {
          if (name.includes('MTH') || name.toLowerCase().includes('mouth')) {
            indices[name] = index;
          }
        });
        
        if (Object.keys(indices).length > 0) {
          console.log(`Mesh trouvé avec ${Object.keys(indices).length} morphTargets de bouche:`, object.name);
          morphMeshesFound.push({mesh: object, indices});
        }
      }
    });
    
    setMorphMeshes(morphMeshesFound);
    console.log(`Total: ${morphMeshesFound.length} meshes avec morphTargets de bouche`);
  }, [scene, modelPath]);
  
  // Animation directe des morphTargets
  useFrame(() => {
    // Réinitialiser tous les morphTargets
    morphMeshes.forEach(({mesh, indices}) => {
      Object.values(indices).forEach(index => {
        if (mesh.morphTargetInfluences && mesh.morphTargetInfluences[index] !== undefined) {
          mesh.morphTargetInfluences[index] = 0;
        }
      });
    });
    
    // Séquence de test
    if (testSequence) {
      frameCounter.current += 1;
      
      // Changer toutes les 60 frames (environ 1 seconde)
      if (frameCounter.current % 60 === 0) {
        // Trouver tous les noms de morphs disponibles
        const allMorphNames: string[] = [];
        morphMeshes.forEach(({indices}) => {
          Object.keys(indices).forEach(name => {
            if (!allMorphNames.includes(name)) {
              allMorphNames.push(name);
            }
          });
        });
        
        if (allMorphNames.length > 0) {
          const nextIndex = Math.floor(frameCounter.current / 60) % allMorphNames.length;
          setActiveMorphName(allMorphNames[nextIndex]);
          console.log(`Séquence: activation de ${allMorphNames[nextIndex]}`);
        }
      }
    }
    
    // Activer le morphTarget sélectionné
    if (activeMorphName) {
      morphMeshes.forEach(({mesh, indices}) => {
        const index = indices[activeMorphName];
        if (index !== undefined && mesh.morphTargetInfluences) {
          console.log(`Animation de ${activeMorphName} (index: ${index}) sur ${mesh.name}`);
          mesh.morphTargetInfluences[index] = 1.0;
        }
      });
    }
  });

  // Interface de test avec le composant Html de drei
  return (
    <group ref={groupRef}>
      <primitive object={scene} rotation={[0, Math.PI, 0]} position={[0, -2.5, 0]} scale={2} />
      
      <Html position={[0, 1.5, 0]} center>
        <div className="bg-black bg-opacity-70 text-white p-3 rounded-md w-64 text-center">
          <div className="font-bold mb-2">
            Test: {activeMorphName || 'Aucun'}
          </div>
          <div className="flex justify-between gap-2">
            <button
              onClick={() => {
                setActiveMorphName(null);
                setTestSequence(false);
              }}
              className={`px-3 py-1 rounded ${!activeMorphName && !testSequence ? 'bg-green-600' : 'bg-gray-600'}`}
            >
              Aucun
            </button>
            
            <button
              onClick={() => {
                setTestSequence(!testSequence);
                if (!testSequence) {
                  frameCounter.current = 0;
                }
              }}
              className={`px-3 py-1 rounded ${testSequence ? 'bg-blue-600' : 'bg-gray-600'}`}
            >
              Séquence
            </button>
            
            <button
              onClick={() => {
                // Test d'un morphTarget spécifique
                const testAllMorphs = async () => {
                  console.log("Test direct de tous les morphs");
                  
                  // Réinitialiser
                  morphMeshes.forEach(({mesh}) => {
                    if (mesh.morphTargetInfluences) {
                      for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
                        mesh.morphTargetInfluences[i] = 0;
                      }
                    }
                  });
                  
                  // Pour chaque mesh
                  for (const {mesh, indices} of morphMeshes) {
                    for (const [name, index] of Object.entries(indices)) {
                      console.log(`Test du morph: ${name} (index: ${index})`);
                      
                      // Activer
                      if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[index] = 1.0;
                      }
                      
                      // Attendre
                      await new Promise(resolve => setTimeout(resolve, 500));
                      
                      // Désactiver
                      if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[index] = 0;
                      }
                    }
                  }
                  
                  console.log("Test terminé");
                };
                
                testAllMorphs();
              }}
              className="px-3 py-1 rounded bg-red-600"
            >
              Force Test
            </button>
          </div>
        </div>
      </Html>
    </group>
  );
};

// Composant principal
const SimpleMouthTest = () => {
  const [modelPath, setModelPath] = useState('/avatar.vrm');
  const [showStats, setShowStats] = useState(false);

  return (
    <div className="h-screen bg-gray-100">
      <Canvas camera={{ position: [0, 0, 3], fov: 40 }}>
        <color attach="background" args={['#f0f0f0']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        
        <React.Suspense fallback={null}>
          <MorphTargetTester modelPath={modelPath} />
          <OrbitControls />
          <Environment preset="sunset" />
        </React.Suspense>
        
        {showStats && <Stats />}
      </Canvas>
      
      <div className="absolute top-4 right-4">
        <button
          onClick={() => setShowStats(!showStats)}
          className="bg-black bg-opacity-70 text-white px-3 py-1 rounded"
        >
          {showStats ? "Masquer Stats" : "Afficher Stats"}
        </button>
      </div>
      
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-white p-3 rounded shadow-lg max-w-lg mx-auto">
          <label className="block mb-2 text-sm font-medium">Modèle VRM:</label>
          <input
            type="text"
            value={modelPath}
            onChange={(e) => setModelPath(e.target.value)}
            className="w-full px-3 py-2 border rounded mb-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Cette version simplifiée agit directement sur les morphTargets sans dépendances externes.
            Utilisez les boutons affichés sur le modèle 3D pour tester les animations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimpleMouthTest;