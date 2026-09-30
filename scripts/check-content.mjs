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
  if (process.argv.includes('--publication') && musicians.some(member => member.exemple)) {
    throw new Error('Publication bloquée : fiches d’exemple dans contenu/musiciens.md. Remplacez-les par les présentations validées ou retirez-les avant la mise en ligne.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
