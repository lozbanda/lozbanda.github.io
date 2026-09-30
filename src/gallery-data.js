import { normalizeSource } from './content-data.js';

// sorties.json est généré par Eleventy depuis contenu/galerie.md, pas édité à la main.
const localImage = /^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png|avif)$/i;

export function normalizeGallery(data) {
  if (!Array.isArray(data)) {
    throw new Error('sorties.json doit contenir une liste de photos.');
  }
  return data.map((item, index) => {
    if (!item || typeof item.titre !== 'string' || !item.titre.trim()
        || typeof item.description !== 'string' || typeof item.image !== 'string'
        || !localImage.test(item.image)) {
      throw new Error(`Photo ${index + 1} : titre, description ou image invalide.`);
    }
    const miniature = item.miniature ?? item.image;
    if (typeof miniature !== 'string' || !localImage.test(miniature)) {
      throw new Error(`Photo ${index + 1} : miniature invalide.`);
    }
    const srcset = item.srcset ?? '';
    if (typeof srcset !== 'string' || (srcset && !srcset.split(',').every(candidate => {
      const parts = candidate.trim().split(/\s+/);
      return parts.length === 2 && localImage.test(parts[0]) && /^[1-9]\d*w$/.test(parts[1]);
    }))) {
      throw new Error(`Photo ${index + 1} : srcset invalide.`);
    }
    return {
      titre: item.titre.trim(),
      description: item.description.trim(),
      image: item.image,
      miniature,
      srcset,
      source: normalizeSource(item.source),
      alt: typeof item.alt === 'string' && item.alt.trim() ? item.alt.trim() : item.titre.trim(),
    };
  });
}

export function nextIndex(index, direction, length) {
  return length > 0 ? ((index + direction) % length + length) % length : 0;
}
