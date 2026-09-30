// Production : génération isolée, puis remplacement de site/ uniquement si
// tout a réussi. Un Markdown invalide conserve le dernier aperçu fonctionnel.
import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'site');
const temporary = await mkdtemp(join(root, '.build-'));
const next = join(temporary, 'next');
const previous = join(temporary, 'previous');
let cleanTemporary = true;
try {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/@11ty/eleventy/cmd.cjs'),
    `--output=${next}`], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Génération refusée : site/ est conservé. Corrigez le contenu signalé ci-dessus.');
  for (const file of ['index.html', 'agenda.html', 'galerie.html', 'musiciens.html', 'infos-pratiques.html', 'evenements.json', 'sorties.json', '.nojekyll']) {
    if (!(await stat(join(next, file))).isFile()) throw new Error(`Sortie manquante : ${file}`);
  }
  let hadPrevious = false;
  try { await rename(output, previous); hadPrevious = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await rename(next, output); } catch (error) {
    if (hadPrevious) {
      try { await rename(previous, output); } catch (restoreError) {
        cleanTemporary = false;
        throw new Error(`Restauration impossible : ancien site conservé dans ${previous}. ${restoreError.message}`);
      }
    }
    throw error;
  }
  console.log('Site généré dans site/ ; aucun déploiement effectué.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (cleanTemporary) await rm(temporary, { recursive: true, force: true });
}
