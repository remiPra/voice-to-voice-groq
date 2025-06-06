import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatSansInterruption from "./pages/Help";
import ProductGallery from "./components/ProductGallery";
import productsData from "../public/epitact.json";
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
import DetectionFinal6 from "./components/speech-detector/DetectionFInale6";
import DetectionFinal7 from "./components/speech-detector/DetectionFinale7";
import VoiceComponent from "./components/hooks/Main";
import Login from "./pages/Login"; // Importez la page de connexion
import ProtectedRoute from "./pages/ProtectedRoute"; // Importez le composant de protection
import DetectionFinal8 from "./components/speech-detector/DetectionFinale8";
import PhoneCapture from "./components/speech-detector/PhoneCapture";
import ChatWithMemory from "./pages/ChatWithMemory";
import CoachMinceurChat from "./pages/CoachMinceur";
import TestDetectionVoix from "./components/speech-detector/TestDetectionVoix";
import ConversationVocaleAutos from "./components/speech-detector/DetectionFinal06062025";

function App() {
  return (
    <div>
      <Routes>
        {/* Route de connexion accessible à tous */}
        <Route path="/login" element={<Login />} />
        <Route path="/chinois" element={<TraducteurVacances />} />
        <Route path="/vacances" element={<SimpleChatApp />} />
        <Route path="/english" element={<EnglishDetector />} />

        {/* Routes protégées */}
        <Route element={<ProtectedRoute />}>
          <Route path="/chat" element={<Home />} />
          <Route path="/chatInt" element={<SpeechDetector />} />
          <Route path="/test" element={<SpeechDetectorClaude />} />
          <Route path="/final" element={<DetectionFinal />} />
          <Route path="/final2" element={<DetectionFinal2 />} />
          <Route path="/final3" element={<DetectionFinal3 />} />
          <Route path="/final4" element={<DetectionFinal4 />} />
          <Route path="/final6" element={<DetectionFinal6 />} />
          <Route path="/theatre" element={<AudioMarker />} />
          <Route path="/final5" element={<DetectionFinal5 />} />
          <Route path="/final7" element={<DetectionFinal7 />} />
          <Route path="/final8" element={<DetectionFinal8 />} />
          <Route path="/planches" element={<PlankExerciseApp />} />
          <Route path="/hacker" element={<PhoneCapture />} />
          <Route path="/robot" element={<VRMLipSync />} />
          <Route path="/" element={<ChatSansInterruption />} />
          <Route path="/chatdieu" element={<ChatDieu />} />
          <Route path="/chatsimple" element={<ChatSimple />} />
          <Route
            path="/epitact"
            element={<ProductGallery products={productsData} />}
          />
          <Route path="/chtmemory" element={<ChatWithMemory />} />
          <Route path="/testdetection" element={<TestDetectionVoix />} />

          <Route path="/mouth" element={<VRMMouthTest />} />
          <Route path="/minceur" element={<CoachMinceurChat />} />
          <Route path="/complete" element={<VoiceComponent />} />
          <Route path="/testdetections" element={<ConversationVocaleAutos />} />
          <Route path="/epitactai" element={<EpitactAI />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;
