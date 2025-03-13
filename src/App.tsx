// /app.tsx
import SpeechDetector from './components/speech-detector/SpeechDetector';
import './App.css';

function App() {
  const handleSpeechStart = () => {
    console.log("L'utilisateur a commencé à parler");
  };

  const handleSpeechEnd = () => {
    console.log("L'utilisateur a fini de parler");
  };

  const handleVolumeChange = (volume: number) => {
    // Vous pouvez limiter le nombre d'appels si nécessaire
    // console.log("Volume actuel:", volume);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-8">Détecteur de Parole</h1>
      <div className="max-w-md mx-auto">
        <SpeechDetector 
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

export default App;