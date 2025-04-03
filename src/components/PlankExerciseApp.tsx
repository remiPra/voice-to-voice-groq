import React, { useState, useEffect, useRef } from 'react';

// Types pour nos états d'exercice
type ExerciseType = 'standard' | 'elbows' | 'transition';
type ExercisePhase = 'idle' | 'exercise' | 'rest' | 'transition';

const PlankExerciseApp: React.FC = () => {
  // États pour gérer notre application
  const [phase, setPhase] = useState<ExercisePhase>('idle');
  const [exerciseType, setExerciseType] = useState<ExerciseType>('standard');
  const [timer, setTimer] = useState<number>(30);
  const [cycle, setCycle] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Référence pour notre intervalle et l'audio
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Fonction pour synthétiser la voix via l'API
  const speak = async (text: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(
        "https://chatbot-20102024-8c94bbb4eddf.herokuapp.com/synthesize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text,
            voice: "Emma", // Vous pouvez ajuster l'ID de voix selon votre API
          }),
        }
      );
      
      if (!response.ok) {
        throw new Error("Erreur lors de la synthèse vocale");
      }
      
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      
      // Créer et jouer l'audio
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      audioRef.current = new Audio(audioUrl);
      await audioRef.current.play();
    } catch (error) {
      console.error("Erreur TTS:", error);
      // Fallback vers la synthèse vocale du navigateur en cas d'erreur
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Gestion du démarrage des exercices
  const startExercise = () => {
    setPhase('exercise');
    setExerciseType('standard');
    setTimer(30);
    setCycle(1);
    speak("Premier exercice: planche standard. 30 secondes. Commencez!");
  };

  // Fonction pour arrêter l'exercice
  const stopExercise = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPhase('idle');
    setTimer(30);
    setCycle(0);
    speak("Exercice arrêté.");
  };
  
  // Gestion du timer et transitions entre phases
  useEffect(() => {
    if (phase === 'idle') return;
    
    intervalRef.current = setInterval(() => {
      setTimer(prevTimer => {
        const newTimer = prevTimer - 1;
        
        // Annonces vocales pour les moments clés
        if (phase === 'exercise' || phase === 'rest') {
          if (newTimer === 20) speak("20 secondes");
          if (newTimer === 10) speak("10 secondes");
          if (newTimer === 3) speak("3");
          if (newTimer === 2) speak("2");
          if (newTimer === 1) speak("1");
        }
        
        // Gestion de la fin du timer
        if (newTimer <= 0) {
          clearInterval(intervalRef.current!);
          
          // Logique pour passer à la phase suivante
          if (phase === 'exercise') {
            if (exerciseType === 'standard') {
              setPhase('transition');
              setTimer(5);
              speak("Préparez-vous à passer sur les coudes. 5 secondes.");
              return 5;
            } else {
              setPhase('rest');
              setTimer(60);
              speak("Repos d'une minute.");
              return 60;
            }
          } else if (phase === 'transition') {
            setPhase('exercise');
            setExerciseType('elbows');
            setTimer(30);
            speak("Planche sur les coudes. 30 secondes. Commencez!");
            return 30;
          } else if (phase === 'rest') {
            if (cycle < 3) {
              setCycle(prevCycle => prevCycle + 1);
              setPhase('exercise');
              setExerciseType('standard');
              setTimer(30);
              speak(`Cycle ${cycle + 1}. Planche standard. 30 secondes. Commencez!`);
              return 30;
            } else {
              setPhase('idle');
              speak("Félicitations! Vous avez terminé les 3 cycles d'exercice.");
              return 0;
            }
          }
        }
        
        return newTimer;
      });
    }, 1000);
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, exerciseType, cycle]);
  
  // Détermine la couleur du fond en fonction de la phase
  const getBackgroundColor = () => {
    if (phase === 'exercise') return 'bg-green-100';
    if (phase === 'rest') return 'bg-blue-100';
    if (phase === 'transition') return 'bg-yellow-100';
    return 'bg-gray-100';
  };

  return (
    <div className={`min-h-screen ${getBackgroundColor()} flex flex-col items-center justify-center p-4`}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">App Exercice de Planche</h1>
        
        {phase === 'idle' ? (
          <>
            <p className="text-xl text-gray-700 mb-4 text-center">
              3 cycles de planches alternées (standard et coudes)
              <br />30 secondes par exercice, 1 minute de repos
            </p>
            <button 
              onClick={startExercise}
              disabled={isLoading}
              className="py-4 px-8 bg-indigo-600 text-white text-xl font-bold rounded-full hover:bg-indigo-700 transition-colors shadow-lg disabled:bg-indigo-400"
            >
              {isLoading ? "CHARGEMENT..." : "COMMENCER"}
            </button>
          </>
        ) : (
          <>
            <div className="text-lg font-medium mb-6 text-gray-600">Cycle {cycle}/3</div>
            <div className="text-2xl font-medium mb-2 text-gray-700">
              {phase === 'exercise' 
                ? `Planche ${exerciseType === 'standard' ? 'Standard' : 'Sur les Coudes'}`
                : phase === 'transition'
                  ? 'Préparation passage sur coudes'
                  : 'Repos'}
            </div>
            <div className="text-6xl font-bold mb-8 text-indigo-600">{timer}</div>
            <p className="text-xl text-gray-700 mb-4 text-center">
              {phase === 'exercise' 
                ? 'Maintenez la position'
                : phase === 'transition'
                  ? 'Préparez-vous à changer de position'
                  : 'Récupérez avant le prochain cycle'}
            </p>
            <button 
              onClick={stopExercise}
              className="py-3 px-6 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors shadow-lg mt-4"
            >
              ARRÊTER
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PlankExerciseApp;