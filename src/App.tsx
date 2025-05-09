import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatSansInterruption from "./pages/Help";
import ProductGallery from "./components/ProductGallery";
import productsData from "../public/epitact.json"; // Ajoutez cette ligne
import VRMLipSync from "./components/speech-detector/RobotGentil";
import EpitactAI from "./pages/Epitact";
import ChatSimple from "./pages/ChatSimple";
import ChatDieu from "./pages/ChatDieu";
import SpeechDetector from "./components/speech-detector/SpeechDetector";
import SpeechDetectorClaude from "./components/speech-detector/Testttt";
import EnglishDetector from "./components/speech-detector/EnglishDetector";
import DetectionFinal from "./components/speech-detector/DetectionFinal";
import PlankExerciseApp from "./components/PlankExerciseApp";
import TraducteurVacances from "./components/speech-detector/TraducteurMultilingue";
import SimpleChatApp from "./components/TranslateWithQrCode";
import DetectionFinal2 from "./components/speech-detector/DetectionFinal2";
import DetectionFinal3 from "./components/speech-detector/DetectionFinale3";
import DetectionFinal4 from "./components/speech-detector/DetectionFinale4";
import VRMMouthTest from "./components/speech-detector/VRMMouthTest";
import DetectionFinal5 from "./components/speech-detector/DetectionFInale5";
import AudioMarker from "./components/speech-detector/AudioMarker";
import EventFlower from "./pages/Fleurs";
import DetectionFinal6 from "./components/speech-detector/DetectionFInale6";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/chat" element={<Home />} />
        <Route path="/chatInt" element={<SpeechDetector />} />
        <Route path="/test" element={<SpeechDetectorClaude />} />
        <Route path="/english" element={<EnglishDetector />} />
        <Route path="/final" element={<DetectionFinal />} />
        <Route path="/final2" element={<DetectionFinal2 />} />
        <Route path="/final3" element={<DetectionFinal3 />} />
        <Route path="/final4" element={<DetectionFinal4 />} />
        <Route path="/final6" element={<DetectionFinal6 />} />
        <Route path="/theatre" element={<AudioMarker />} />
        <Route path="/final5" element={<DetectionFinal5 />} />
        <Route path="/chinois" element={<TraducteurVacances />} />
        <Route path="/planches" element={<PlankExerciseApp />} />
        <Route path="/vacances" element={<SimpleChatApp />} />
        <Route path="/robot" element={<VRMLipSync />} />
        <Route path="/" element={<ChatSansInterruption />} />
        <Route path="/chatdieu" element={<ChatDieu />} />
        <Route path="/chatsimple" element={<ChatSimple />} />
        <Route
          path="/epitact"
          element={<ProductGallery products={productsData} />}
        />
        <Route path="/mouth" element={<VRMMouthTest />} />
        <Route path="/fleurs" element={<EventFlower />} />
        <Route path="/epitactai" element={<EpitactAI />} />
      </Routes>
    </div>
  );
}

export default App;
