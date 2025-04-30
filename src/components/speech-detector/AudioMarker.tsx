// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
// Import WaveSurfer
import WaveSurfer from "wavesurfer.js";
// Import pour TypeScript
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

// Déclaration de types pour corriger les erreurs TypeScript
declare module "wavesurfer.js" {
  interface WaveSurfer {
    regions: {
      add(params: any): any;
      list: Record<string, any>;
      clearRegions(): void;
    };
  }
}

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAA2qFckzsZ8lNVTrZvDmeQ-i1tmAphmio",
  authDomain: "translate-holiaday.firebaseapp.com",
  projectId: "translate-holiaday",
  storageBucket: "translate-holiaday.firebasestorage.app",
  messagingSenderId: "686646844992",
  appId: "1:686646844992:web:04c69fca0d86733f5609a5",
  measurementId: "G-NKX65TX5PH",
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface Replique {
  id?: string;
  personnage: string;
  debut: number;
  fin: number;
  transcription?: string;
}

const AudioMarker: React.FC = () => {
  // Références
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const lastVolumeChange = useRef<number>(Date.now());

  // États
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioPath] = useState("/theatre.mp3");
  const [personnages] = useState([
    "Rémy",
    "Manel",
    "Sandrine",
    "Cathy",
    "Ben",
    "Marie",
    "Sophie",
    "Flo",
    "Béné",
    "Elvire",
    "Sylvie",
  ]);
  const [personnageSelectionne, setPersonnageSelectionne] = useState("");
  const [debutReplique, setDebutReplique] = useState<number | null>(null);
  const [finReplique, setFinReplique] = useState<number | null>(null);
  const [repliques, setRepliques] = useState<Replique[]>([]);
  const [transcription, setTranscription] = useState("");
  const [personnageSilence, setPersonnageSilence] = useState("");
  const [modeEdition, setModeEdition] = useState(false);
  const [silenceActif, setSilenceActif] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(1);
  const [debugInfo, setDebugInfo] = useState({
    currentTime: 0,
    estDansSilence: false,
    repliquesPersonnage: [],
    lastCheck: Date.now(),
  });
  const [personnageFocus, setPersonnageFocus] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Formatage du temps pour afficher minutes:secondes
  const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Initialisation de WaveSurfer
  useEffect(() => {
    if (waveformRef.current) {
      console.log("Initialisation de WaveSurfer...");
      // Import dynamique pour éviter les problèmes de TypeScript
      import("wavesurfer.js/dist/plugins/regions.js").then((RegionsPlugin) => {
        if (waveformRef.current) {
          wavesurfer.current = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: "#4F4F4F",
            progressColor: "#385F71",
            cursorColor: "#F76C6C",
            barWidth: 2,
            barRadius: 3,
            responsive: true,
            height: 150,
            plugins: [RegionsPlugin.default.create()],
          });
        }

        wavesurfer.current.on("play", () => {
          setIsPlaying(true);
          console.log("Lecture démarrée");
        });

        wavesurfer.current.on("pause", () => {
          setIsPlaying(false);
          console.log("Lecture en pause");
        });

        wavesurfer.current.on("ready", () => {
          console.log("WaveSurfer est prêt");
          setDuration(wavesurfer.current.getDuration());
        });

        wavesurfer.current.on("audioprocess", () => {
          setCurrentTime(wavesurfer.current.getCurrentTime());
        });

        // Charger le fichier audio
        wavesurfer.current.load(audioPath);
        console.log("Chargement du fichier audio:", audioPath);

        // Charger les répliques depuis Firestore une fois WaveSurfer initialisé
        chargerRepliques();
      });

      return () => {
        console.log("Destruction de WaveSurfer");
        if (wavesurfer.current) {
          wavesurfer.current.destroy();
        }
      };
    }
  }, [audioPath]);

  // Fonction de débogage pour l'état du silence
  const logSilenceStatus = (
    currentTime,
    estDansSilence,
    repliquesPersonnage
  ) => {
    setDebugInfo({
      currentTime,
      estDansSilence,
      repliquesPersonnage: repliquesPersonnage.map((r) => ({
        debut: r.debut,
        fin: r.fin,
        actif: currentTime >= r.debut && currentTime <= r.fin,
      })),
      lastCheck: Date.now(),
    });

    console.log(
      `[SILENCE] Temps: ${currentTime.toFixed(2)}s | Silence: ${
        estDansSilence ? "OUI" : "NON"
      } | Volume: ${wavesurfer.current?.getVolume()}`
    );

    if (repliquesPersonnage.length > 0) {
      console.log(
        `[SILENCE] Répliques de ${personnageSilence} (${repliquesPersonnage.length}):`,
        repliquesPersonnage
          .map((r) => `${r.debut.toFixed(2)}s-${r.fin.toFixed(2)}s`)
          .join(", ")
      );
    }
  };

  // Écouteur pour la mise en silence dynamique - avec beaucoup de logs
  useEffect(() => {
    if (wavesurfer.current && silenceActif && personnageSilence) {
      console.log(`[SILENCE] Mode silence activé pour: ${personnageSilence}`);
      console.log(
        `[SILENCE] Nombre de répliques trouvées: ${
          repliques.filter((r) => r.personnage === personnageSilence).length
        }`
      );

      // Fonction pour vérifier la position et ajuster le volume
      const handleAudioProgress = () => {
        const currentTime = wavesurfer.current?.getCurrentTime() || 0;

        // Filtrer les répliques du personnage sélectionné
        const repliquesPersonnage = repliques.filter(
          (r) => r.personnage === personnageSilence
        );

        // Vérifier si le temps actuel est dans une des répliques à mettre en silence
        const estDansSilence = repliquesPersonnage.some(
          (replique) =>
            currentTime >= replique.debut && currentTime <= replique.fin
        );

        // Pour éviter de modifier le volume trop fréquemment (peut causer des problèmes de performance)
        const now = Date.now();
        const shouldUpdateVolume = now - lastVolumeChange.current > 50; // Au maximum 20 fois par seconde

        // Mettre le volume à 0 si dans une réplique à silencer, sinon à 1
        if (wavesurfer.current && shouldUpdateVolume) {
          const newVolume = estDansSilence ? 0 : 1;

          // Ne mettre à jour que si le volume a changé
          if (wavesurfer.current.getVolume() !== newVolume) {
            console.log(
              `[SILENCE] Changement de volume: ${wavesurfer.current.getVolume()} -> ${newVolume} (Temps: ${currentTime.toFixed(
                2
              )}s)`
            );
            wavesurfer.current.setVolume(newVolume);
            setCurrentVolume(newVolume);
            lastVolumeChange.current = now;
          }

          // Enregistrer toutes les 500ms pour le débogage
          if (now - debugInfo.lastCheck > 500) {
            logSilenceStatus(currentTime, estDansSilence, repliquesPersonnage);
          }
        }
      };

      // Utiliser à la fois un intervalle et l'événement audioprocess pour plus de fiabilité
      const intervalId = setInterval(handleAudioProgress, 50);
      console.log("[SILENCE] Intervalle de vérification configuré (50ms)");

      // Ajouter l'écouteur d'événement pour la mise à jour de l'audio
      wavesurfer.current.on("audioprocess", handleAudioProgress);
      console.log("[SILENCE] Écouteur 'audioprocess' configuré");

      // Ajouter un écouteur pour les seek manuels
      wavesurfer.current.on("seek", handleAudioProgress);
      console.log("[SILENCE] Écouteur 'seek' configuré");

      // Nettoyage
      return () => {
        clearInterval(intervalId);
        console.log("[SILENCE] Intervalle de vérification nettoyé");

        wavesurfer.current?.un("audioprocess", handleAudioProgress);
        wavesurfer.current?.un("seek", handleAudioProgress);
        console.log("[SILENCE] Écouteurs d'événements nettoyés");

        // Remettre le volume à 1 lors du nettoyage
        if (wavesurfer.current) {
          wavesurfer.current.setVolume(1);
          console.log("[SILENCE] Volume remis à 1");
        }
      };
    }
  }, [silenceActif, personnageSilence, repliques]);

  // Charger les répliques depuis Firestore
  const chargerRepliques = async () => {
    if (!wavesurfer.current) {
      console.log("WaveSurfer n'est pas initialisé pour charger les répliques");
      return;
    }

    console.log("Chargement des répliques depuis Firestore...");
    try {
      const repliquesCollection = collection(db, "repliques_theatrales");
      const snapshots = await getDocs(repliquesCollection);

      if (snapshots.empty) {
        console.log("Aucune réplique trouvée dans la collection");
        return;
      }

      const repliquesData = snapshots.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Replique[];

      console.log(`${repliquesData.length} répliques chargées:`, repliquesData);
      setRepliques(repliquesData);

      // Créer des régions visuelles pour chaque réplique
      repliquesData.forEach((replique) => {
        if (wavesurfer.current && wavesurfer.current.regions) {
          wavesurfer.current.regions.add({
            id: replique.id || `region-${Date.now()}`,
            start: replique.debut,
            end: replique.fin,
            color: getColorForPersonnage(replique.personnage),
            data: { personnage: replique.personnage },
          });
          console.log(
            `Région créée pour ${replique.personnage}: ${replique.debut}s-${replique.fin}s`
          );
        }
      });
    } catch (error) {
      console.error("Erreur lors du chargement des répliques:", error);
    }
  };

  // Mettre en évidence les répliques d'un personnage
  const mettreEnEvidenceRepliques = (personnage: string) => {
    if (!wavesurfer.current || !wavesurfer.current.regions) return;

    console.log(`Mise en évidence des répliques de: ${personnage}`);

    // Réinitialiser toutes les régions à leur couleur d'origine
    repliques.forEach((replique) => {
      if (replique.id && wavesurfer.current?.regions?.list[replique.id]) {
        const region = wavesurfer.current.regions.list[replique.id];
        // Couleur normale mais semi-transparente si ce n'est pas le personnage en focus
        const couleur = getColorForPersonnage(replique.personnage);
        const opacite = replique.personnage === personnage ? 0.6 : 0.2;

        // Extraire les composantes RGB
        const match = couleur.match(
          /rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d\.]+\)/
        );
        if (match) {
          const [_, r, g, b] = match;
          region.update({ color: `rgba(${r}, ${g}, ${b}, ${opacite})` });
        }
      }
    });

    // Mettre à jour l'état
    setPersonnageFocus(personnage);

    // Afficher le total des répliques
    const repliquesPersonnage = repliques.filter(
      (r) => r.personnage === personnage
    );
    let totalDuree = 0;
    repliquesPersonnage.forEach((replique) => {
      totalDuree += replique.fin - replique.debut;
    });

    alert(
      `${personnage}: ${
        repliquesPersonnage.length
      } répliques (${totalDuree.toFixed(1)} secondes au total)`
    );
  };

  // Contrôles de lecture
  const togglePlay = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
      console.log(`Lecture ${isPlaying ? "arrêtée" : "démarrée"}`);
    }
  };

  // Marquer le début d'une réplique
  const marquerDebut = () => {
    if (wavesurfer.current) {
      const temps = wavesurfer.current.getCurrentTime();
      setDebutReplique(temps);
      console.log(`Début de réplique marqué à ${temps.toFixed(2)}s`);
      // Stop audio quand on marque le début
      wavesurfer.current.pause();
    }
  };

  // Marquer la fin d'une réplique
  const marquerFin = () => {
    if (wavesurfer.current) {
      const temps = wavesurfer.current.getCurrentTime();
      setFinReplique(temps);
      console.log(`Fin de réplique marquée à ${temps.toFixed(2)}s`);
      // Stop audio quand on marque la fin
      wavesurfer.current.pause();
    }
  };

  // Ajout d'une réplique dans Firestore
  const ajouterReplique = async () => {
    if (
      personnageSelectionne &&
      debutReplique !== null &&
      finReplique !== null
    ) {
      console.log(
        `Ajout d'une réplique pour ${personnageSelectionne} de ${debutReplique.toFixed(
          2
        )}s à ${finReplique.toFixed(2)}s`
      );

      // Créer l'objet réplique sans le champ transcription s'il est vide
      const nouvelleReplique: Replique = {
        personnage: personnageSelectionne,
        debut: debutReplique,
        fin: finReplique,
      };

      // Ajouter le champ transcription seulement s'il n'est pas vide
      if (transcription.trim() !== "") {
        nouvelleReplique.transcription = transcription;
        console.log("Transcription ajoutée:", transcription);
      }

      try {
        // Ajout dans Firestore
        const repliquesCollection = collection(db, "repliques_theatrales");
        const docRef = await addDoc(repliquesCollection, nouvelleReplique);
        console.log("Réplique ajoutée à Firestore, ID:", docRef.id);

        // Ajouter l'ID généré par Firestore
        const repliqueAvecId = { ...nouvelleReplique, id: docRef.id };

        // Mise à jour de l'état local
        setRepliques([...repliques, repliqueAvecId]);
        console.log(
          "État local mis à jour, nombre de répliques:",
          repliques.length + 1
        );

        // Ajout d'une région visuelle dans WaveSurfer
        if (wavesurfer.current && wavesurfer.current.regions) {
          wavesurfer.current.regions.add({
            id: docRef.id,
            start: debutReplique,
            end: finReplique,
            color: getColorForPersonnage(personnageSelectionne),
            data: { personnage: personnageSelectionne },
          });
          console.log("Région visuelle ajoutée dans WaveSurfer");
        }

        // Réinitialisation des champs
        // On garde le dernier "fin" comme nouveau "début" pour faciliter l'enregistrement en séquence
        const dernierFin = finReplique;
        setDebutReplique(dernierFin);
        setFinReplique(null);
        setTranscription("");
        console.log(
          `Champs réinitialisés, nouveau début: ${dernierFin.toFixed(2)}s`
        );
      } catch (error) {
        console.error("Erreur lors de l'ajout de la réplique:", error);
        alert(
          "Erreur lors de l'enregistrement de la réplique. Veuillez réessayer."
        );
      }
    } else {
      console.warn("Formulaire incomplet:", {
        personnage: personnageSelectionne || "NON DÉFINI",
        debut:
          debutReplique !== null
            ? debutReplique.toFixed(2) + "s"
            : "NON DÉFINI",
        fin: finReplique !== null ? finReplique.toFixed(2) + "s" : "NON DÉFINI",
      });

      alert(
        "Veuillez sélectionner un personnage et marquer le début et la fin de la réplique."
      );
    }
  };

  // Supprimer une réplique
  const supprimerReplique = async (id?: string) => {
    if (!id) {
      console.warn("Impossible de supprimer: ID non fourni");
      return;
    }

    console.log("Tentative de suppression de la réplique ID:", id);
    try {
      // Suppression dans Firestore
      await deleteDoc(doc(db, "repliques_theatrales", id));
      console.log("Réplique supprimée de Firestore");

      // Mise à jour de l'état local
      setRepliques(repliques.filter((r) => r.id !== id));
      console.log("État local mis à jour après suppression");

      // Suppression de la région visuelle
      if (
        wavesurfer.current &&
        wavesurfer.current.regions &&
        wavesurfer.current.regions.list[id]
      ) {
        wavesurfer.current.regions.list[id].remove();
        console.log("Région visuelle supprimée");
      }

      console.log("Réplique supprimée avec succès, ID:", id);
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert(
        "Erreur lors de la suppression de la réplique. Veuillez réessayer."
      );
    }
  };

  // Mettre en silence les répliques d'un personnage
  const mettreEnSilence = () => {
    if (
      !personnageSilence ||
      !wavesurfer.current ||
      !wavesurfer.current.regions
    ) {
      console.warn("Impossible d'activer le silence:", {
        personnage: personnageSilence || "NON DÉFINI",
        wavesurfer: wavesurfer.current ? "OK" : "NON INITIALISÉ",
      });
      return;
    }

    console.log(`Mise en silence des répliques de: ${personnageSilence}`);
    const repliquesPersonnage = repliques.filter(
      (r) => r.personnage === personnageSilence
    );

    if (repliquesPersonnage.length === 0) {
      console.warn(`Aucune réplique trouvée pour ${personnageSilence}`);
      alert("Aucune réplique trouvée pour ce personnage.");
      return;
    }

    console.log(
      `${repliquesPersonnage.length} répliques trouvées pour ${personnageSilence}`
    );
    console.log(
      "Plages à mettre en silence:",
      repliquesPersonnage
        .map((r) => `${r.debut.toFixed(2)}s-${r.fin.toFixed(2)}s`)
        .join(", ")
    );

    // Mise à jour visuelle des régions
    repliquesPersonnage.forEach((replique) => {
      if (replique.id && wavesurfer.current?.regions?.list[replique.id]) {
        const region = wavesurfer.current.regions.list[replique.id];
        region.update({ color: "rgba(0, 0, 0, 0.2)" });
        console.log(`Région ${replique.id} mise en évidence (assombrie)`);
      }
    });

    // Activer le mode silence en temps réel
    setSilenceActif(true);
    setModeEdition(true);
    console.log("Mode silence activé");

    alert(
      `Les répliques de ${personnageSilence} seront mises en silence pendant la lecture.`
    );
  };

  // Désactiver le mode silence
  const desactiverSilence = () => {
    console.log("Désactivation du mode silence");
    setSilenceActif(false);

    // Remettre les couleurs normales
    repliques.forEach((replique) => {
      if (replique.id && wavesurfer.current?.regions?.list[replique.id]) {
        const region = wavesurfer.current.regions.list[replique.id];
        region.update({ color: getColorForPersonnage(replique.personnage) });
        console.log(`Couleur normale restaurée pour la région ${replique.id}`);
      }
    });

    // Remettre le volume à 1
    if (wavesurfer.current) {
      wavesurfer.current.setVolume(1);
      setCurrentVolume(1);
      console.log("Volume remis à 1");
    }

    alert("Mode silence désactivé.");
  };

  // Tester le silence sur une réplique spécifique
  const testerSilenceSurReplique = () => {
    if (!wavesurfer.current || !personnageSilence) {
      console.warn("Impossible de tester le silence:", {
        wavesurfer: wavesurfer.current ? "OK" : "NON INITIALISÉ",
        personnage: personnageSilence || "NON DÉFINI",
      });
      return;
    }

    const repliquesPersonnage = repliques.filter(
      (r) => r.personnage === personnageSilence
    );

    if (repliquesPersonnage.length === 0) {
      console.warn(
        `Aucune réplique trouvée pour tester le silence de ${personnageSilence}`
      );
      alert("Aucune réplique trouvée pour ce personnage.");
      return;
    }

    // Trouver la première réplique
    const premiereReplique = repliquesPersonnage[0];
    console.log(
      `Test du silence sur la réplique: ${premiereReplique.debut.toFixed(
        2
      )}s-${premiereReplique.fin.toFixed(2)}s`
    );

    // Aller quelques secondes avant le début de la réplique
    const tempsDebut = Math.max(0, premiereReplique.debut - 2);
    wavesurfer.current.seekTo(tempsDebut / wavesurfer.current.getDuration());
    console.log(
      `Positionnement à ${tempsDebut.toFixed(2)}s (2s avant la réplique)`
    );

    // Activer le mode silence
    setSilenceActif(true);

    // Lancer la lecture
    wavesurfer.current.play();
    console.log("Lecture démarrée avec mode silence actif");

    // Arrêter après la fin de la réplique
    const dureeTotale = (premiereReplique.fin - tempsDebut + 2) * 1000; // +2s après la fin
    setTimeout(() => {
      if (wavesurfer.current && isPlaying) {
        wavesurfer.current.pause();
        console.log("Test terminé, lecture arrêtée");
      }
    }, dureeTotale);
  };

  // Exportation du fichier audio (simulation)
  const exporterAudio = () => {
    if (!modeEdition) {
      console.warn("Tentative d'exportation sans mode édition actif");
      alert("Veuillez d'abord marquer les répliques à mettre en silence");
      return;
    }

    console.log(
      `Préparation de l'exportation audio avec silence pour ${personnageSilence}...`
    );
    alert(
      `Préparation de l'exportation audio avec silence pour ${personnageSilence}...`
    );

    // Simulation d'une fonction d'exportation
    setTimeout(() => {
      console.log("Exportation terminée (simulation)");
      alert(
        "Exportation terminée (simulation). Dans une version complète, le fichier audio serait téléchargé."
      );
    }, 1500);
  };

  // Utilitaire pour attribuer des couleurs aux personnages
  const getColorForPersonnage = (personnage: string): string => {
    const colors = [
      "rgba(255, 99, 132, 0.3)", // Rouge
      "rgba(54, 162, 235, 0.3)", // Bleu
      "rgba(255, 206, 86, 0.3)", // Jaune
      "rgba(75, 192, 192, 0.3)", // Vert-eau
      "rgba(153, 102, 255, 0.3)", // Violet
      "rgba(255, 159, 64, 0.3)", // Orange
      "rgba(199, 199, 199, 0.3)", // Gris
      "rgba(83, 102, 255, 0.3)", // Bleu-violet
      "rgba(40, 159, 64, 0.3)", // Vert
      "rgba(210, 20, 60, 0.3)", // Rouge foncé
      "rgba(70, 70, 200, 0.3)", // Bleu foncé
    ];

    const index = personnages.indexOf(personnage);
    return index >= 0 && index < colors.length
      ? colors[index]
      : "rgba(128, 128, 128, 0.3)";
  };

  // Écouter une réplique spécifique
  const ecouterReplique = (debut: number, fin: number) => {
    if (wavesurfer.current) {
      console.log(
        `Écoute de réplique: ${debut.toFixed(2)}s-${fin.toFixed(2)}s`
      );
      wavesurfer.current.seekTo(debut / wavesurfer.current.getDuration());
      console.log(`Positionnement à ${debut.toFixed(2)}s`);

      // Créer un timeout pour arrêter la lecture à la fin de la réplique
      const dureeReplique = (fin - debut) * 1000; // en millisecondes
      console.log(`Durée de la réplique: ${dureeReplique}ms`);

      wavesurfer.current.play();
      console.log("Lecture démarrée");

      setTimeout(() => {
        if (wavesurfer.current && isPlaying) {
          wavesurfer.current.pause();
          console.log("Fin de la réplique, lecture arrêtée");
        }
      }, dureeReplique);
    }
  };

  // Composant Timeline pour afficher les répliques d'un personnage
  const Timeline = ({ personnage }) => {
    const repliquesPersonnage = repliques.filter(
      (r) => r.personnage === personnage
    );

    if (repliquesPersonnage.length === 0) {
      return (
        <p className="text-sm text-gray-500 italic">
          Aucune réplique pour ce personnage
        </p>
      );
    }

    // Trouver la durée totale de l'audio
    const totalDuration = wavesurfer.current?.getDuration() || 100;

    return (
      <div className="mt-4">
        <div className="relative w-full h-10 bg-gray-100 rounded-md overflow-hidden">
          {/* Barre de temps */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gray-200"></div>

          {/* Répliques */}
          {repliquesPersonnage.map((replique, index) => {
            const startPercent = (replique.debut / totalDuration) * 100;
            const widthPercent =
              ((replique.fin - replique.debut) / totalDuration) * 100;

            return (
              <div
                key={index}
                className="absolute h-8 rounded cursor-pointer hover:brightness-90 flex items-center justify-center text-xs font-bold"
                style={{
                  left: `${startPercent}%`,
                  width: `${widthPercent}%`,
                  backgroundColor: getColorForPersonnage(personnage),
                  top: "2px",
                }}
                onClick={() => ecouterReplique(replique.debut, replique.fin)}
                title={`${replique.debut.toFixed(1)}s - ${replique.fin.toFixed(
                  1
                )}s${
                  replique.transcription ? ": " + replique.transcription : ""
                }`}
              >
                {widthPercent > 5 &&
                  (replique.transcription || `#${index + 1}`)}
              </div>
            );
          })}

          {/* Indicateur de position actuelle */}
          {isPlaying && (
            <div
              className="absolute h-10 w-0.5 bg-red-500 z-10 pointer-events-none"
              style={{
                left: `${
                  (wavesurfer.current?.getCurrentTime() / totalDuration) * 100
                }%`,
              }}
            ></div>
          )}
        </div>

        <div className="mt-2 text-xs flex justify-between text-gray-500">
          <span>0:00</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 bg-gray-50 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">
        Marqueur de Répliques Théâtrales
      </h1>

      {/* Affichage du fichier audio chargé */}
      <div className="mb-6">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm font-medium text-blue-800">
            Fichier audio chargé: {audioPath.split("/").pop()}
          </p>
        </div>
      </div>

      {/* Visualisation de la forme d'onde */}
      <div
        ref={waveformRef}
        className="w-full h-40 bg-white border border-gray-200 rounded-md mb-4"
      ></div>

      {/* Barre de progression */}
      <div className="flex justify-between items-center text-sm text-gray-600 w-full max-w-md mx-auto mb-4">
        <span>{formatTime(currentTime)}</span>
        <div className="w-full mx-4 h-1 bg-gray-200 rounded-full">
          <div
            className="h-1 bg-blue-500 rounded-full"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          ></div>
        </div>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Contrôles audio améliorés */}
      <div className="flex justify-center mb-6 space-x-2 flex-wrap">
        {/* Boutons de navigation */}
        <div className="flex space-x-1 mr-4">
          <button
            onClick={() => {
              if (wavesurfer.current) {
                const currentTime = wavesurfer.current.getCurrentTime();
                wavesurfer.current.seekTo(
                  Math.max(0, currentTime - 10) /
                    wavesurfer.current.getDuration()
                );
                console.log("Reculé de 10 secondes");
              }
            }}
            className="px-3 py-2 bg-gray-600 text-white rounded-l-md hover:bg-gray-700 transition"
            title="Reculer de 10 secondes"
          >
            <span className="flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-1"
              >
                <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V8.688c0-1.44-1.555-2.342-2.805-1.628L12 11.03v-2.34c0-1.44-1.555-2.343-2.805-1.629l-7.108 4.062c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z" />
              </svg>
              10s
            </span>
          </button>
          <button
            onClick={() => {
              if (wavesurfer.current) {
                const currentTime = wavesurfer.current.getCurrentTime();
                wavesurfer.current.seekTo(
                  Math.max(0, currentTime - 5) /
                    wavesurfer.current.getDuration()
                );
                console.log("Reculé de 5 secondes");
              }
            }}
            className="px-3 py-2 bg-gray-600 text-white hover:bg-gray-700 transition"
            title="Reculer de 5 secondes"
          >
            <span className="flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-1"
              >
                <path d="M9.195 18.44c1.25.713 2.805-.19 2.805-1.629v-2.34l6.945 3.968c1.25.714 2.805-.188 2.805-1.628V8.688c0-1.44-1.555-2.342-2.805-1.628L12 11.03v-2.34c0-1.44-1.555-2.343-2.805-1.629l-7.108 4.062c-1.26.72-1.26 2.536 0 3.256l7.108 4.061z" />
              </svg>
              5s
            </span>
          </button>
          <button
            onClick={() => {
              if (wavesurfer.current) {
                const currentTime = wavesurfer.current.getCurrentTime();
                wavesurfer.current.seekTo(
                  Math.min(wavesurfer.current.getDuration(), currentTime + 5) /
                    wavesurfer.current.getDuration()
                );
                console.log("Avancé de 5 secondes");
              }
            }}
            className="px-3 py-2 bg-gray-600 text-white hover:bg-gray-700 transition"
            title="Avancer de 5 secondes"
          >
            <span className="flex items-center">
              5s
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 ml-1"
              >
                <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.688v2.34L5.055 7.06z" />
              </svg>
            </span>
          </button>
          <button
            onClick={() => {
              if (wavesurfer.current) {
                const currentTime = wavesurfer.current.getCurrentTime();
                wavesurfer.current.seekTo(
                  Math.min(wavesurfer.current.getDuration(), currentTime + 10) /
                    wavesurfer.current.getDuration()
                );
                console.log("Avancé de 10 secondes");
              }
            }}
            className="px-3 py-2 bg-gray-600 text-white rounded-r-md hover:bg-gray-700 transition"
            title="Avancer de 10 secondes"
          >
            <span className="flex items-center">
              10s
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 ml-1"
              >
                <path d="M5.055 7.06c-1.25-.714-2.805.189-2.805 1.628v8.123c0 1.44 1.555 2.342 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.342 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256L14.805 7.06C13.555 6.346 12 7.25 12 8.688v2.34L5.055 7.06z" />
              </svg>
            </span>
          </button>
        </div>

        {/* Bouton lecture/pause */}
        <button
          onClick={togglePlay}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition flex items-center"
        >
          {isPlaying ? (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path
                  fillRule="evenodd"
                  d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                  clipRule="evenodd"
                />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                  clipRule="evenodd"
                />
              </svg>
              Lecture
            </>
          )}
        </button>

        {/* Vitesse de lecture */}
        <div className="ml-4">
          <select
            value={playbackRate}
            onChange={(e) => {
              const rate = parseFloat(e.target.value);
              setPlaybackRate(rate);
              if (wavesurfer.current) {
                wavesurfer.current.setPlaybackRate(rate);
                console.log(`Vitesse de lecture: ${rate}x`);
              }
            }}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
      </div>

      {/* Timeline des répliques du personnage sélectionné */}
      {personnageFocus && (
        <div className="mb-6 p-4 border border-blue-200 rounded-md bg-blue-50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-blue-800">
              Répliques de {personnageFocus}
            </h3>
            <button
              onClick={() => setPersonnageFocus(null)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Fermer
            </button>
          </div>
          <Timeline personnage={personnageFocus} />
        </div>
      )}

      {/* Sélection du personnage */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sélectionner un personnage
        </label>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5">
          {personnages.map((perso) => (
            <div key={perso} className="flex flex-col">
              <button
                onClick={() => {
                  setPersonnageSelectionne(perso);
                  console.log(`Personnage sélectionné: ${perso}`);
                }}
                className={`px-3 py-2 border rounded-md transition ${
                  personnageSelectionne === perso
                    ? "bg-indigo-600 text-white border-indigo-700"
                    : "text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
                style={{
                  backgroundColor:
                    personnageSelectionne === perso
                      ? ""
                      : getColorForPersonnage(perso),
                }}
              >
                {perso}
              </button>
              <button
                onClick={() => mettreEnEvidenceRepliques(perso)}
                className="mt-1 text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 transition"
                title="Voir les répliques de ce personnage"
              >
                <span className="flex items-center justify-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3 h-3 mr-1"
                  >
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path
                      fillRule="evenodd"
                      d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Voir
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Marquage des répliques */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <button
            onClick={marquerDebut}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center justify-center"
            disabled={!personnageSelectionne}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                fillRule="evenodd"
                d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
                clipRule="evenodd"
              />
            </svg>
            Début Réplique
          </button>
          {debutReplique !== null && (
            <p className="mt-1 text-sm text-gray-600">
              Début: {debutReplique.toFixed(2)}s
            </p>
          )}
        </div>

        <div>
          <button
            onClick={marquerFin}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center justify-center"
            disabled={!personnageSelectionne || debutReplique === null}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                fillRule="evenodd"
                d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.177A7.547 7.547 0 016.648 6.61a.75.75 0 00-1.152.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z"
                clipRule="evenodd"
              />
            </svg>
            Fin Réplique
          </button>
          {finReplique !== null && (
            <p className="mt-1 text-sm text-gray-600">
              Fin: {finReplique.toFixed(2)}s
            </p>
          )}
        </div>
      </div>

      {/* Transcription optionnelle */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Transcription (optionnelle)
        </label>
        <textarea
          value={transcription}
          onChange={(e) => setTranscription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          rows={2}
          placeholder="Texte de la réplique..."
        ></textarea>
      </div>

      {/* Bouton d'ajout */}
      <div className="mb-8">
        <button
          onClick={ajouterReplique}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition font-medium flex items-center justify-center"
          disabled={
            !personnageSelectionne ||
            debutReplique === null ||
            finReplique === null
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5 mr-2"
          >
            <path
              fillRule="evenodd"
              d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z"
              clipRule="evenodd"
            />
          </svg>
          Ajouter cette réplique
        </button>
      </div>

      {/* Liste des répliques */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">
          Répliques enregistrées
        </h2>
        {repliques.length === 0 ? (
          <p className="text-gray-500 italic">Aucune réplique enregistrée</p>
        ) : (
          <div className="space-y-2">
            {repliques.map((replique) => (
              <div
                key={replique.id}
                className="p-3 border border-gray-200 rounded-md flex justify-between items-center"
                style={{
                  backgroundColor: getColorForPersonnage(replique.personnage),
                }}
              >
                <div>
                  <div className="font-medium">{replique.personnage}</div>
                  <div className="text-sm text-gray-700">
                    {replique.debut.toFixed(2)}s - {replique.fin.toFixed(2)}s
                  </div>
                  {replique.transcription && (
                    <div className="text-sm mt-1 italic">
                      {replique.transcription}
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() =>
                      ecouterReplique(replique.debut, replique.fin)
                    }
                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 mr-1"
                    >
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    Écouter
                  </button>
                  <button
                    onClick={() => supprimerReplique(replique.id)}
                    className="px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 mr-1"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mise en silence */}
      <div className="mb-6 p-4 border border-gray-200 rounded-md bg-gray-50">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">
          Modifier l'audio
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mettre en silence les répliques de:
          </label>
          <select
            value={personnageSilence}
            onChange={(e) => {
              setPersonnageSilence(e.target.value);
              console.log(
                `Personnage pour silence sélectionné: ${e.target.value}`
              );
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            disabled={silenceActif}
          >
            <option value="">Sélectionner un personnage</option>
            {personnages.map((perso) => (
              <option key={perso} value={perso}>
                {perso}
              </option>
            ))}
          </select>
        </div>

        {/* Informations de débogage */}
        {silenceActif && (
          <div className="mb-4 p-3 bg-gray-100 border border-gray-200 rounded-md text-xs font-mono">
            <details>
              <summary className="font-bold cursor-pointer">
                Informations de débogage (cliquer pour afficher)
              </summary>
              <div className="mt-2 overflow-x-auto">
                <p>
                  <strong>Temps actuel:</strong>{" "}
                  {debugInfo.currentTime.toFixed(2)}s
                </p>
                <p>
                  <strong>État silence:</strong>{" "}
                  {debugInfo.estDansSilence
                    ? "ACTIF (volume 0)"
                    : "INACTIF (volume 1)"}
                </p>
                <p>
                  <strong>Volume actuel:</strong> {currentVolume}
                </p>
                <p>
                  <strong>Dernière vérification:</strong>{" "}
                  {new Date(debugInfo.lastCheck).toLocaleTimeString()}
                </p>
                <p>
                  <strong>Répliques de {personnageSilence}:</strong>{" "}
                  {debugInfo.repliquesPersonnage.length}
                </p>
                {debugInfo.repliquesPersonnage.map((r, i) => (
                  <p
                    key={i}
                    className={r.actif ? "text-red-500 font-bold" : ""}
                  >
                    {r.debut.toFixed(2)}s-{r.fin.toFixed(2)}s{" "}
                    {r.actif ? "(ACTIF)" : ""}
                  </p>
                ))}
              </div>
            </details>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!silenceActif ? (
            <button
              onClick={mettreEnSilence}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition flex items-center"
              disabled={!personnageSilence}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
              </svg>
              Activer le silence
            </button>
          ) : (
            <button
              onClick={desactiverSilence}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition flex items-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5 mr-2"
              >
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
              </svg>
              Désactiver le silence
            </button>
          )}

          <button
            onClick={testerSilenceSurReplique}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition flex items-center"
            disabled={
              !personnageSilence ||
              repliques.filter((r) => r.personnage === personnageSilence)
                .length === 0
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
              <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
            </svg>
            Tester sur la première réplique
          </button>

          <button
            onClick={exporterAudio}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center"
            disabled={!modeEdition}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                fillRule="evenodd"
                d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z"
                clipRule="evenodd"
              />
            </svg>
            Exporter l'audio modifié
          </button>
        </div>

        {silenceActif && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Mode silence actif:</strong> Les répliques de{" "}
              {personnageSilence} sont mises en silence pendant la lecture.
              {currentVolume === 0 && (
                <span className="ml-2 bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold animate-pulse">
                  SILENCE EN COURS
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Aide et instructions */}
      <div className="mb-6 p-4 border border-gray-200 rounded-md bg-blue-50">
        <details>
          <summary className="font-medium text-blue-800 cursor-pointer">
            Comment ça marche?
          </summary>
          <div className="mt-3 text-sm text-blue-700 space-y-2">
            <p>
              <strong>1.</strong> Sélectionnez un personnage
            </p>
            <p>
              <strong>2.</strong> Pendant l'écoute de l'audio, marquez le début
              et la fin de chaque réplique
            </p>
            <p>
              <strong>3.</strong> Ajoutez éventuellement une transcription
            </p>
            <p>
              <strong>4.</strong> Enregistrez la réplique
            </p>
            <p>
              <strong>5.</strong> Pour créer une version sans les dialogues d'un
              personnage:
            </p>
            <ul className="list-disc pl-5 mt-1">
              <li>Sélectionnez le personnage à mettre en silence</li>
              <li>Activez le silence pendant la lecture</li>
              <li>Testez sur une réplique pour vérifier</li>
              <li>Exportez l'audio modifié</li>
            </ul>
            <p>
              <strong>Astuce:</strong> Utilisez le bouton "Voir" à côté de
              chaque personnage pour visualiser toutes ses répliques sur une
              timeline.
            </p>
          </div>
        </details>
      </div>

      {/* Pied de page */}
      <div className="text-center text-sm text-gray-500 mt-8">
        <p>Outil de marquage de répliques théâtrales - v1.1</p>
      </div>
    </div>
  );
};

export default AudioMarker;
