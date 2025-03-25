import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatSansInterruption from "./pages/Help";
import ProductGallery from "./components/ProductGallery";
import productsData from "../public/epitact.json"; // Ajoutez cette ligne
import EpitactAI from "./pages/Epitact";
import ChatSimple from "./pages/ChatSimple";
import ChatDieu from "./pages/ChatDieu";
import SpeechDetector from "./components/speech-detector/SpeechDetector";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/chat" element={<Home />} />
        <Route path="/chatInt" element={<SpeechDetector />} />
        <Route path="/" element={<ChatSansInterruption />} />
        <Route path="/chatdieu" element={<ChatDieu />} />
        <Route path="/chatsimple" element={<ChatSimple />} />
        <Route
          path="/epitact"
          element={<ProductGallery products={productsData} />}
        />
        <Route path="/epitactai" element={<EpitactAI />} />
      </Routes>
    </div>
  );
}

export default App;
