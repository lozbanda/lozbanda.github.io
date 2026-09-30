import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build, FILES } from '../scripts/build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');
const html = read('site/index.html');
const css = read('site/styles.css');
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const list = (directory, prefix = '') => readdirSync(directory).flatMap(name => {
  const path = join(directory, name), relative = prefix + name;
  assert.equal(lstatSync(path).isSymbolicLink(), false, relative);
  return lstatSync(path).isDirectory() ? list(path, relative + '/') : [relative];
}).sort();
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lozbanda-attente-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of FILES) {
    mkdirSync(dirname(join(directory, 'src', file)), { recursive: true });
    copyFileSync(join(root, 'src', file), join(directory, 'src', file));
  }
  return directory;
}

test('page française : identité, annonce sans date inventée et contact correct', () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<title>Loz’Banda — Le site arrive bientôt<\/title>/);
  assert.match(html, /<h1 id="titre">Le site arrive bientôt\.<\/h1>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /href="mailto:lozbanda48@hotmail\.com"/);
  assert.doesNotMatch(html, /Coming Soon|countdown|\d{4}-\d{2}-\d{2}/i);
});

test('ressources locales relatives et aucun script, audio, formulaire ou traqueur', () => {
  assert.doesNotMatch(html, /<(?:script|iframe|audio|video|form)\b/i);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (url.startsWith('#') || url.startsWith('mailto:')) continue;
    assert.doesNotMatch(url, /^(?:\/|[a-z]+:)|\.\./i);
    assert.ok(existsSync(join(root, 'site', url)), url);
  }
  assert.doesNotMatch(css, /@import|url\(|animation\s*:|transition\s*:/i);
  assert.equal(read('package.json').includes('dependencies'), false);
});

test('logo authentique inchangé, ratio explicite et favicon local', () => {
  assert.match(html, /width="1200" height="960" alt="Logo de Loz’Banda"/);
  assert.ok(html.indexOf('class="logo"') < html.indexOf('<h1'));
  assert.equal(digest(join(root, 'site/assets/logo-accueil.webp')), 'e2abb661718bbb0a2e860012a61d872b1bea5abcbdd9f6dcd4fd09092e2e124f');
  assert.equal(digest(join(root, 'site/assets/favicon.png')), 'ba529b59a66f6dcfd6dc002b8d75228a801e1cf2c0a8f42d17ad419ab27c7d18');
});

test('clavier, mise en page fluide et palette du site', () => {
  assert.match(html, /class="skip-link" href="#contenu"/);
  assert.match(html, /id="contenu" tabindex="-1"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /clamp\(28px, 5vmin, 64px\)/);
  assert.match(css, /width: min\(480px, 100%\); height: auto/);
  for (const color of ['#fcf7ef', '#222429', '#ecbe29', '#126579']) assert.ok(css.includes(color));
});

test('sortie exactement limitée aux cinq fichiers publics prévus', () => {
  assert.deepEqual(list(join(root, 'site')), [...FILES, '.nojekyll'].sort());
  for (const file of FILES) assert.equal(digest(join(root, 'site', file)), digest(join(root, 'src', file)));
  assert.equal(read('site/.nojekyll'), '');
});

test('un fichier supplémentaire ne passe pas dans le build et les anciens fichiers disparaissent', t => {
  const directory = fixture(t);
  writeFileSync(join(directory, 'src', 'brouillon-prive.txt'), 'Ne pas publier');
  build(directory);
  writeFileSync(join(directory, 'site', 'ancien.html'), 'ancienne page');
  build(directory);
  assert.deepEqual(list(join(directory, 'site')), [...FILES, '.nojekyll'].sort());
});

test('source absente : l’ancienne sortie reste intacte', t => {
  const directory = fixture(t);
  build(directory);
  const before = digest(join(directory, 'site/index.html'));
  rmSync(join(directory, 'src/assets/logo-accueil.webp'));
  assert.throws(() => build(directory), /ENOENT/);
  assert.equal(digest(join(directory, 'site/index.html')), before);
  assert.equal(readdirSync(directory).some(name => name.startsWith('.build-')), false);
});

test('liens symboliques refusés en entrée et sortie', t => {
  for (const component of ['src/styles.css', 'src/assets', 'site']) {
    const directory = fixture(t);
    const elsewhere = join(directory, 'ailleurs');
    mkdirSync(elsewhere);
    rmSync(join(directory, component), { recursive: true, force: true });
    symlinkSync(elsewhere, join(directory, component));
    assert.throws(() => build(directory), /symbolique|dossier réel/);
    assert.deepEqual(readdirSync(elsewhere), []);
  }
});

test('CI automatique en lecture seule et publication manuelle séparée', () => {
  const ci = read('.github/workflows/ci.yml'), pages = read('.github/workflows/pages.yml');
  assert.match(ci, /  push:\n  pull_request:\n  workflow_dispatch:/);
  assert.doesNotMatch(ci, /pages: write|id-token: write|deploy-pages|secrets\./);
  assert.match(pages, /on:\n  workflow_dispatch:/);
  assert.doesNotMatch(pages, /  push:|  pull_request:|secrets\./);
  assert.match(pages, /github\.ref == 'refs\/heads\/main'/);
  assert.match(pages, /needs: build/);
  assert.match(pages, /pages: write/);
  assert.match(pages, /id-token: write/);
  assert.match(pages, /path: site\n/);
  assert.ok(pages.indexOf('run: npm test') < pages.indexOf('actions/upload-pages-artifact'));
  for (const [, action] of (ci + pages).matchAll(/uses: ([^\n#]+)/g)) assert.match(action.trim(), /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  for (const workflow of [ci, pages]) {
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.match(workflow, /timeout-minutes: 10/);
  }
});

test('Git ignore les fichiers privés, brouillons et sorties même avec git add .', t => {
  const directory = fixture(t);
  copyFileSync(join(root, '.gitignore'), join(directory, '.gitignore'));
  execFileSync('git', ['init', '--quiet', '-b', 'main', directory]);
  const allowed = ['src/index.html', 'src/styles.css', '.github/workflows/pages.yml', 'tests/site.test.mjs'];
  const ignored = ['.env', 'password.txt', 'sources/original.jpg', 'src/assets/photo.jpg', 'src/assets/audio.mp3', 'site/index.html', 'backups/archive.zip', 'notes.md'];
  const actual = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: directory, input: [...allowed, ...ignored].join('\n') + '\n', encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(actual, ignored);
});
