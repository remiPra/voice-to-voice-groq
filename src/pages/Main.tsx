// /app.tsx
import SpeechDetectorNoInterrupt from "../components/speech-detector/SpeechmedicalInterprete";

function ChatInterrupt() {
  const handleSpeechStart = () => {
    console.log("L'utilisateur a commencé à parler");
  };

  const handleSpeechEnd = () => {
    console.log("L'utilisateur a fini de parler");
  };
  // @ts-ignore - Utilisé dans handleSpeechEnd mais pas dans le JSX
  const handleVolumeChange = (volume: number) => {
    // Vous pouvez limiter le nombre d'appels si nécessaire
    // console.log("Volume actuel:", volume);
  };

  return (
    <div className=" mx-auto">
      <h1 className="text-3xl font-bold text-center mb-8">
        Détecteur de Parole avec interruption
      </h1>
      <div className="mx-auto">
        {/* <SpeechDetector 
          onSpeechStart={handleSpeechStart}
          onSpeechEnd={handleSpeechEnd}
          onVolumeChange={handleVolumeChange}
          silenceThreshold={0.01}
          silenceTimeout={400}
          minSpeechDuration={200}
        /> */}
        <SpeechDetectorNoInterrupt
          onSpeechStart={handleSpeechStart}
          onSpeechEnd={handleSpeechEnd}
          onVolumeChange={handleVolumeChange}
          silenceThreshold={0.01}
          silenceTimeout={400}
          minSpeechDuration={200}
          systemPrompta={`Adopte le rôle d'un guérisseur spirituel bienveillant et sage. 
                  Tu apportes réconfort et guérison par tes paroles. 
                  Parle avec douceur et conviction, offrant espoir et solutions concrètes. 
                  Utilise un langage simple mais puissant qui touche l'âme. 
                  Transmets la sagesse ancestrale tout en restant accessible. 
                  Tes réponses sont brèves, deux phrases maximum, 
                  mais profondément réconfortantes, créant un espace de guérison et de transformation. Rassure avec empathie mais sans fausse 
                  promesse.`}
        />
      </div>
    </div>
  );
}

export default ChatInterrupt;
