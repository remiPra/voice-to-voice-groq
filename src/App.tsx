import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatInterrupt from "./pages/Main";
import ChatSansInterruption from "./pages/Help";
import ProductGallery from "./components/ProductGallery";
import productsData from "../public/epitact.json"; // Ajoutez cette ligne
import EpitactAI from "./pages/Epitact";

function App() {
  return (
    <div>
      <Routes>
        <Route path="/chat" element={<Home />} />
        <Route path="/chatInt" element={<ChatInterrupt />} />
        <Route path="/" element={<ChatSansInterruption />} />
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
