// Autonome : la maintenance fonctionne même si Eleventy ou un Markdown est cassé.
// La page d’attente d’origine est réutilisée, sans script ni média du site complet.
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PAGES = ['index.html', 'agenda.html', 'galerie.html', 'musiciens.html', 'infos-pratiques.html'];
export const SOURCES = {
  'maintenance/index.html': 'index.html',
  'maintenance/maintenance.css': 'maintenance.css',
  'src/assets/logo-accueil.webp': 'assets/logo-accueil.webp',
  'src/assets/favicon.png': 'assets/favicon.png',
};
export const FILES = [...PAGES, '404.html', 'maintenance.css', 'assets/logo-accueil.webp', 'assets/favicon.png', '.nojekyll'];
const ROOT = fileURLToPath(new URL('../', import.meta.url));

function source(root, file) {
  let path = root;
  const parts = file.split('/');
  for (const [i, part] of parts.entries()) {
    path = join(path, part);
    const info = lstatSync(path);
    if (info.isSymbolicLink() || (i === parts.length - 1 ? !info.isFile() : !info.isDirectory())) {
      throw new Error(`Source réelle attendue, sans lien symbolique : ${file}`);
    }
  }
  return path;
}

export function buildMaintenance(directory = ROOT) {
  const root = realpathSync(directory);
  const output = join(root, 'site');
  try {
    const info = lstatSync(output);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('site/ doit être un dossier réel.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = mkdtempSync(join(root, '.build-'));
  const next = join(temporary, 'next'), previous = join(temporary, 'previous');
  let keepRecovery = false;
  try {
    mkdirSync(next);
    for (const [file, destination] of Object.entries(SOURCES)) {
      const input = source(root, file), target = join(next, destination);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(input, target);
    }
    const html = readFileSync(join(next, 'index.html'), 'utf8');
    for (const page of PAGES.slice(1)) writeFileSync(join(next, page), html);
    // Pages conserve le statut 404. Chemins racine pour les URL inconnues imbriquées
    // sur notre site utilisateur https://lozbanda.github.io/ (pas de faux HTTP 503).
    const notFound = html.replace('href="maintenance.css"', 'href="/maintenance.css"')
      .replaceAll('href="assets/', 'href="/assets/').replaceAll('src="assets/', 'src="/assets/');
    writeFileSync(join(next, '404.html'), notFound);
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
  try { buildMaintenance(); console.log('Maintenance générée dans site/ ; aucune publication effectuée.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
