import { loadMusic } from '../../build/audio.mjs';

// Relire à chaque génération, y compris avec --watch.
export default function () {
  return loadMusic();
}
