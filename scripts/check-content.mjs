import { loadContent } from '../build/content.mjs';
import { loadMusic } from '../build/audio.mjs';
try {
  const { events, photos, infos, musicians } = loadContent();
  const music = loadMusic();
  console.log(`Contenus valides : ${events.length} événements, ${photos.length} photos, ${infos.length} cartes, ${musicians.length} musiciens, ${music.tracks.length} morceaux locaux.`);
  const examples = events.filter(event => event.exemple);
  if (process.argv.includes('--publication') && examples.length) {
    throw new Error(`Publication bloquée : ${examples.length} exemple(s) fictif(s) dans contenu/agenda.md. Retirez ces blocs avant la mise en ligne : ${examples.map(event => event.titre).join(', ')}.`);
  }
  // Publication de ces six portraits fictifs expressément demandée le 30/09/2026.
  // Leur marqueur Exemple : oui et la mention visible restent obligatoires.
  const approvedFiction = new Set(['Camille Morel', 'Julien Perrin', 'Léa Garnier',
    'Émile Roussel', 'Manon Delcourt', 'Hugo Bellier']);
  if (process.argv.includes('--publication')) {
    if (musicians.some(member => member.exemple && !approvedFiction.has(member.nom))) {
      throw new Error('Publication bloquée : fiches d’exemple non approuvées dans contenu/musiciens.md. Remplacez-les par les présentations validées ou retirez-les avant la mise en ligne.');
    }
    if (musicians.some(member => approvedFiction.has(member.nom) && !member.exemple)) {
      throw new Error('Publication bloquée : les portraits fictifs convenus doivent garder Exemple : oui dans contenu/musiciens.md.');
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
