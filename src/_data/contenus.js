import { loadContent } from '../../build/content.mjs';

// Appel à chaque génération, y compris --watch : pas de contenu figé à l’import.
export default function () {
  return loadContent();
}
