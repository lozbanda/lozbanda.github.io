import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildMaintenance, SOURCES, FILES, PAGES } from '../scripts/build-maintenance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');
const html = read('maintenance/index.html');
const css = read('maintenance/maintenance.css');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const list = (directory, prefix = '') => readdirSync(directory).flatMap(name => {
  const path = join(directory, name), relative = prefix + name;
  assert.equal(lstatSync(path).isSymbolicLink(), false, relative);
  return lstatSync(path).isDirectory() ? list(path, relative + '/') : [relative];
}).sort();
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lozbanda-maintenance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of Object.keys(SOURCES)) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    copyFileSync(join(root, file), join(directory, file));
  }
  return directory;
}

test('maintenance française : page d’attente réutilisée, message et contact accessibles', () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<title>Loz’Banda — Maintenance en cours<\/title>/);
  assert.match(html, /<h1 id="titre">Maintenance en cours\.<\/h1>/);
  assert.match(html, /Le site revient bientôt\. Un peu de patience !/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /href="mailto:lozbanda48@hotmail\.com"/);
  assert.match(html, /class="skip-link" href="#contenu"/);
  assert.match(html, /id="contenu" tabindex="-1"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /Coming Soon|countdown|http-equiv|\d{4}-\d{2}-\d{2}/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /clamp\(28px, 5vmin, 64px\)/);
  assert.match(css, /width: min\(480px, 100%\); height: auto/);
  for (const color of ['#fcf7ef', '#222429', '#ecbe29', '#126579']) assert.ok(css.includes(color));
});

test('maintenance sans scripts, dépendances visiteur, téléchargement audio ni redirection', t => {
  const directory = fixture(t);
  buildMaintenance(directory);
  assert.doesNotMatch(html, /<(?:script|iframe|audio|video|form)\b/i);
  assert.doesNotMatch(css, /@import|url\(|animation\s*:|transition\s*:/i);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('#') || url.startsWith('mailto:')) continue;
    assert.doesNotMatch(url, /^(?:\/|[a-z]+:)|\.\./i);
    assert.ok(existsSync(join(directory, 'site', url)), url);
  }
});

test('logo authentique et favicon inchangés', t => {
  const directory = fixture(t);
  buildMaintenance(directory);
  assert.match(html, /width="1200" height="960" alt="Logo de Loz’Banda"/);
  assert.ok(html.indexOf('class="logo"') < html.indexOf('<h1'));
  assert.equal(digest(join(directory, 'site/assets/logo-accueil.webp')), 'e2abb661718bbb0a2e860012a61d872b1bea5abcbdd9f6dcd4fd09092e2e124f');
  assert.equal(digest(join(directory, 'site/assets/favicon.png')), 'ba529b59a66f6dcfd6dc002b8d75228a801e1cf2c0a8f42d17ad419ab27c7d18');
});

test('mode fermé : les cinq pages remplacées et aucun fichier du site précédent conservé', t => {
  const directory = fixture(t);
  mkdirSync(join(directory, 'site/assets/audio'), { recursive: true });
  writeFileSync(join(directory, 'site/assets/audio/ancien.mp3'), 'son');
  writeFileSync(join(directory, 'site/evenements.json'), '["Ancienne donnée"]');
  writeFileSync(join(directory, 'site/ancienne-page.html'), 'Contenu ancien');
  writeFileSync(join(directory, 'maintenance/brouillon.txt'), 'Ne pas publier');
  buildMaintenance(directory);
  assert.deepEqual(list(join(directory, 'site')), [...FILES].sort());
  for (const page of PAGES) assert.equal(readFileSync(join(directory, 'site', page), 'utf8'), html);
  for (const [file, destination] of Object.entries(SOURCES)) {
    assert.equal(digest(join(directory, 'site', destination)), digest(join(directory, file)));
  }
  buildMaintenance(directory);
  assert.deepEqual(list(join(directory, 'site')), [...FILES].sort());
});

test('404 de maintenance : ressources à la racine même pour une ancienne URL imbriquée', t => {
  const directory = fixture(t);
  buildMaintenance(directory);
  const fallback = readFileSync(join(directory, 'site/404.html'), 'utf8');
  for (const [, url] of fallback.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('#') || url.startsWith('mailto:')) continue;
    assert.ok(url.startsWith('/'));
    const resolved = new URL(url, 'https://lozbanda.github.io/ancienne/page/');
    assert.ok(existsSync(join(directory, 'site', resolved.pathname)));
  }
});

test('secours indépendant : fonctionne sans npm, Eleventy et avec un Markdown cassé', t => {
  const directory = fixture(t);
  mkdirSync(join(directory, 'contenu'));
  writeFileSync(join(directory, 'contenu/agenda.md'), 'invalide');
  writeFileSync(join(directory, 'eleventy.config.js'), 'invalide');
  assert.equal(existsSync(join(directory, 'node_modules')), false);
  buildMaintenance(directory);
  assert.deepEqual(list(join(directory, 'site')), [...FILES].sort());
});

test('erreur de maintenance : ancienne sortie préservée intégralement', t => {
  const directory = fixture(t);
  buildMaintenance(directory);
  const before = Object.fromEntries(list(join(directory, 'site')).map(file => [file, digest(join(directory, 'site', file))]));
  rmSync(join(directory, 'src/assets/logo-accueil.webp'));
  assert.throws(() => buildMaintenance(directory), /ENOENT/);
  assert.deepEqual(Object.fromEntries(list(join(directory, 'site')).map(file => [file, digest(join(directory, 'site', file))])), before);
  assert.equal(readdirSync(directory).some(name => name.startsWith('.build-')), false);
});

test('maintenance : sources, répertoires et sortie symboliques refusés', t => {
  for (const component of ['maintenance/index.html', 'maintenance', 'src/assets', 'src/assets/favicon.png', 'site']) {
    const directory = fixture(t);
    const elsewhere = join(directory, 'ailleurs');
    mkdirSync(elsewhere);
    rmSync(join(directory, component), { recursive: true, force: true });
    symlinkSync(elsewhere, join(directory, component));
    assert.throws(() => buildMaintenance(directory), /symbolique|dossier réel/);
    assert.deepEqual(readdirSync(elsewhere), []);
  }
  const directory = fixture(t);
  symlinkSync(join(directory, 'absent'), join(directory, 'site'));
  assert.throws(() => buildMaintenance(directory), /dossier réel/);
});

test('workflow : choix explicite, branche main et secours sans installation npm', () => {
  const pages = read('.github/workflows/pages.yml'), ci = read('.github/workflows/ci.yml');
  assert.match(pages, /type: choice/);
  assert.match(pages, /default: site/);
  assert.match(pages, /options:\n\s+- site\n\s+- maintenance/);
  assert.match(pages, /github\.ref == 'refs\/heads\/main'/);
  assert.match(pages, /cancel-in-progress: false/);
  assert.doesNotMatch(pages, /^\s+(push|pull_request|schedule):/m);
  assert.match(pages, /MODE: \$\{\{ inputs.mode \}\}/);
  assert.match(pages, /exit 1/);
  for (const step of pages.split(/\n      - name:/).slice(1)) {
    if (/run: npm (ci|test|run check:publication)/.test(step)) assert.match(step, /if: inputs.mode == 'site'/);
    if (/run: node (scripts\/build-maintenance|--test tests\/maintenance)/.test(step)) assert.match(step, /if: inputs.mode == 'maintenance'/);
  }
  assert.match(pages, /run: node --test tests\/maintenance.test.mjs/);
  assert.match(pages, /run: node scripts\/build-maintenance.mjs/);
  assert.match(ci, /name: site-verifie/);
  assert.match(ci, /retention-days: 1/);
  assert.doesNotMatch(ci, /deploy-pages|pages: write|id-token: write|secrets\./);
});

test('Git : seuls les sources et médias validés sont autorisés, jamais les archives privées', t => {
  const directory = fixture(t);
  copyFileSync(join(root, '.gitignore'), join(directory, '.gitignore'));
  execFileSync('git', ['init', '--quiet', '-b', 'main', directory]);
  const allowed = ['contenu/agenda.md', 'src/index.njk', 'src/styles.css', 'src/_includes/base.njk',
    'build/content.mjs', 'build/dev-server/index.cjs', 'maintenance/index.html', 'docs/EDITION.md',
    'src/assets/logo.webp', 'src/assets/audio/02-lozbanda-la-lozere-bat-des-ailes.mp3',
    'src/assets/banda-1280.webp', 'src/assets/facebook/rentree-chastel-2026-full.webp',
    'src/assets/facebook/collection-20260929/plein-air-01-full.webp',
    'src/assets/partenaires/final-mende-2021-full.webp', 'src/logo-egg.js',
    '.github/workflows/pages.yml', 'tests/maintenance.test.mjs'];
  const ignored = ['.env', 'password.txt', 'sources/original.jpg', 'src/assets/facebook/inconnue.jpg',
    'src/assets/photo.jpg', 'src/assets/audio/non-autorise.mp3', 'site/index.html',
    '.build-test/next/index.html', 'node_modules/index.js', 'backups/archive.zip', 'notes.md', 'docs/preuve-privee.md'];
  const actual = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: directory,
    input: [...allowed, ...ignored].join('\n') + '\n', encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(actual, ignored);
});
