import SpeechDetectorNoInterrupt from "../components/speech-detector/SpeechmedicalInterprete";

function ChatSansInterruption() {
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
      {/* <h1 className="text-3xl font-bold text-center mb-8">
        Détecteur de Parole
      </h1> */}
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
        />
      </div>
    </div>
  );
}

export default ChatSansInterruption;
