// Page d’attente seulement : liste fermée, aucune copie du site complet.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FILES = ['index.html', 'styles.css', 'assets/logo-accueil.webp', 'assets/favicon.png'];
const ROOT = fileURLToPath(new URL('../', import.meta.url));

function source(root, file) {
  let path = root;
  const parts = ['src', ...file.split('/')];
  for (const [i, part] of parts.entries()) {
    path = join(path, part);
    const info = lstatSync(path);
    if (info.isSymbolicLink() || (i === parts.length - 1 ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Source réelle attendue, sans lien symbolique : src/${file}`);
    }
  }
  return path;
}

export function build(directory = ROOT) {
  const root = realpathSync(directory);
  const output = join(root, 'site');
  // lstat détecte aussi un lien symbolique cassé.
  try {
    const info = lstatSync(output);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('site/ doit être un dossier réel.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = mkdtempSync(join(root, '.build-'));
  const next = join(temporary, 'next'), previous = join(temporary, 'previous');
  let keepRecovery = false;
  try {
    mkdirSync(next);
    for (const file of FILES) {
      const input = source(root, file);
      const target = join(next, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(input, target);
    }
    writeFileSync(join(next, '.nojekyll'), '');
    if (existsSync(output)) renameSync(output, previous);
    try { renameSync(next, output); }
    catch (error) {
      if (existsSync(previous)) {
        try { renameSync(previous, output); }
        catch (restoreError) {
          keepRecovery = true;
          throw new Error(`Ancienne sortie conservée dans ${previous} : ${restoreError.message}`, { cause: error });
        }
      }
      throw error;
    }
  } finally {
    if (!keepRecovery) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { build(); console.log('Page d’attente générée dans site/ ; aucune publication effectuée.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
