import fs from 'fs';
import { jsonrepair } from 'jsonrepair';

// 1. Lire le fichier source
let content = fs.readFileSync('public/fleurs.json', 'utf8');

// 2. Réparer le JSON (corrige les caractères de contrôle, échappements invalides, etc.)
let repaired;
try {
  repaired = jsonrepair(content);
} catch (e) {
  console.error('Impossible de réparer le JSON:', e);
  process.exit(1);
}

// 3. Supprimer les fragments "image" cassés (lignes qui commencent par "image" sans deux-points)
repaired = repaired.replace(/"image[^\n]*\n/g, '');

// 4. Parser le JSON réparé
let events;
try {
  events = JSON.parse(repaired);
} catch (e) {
  console.error('Erreur de parsing JSON après réparation:', e);
  process.exit(1);
}

// 5. Fonction pour extraire une image du champ description
function extractImageFromDescription(description) {
  if (!description) return undefined;
  const match = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && match[1]) {
    let src = match[1].replace(/\\\//g, '/');
    if (src.startsWith('/')) {
      src = 'https://labouture.fr' + src;
    }
    return src;
  }
  return undefined;
}

// 6. Traitement des événements
const validEvents = events.map(event => {
  // Utiliser le champ image si présent, sinon extraire du champ description
  let imageUrl = event.image;
  if (!imageUrl) {
    imageUrl = extractImageFromDescription(event.description);
  }
  if (imageUrl && imageUrl.startsWith('/')) {
    imageUrl = 'https://labouture.fr' + imageUrl;
  }

  return {
    id: event.id?.trim(),
    title: event.title?.trim(),
    start: event.start?.replace(' ', 'T'),
    end: event.end?.replace(' ', 'T'),
    url: event.url?.replace(/\\\//g, '/').trim(),
    image: imageUrl,
    color: event.color?.trim(),
    textColor: event.textColor?.trim(),
    className: event.className?.trim(),
    allDay: event.allDay === 'false' ? false : !!event.allDay,
    description: event.description?.replace(/<\/?div>/g, '').trim(),
    location: event.location?.trim() || 'N/A'
  };
});

// 7. Écrire le résultat final
fs.writeFileSync('fleurs_fixed.json', JSON.stringify(validEvents, null, 2), 'utf8');
console.log(`Fichier corrigé et sauvegardé sous fleurs_fixed.json (${validEvents.length} événements traités)`);