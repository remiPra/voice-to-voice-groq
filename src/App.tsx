import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ChatInterrupt from "./pages/Main";
import ChatSansInterruption from "./pages/Help";
import Navbar from "./components/NavBar";
import ProductGallery from "./components/ProductGallery";
import productsData from "../public/epitact.json"; // Ajoutez cette ligne
import EpitactAI from "./pages/Epitact";

function App() {
  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<ChatInterrupt />} />
        <Route path="/chat2" element={<ChatSansInterruption />} />
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
