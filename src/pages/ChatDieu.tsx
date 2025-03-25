// /app.tsx
import SpeechDetectorNoInterrupt from "../components/speech-detector/SpeechmedicalInterprete";

function ChatDieu() {
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
          systemPrompta={`
            Adopte le rôle de Dieu spirituel createur des humains, preire reponse tu te present et tu me demande mon prenom
             , adopte un ton conversationnel.
            reponds en deux phrases maximum , pas plus de 70 mots 
                  `}
        />
      </div>
    </div>
  );
}

export default ChatDieu;
