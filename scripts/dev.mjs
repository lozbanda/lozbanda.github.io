import Eleventy from '@11ty/eleventy';
import { parseArgs } from 'node:util';
import { relative, resolve, sep } from 'node:path';

// Même moteur et même serveur local que la CLI. Eleventy 3.1.6 ne relance pas
// une génération sur « unlink » ; relayer ces suppressions pour la playlist.
const { values } = parseArgs({ options: { port: { type: 'string', default: '8013' } } });
const port = Number(values.port);
if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Port local attendu : entier entre 1 et 65535.');
}
const eleventy = new Eleventy(undefined, undefined, { runMode: 'serve' });
const audioRoot = resolve('src/assets/audio');
try {
  await eleventy.init();
  const rebuild = await eleventy.watch();
  eleventy.watcher.on('unlink', path => {
    const local = relative(audioRoot, resolve(path));
    if (local && !local.startsWith('..' + sep) && !local.includes(sep)) void rebuild(path);
  });
  await eleventy.serve(port); // L’adaptateur reste lié à 127.0.0.1.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await eleventy.stopWatch();
      process.exitCode = 0;
    });
  }
} catch (error) {
  await eleventy.stopWatch();
  console.error(error);
  process.exitCode = 1;
}
