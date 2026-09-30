import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setImmediate as tick } from 'node:timers/promises';
import nunjucks from 'nunjucks';
import { loadMusic, parseMusic } from '../build/audio.mjs';
import { initMusicPlayer } from '../src/music-player.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');
// Signatures minimales pour tester le validateur, pas le décodage navigateur.
const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Array(28).fill(0)]);
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(28)]);
const demo = '- Crédit : Un auteur\n- Source : [Original](https://example.org/morceau)\n- Licence : [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)\n- Démonstration : oui';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lozbanda-audio-'));
  const audio = join(root, 'src/assets/audio');
  mkdirSync(audio, { recursive: true });
  mkdirSync(join(root, 'contenu'));
  writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root, audio,
    file(name, data = name.toLowerCase().endsWith('.mp3') ? mp3 : wav) { writeFileSync(join(audio, name), data); },
    md(body = '') { writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n\n' + body); },
  };
}
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(join(project, 'src/_includes')), { autoescape: true });
const render = musique => env.render('music-player.njk', { musique });

test('playlist vide acceptée, même sans dossier audio ; Markdown manquant refusé', t => {
  const f = fixture(t);
  assert.deepEqual(loadMusic(f.root), { tracks: [], hasDemos: false });
  assert.equal(render(loadMusic(f.root)).trim(), '');
  rmSync(f.audio, { recursive: true });
  assert.equal(loadMusic(f.root).tracks.length, 0);
  rmSync(join(f.root, 'contenu/musique.md'));
  assert.throws(() => loadMusic(f.root), /musique\.md/);
});

test('MP3, WAV et WAVE déclarés dans l’ordre Markdown, URL relatives encodées', t => {
  const f = fixture(t);
  for (const name of ['10-Fin.WAVE', '2-un_air.MP3', '01-début & été #1.wav']) f.file(name);
  f.file('non-declare.mp3', 'Pas du son, hors playlist');
  f.md('## Dernier nommé, premier joué\n\n- Fichier : assets/audio/10-Fin.WAVE\n\n## Un air\n\n- Fichier : assets/audio/2-un_air.MP3\n\n## Début & été\n\n- Fichier : assets/audio/01-début & été #1.wav');
  const { tracks } = loadMusic(f.root);
  assert.deepEqual(tracks.map(track => track.title), ['Dernier nommé, premier joué', 'Un air', 'Début & été']);
  assert.deepEqual(tracks.map(track => track.type), ['audio/wav', 'audio/mpeg', 'audio/wav']);
  assert.equal(tracks[2].src, 'assets/audio/01-d%C3%A9but%20%26%20%C3%A9t%C3%A9%20%231.wav');
  assert.equal(tracks[0].author, '', 'aucune attribution implicite à Loz’Banda');
});

test('crédits Markdown relus sans cache, ordre explicite, empreinte protectrice', t => {
  const f = fixture(t);
  f.file('a.mp3'); f.file('b.wav');
  f.md(`## Premier titre\n\n- Fichier : assets/audio/a.mp3\n${demo}\n- Empreinte : ${digest(mp3)}\n\nExtrait de 36 secondes.`);
  assert.equal(loadMusic(f.root).tracks[0].title, 'Premier titre');
  assert.equal(loadMusic(f.root).hasDemos, true);
  f.md('## Autre titre\n\n- Fichier : assets/audio/b.wav\n\n## Second\n\n- Fichier : assets/audio/a.mp3');
  assert.deepEqual(loadMusic(f.root).tracks.map(track => track.file), ['b.wav', 'a.mp3']);
  f.md(`## Mauvaise empreinte\n\n- Fichier : assets/audio/a.mp3\n- Empreinte : ${'0'.repeat(64)}`);
  assert.throws(() => loadMusic(f.root), /musique\.md:3.*SHA-256 différent/);
});

test('un lien vidéo seul ne remplace jamais le lecteur local', t => {
  const f = fixture(t);
  f.md('## Vidéo de référence\n\n- Source : [YouTube](https://www.youtube.com/watch?v=exemple-test)');
  assert.throws(() => loadMusic(f.root), /Fichier est obligatoire/);
});

test('Source reste une provenance, jamais le média lu par le lecteur', t => {
  const f = fixture(t); f.file('a.mp3');
  f.md('## Audio\n\n- Fichier : assets/audio/a.mp3\n- Source : [Preuve](https://example.org/preuve)');
  const music = loadMusic(f.root);
  assert.equal(music.tracks.length, 1);
  assert.equal(music.tracks[0].src, 'assets/audio/a.mp3');
  assert.equal(music.tracks[0].source, 'https://example.org/preuve');
  const html = render(music);
  assert.match(html, /<audio controls preload="none" src="assets\/audio\/a.mp3"/);
  assert.doesNotMatch(html, /music-links|<iframe/);
});

test('fichier déclaré absent, signature incorrecte ou dossier : refus contextualisé', t => {
  for (const [name, data] of [['faux.mp3', '<html>pas du son</html>'], ['vide.wav', ''], ['faux.wave', mp3]]) {
    const f = fixture(t); f.file(name, data); f.md(`## Audio\n\n- Fichier : assets/audio/${name}`);
    assert.throws(() => loadMusic(f.root), /musique\.md:3.*Signature/);
  }
  const f = fixture(t); f.md('## Audio\n\n- Fichier : assets/audio/album.mp3');
  assert.throws(() => loadMusic(f.root), /absent/);
  mkdirSync(join(f.audio, 'album.mp3'));
  assert.throws(() => loadMusic(f.root), /fichier\/dossier réel/);
});

test('liens symboliques refusés sur les fichiers déclarés et leurs parents', t => {
  for (const component of ['src/assets/audio', 'src/assets', 'src', 'contenu']) {
    const f = fixture(t); f.file('a.mp3'); f.md('## Audio\n\n- Fichier : assets/audio/a.mp3');
    const elsewhere = join(f.root, 'ailleurs'); mkdirSync(elsewhere);
    rmSync(join(f.root, component), { recursive: true }); symlinkSync(elsewhere, join(f.root, component));
    assert.throws(() => loadMusic(f.root), /lien symbolique/);
  }
  const f = fixture(t); f.file('a.mp3');
  symlinkSync(join(f.audio, 'a.mp3'), join(f.audio, 'alias.mp3'));
  f.md('## Audio\n\n- Fichier : assets/audio/alias.mp3');
  assert.throws(() => loadMusic(f.root), /lien symbolique/);
});

test('syntaxe, champs inconnus/dupliqués, chemins sortants et faux liens refusés', t => {
  const f = fixture(t); f.file('a.mp3');
  writeFileSync(join(f.root, 'src/assets/a.mp3'), mp3);
  const bad = ['- Inconnu : x', '- Fichier :', '- Fichier : assets/audio/a.mp3\n- Fichier : assets/audio/b.mp3',
    '- Fichier : https://example.org/a.mp3', '- Fichier : ../a.mp3', '- Fichier : assets/audio/../a.mp3',
    '- Fichier : assets/audio/.cache.mp3', '- Fichier : assets/audio/a\\\\b.mp3',
    '- Fichier : assets/audio/dangereux\u202e.mp3', '- Fichier : assets/audio/a.ogg',
    '- Crédit : Seul', '- Source : https://example.org', '- Démonstration : true\n- Fichier : assets/audio/a.mp3',
    '- Démonstration : oui\n- Fichier : assets/audio/a.mp3', '- Empreinte : faux\n- Fichier : assets/audio/a.mp3'];
  for (const body of bad) {
    f.md('## Invalide\n\n' + body);
    assert.throws(() => loadMusic(f.root), /musique\.md:\d+/, body);
  }
  f.md('x'.repeat(65537)); assert.throws(() => loadMusic(f.root), /64 Kio/);
  assert.throws(() => parseMusic('## Sans titre principal'), /commencez/);
  assert.throws(() => parseMusic('# Musique\n\n## A\n\n- Fichier : assets/audio/a.mp3\n\n## B\n\n- Fichier : assets/audio/a.mp3'), /Fichier répété/);
});

test('Source et Licence : HTTPS public uniquement, pas de script ou d’identifiants', t => {
  const f = fixture(t); f.file('a.mp3');
  for (const field of ['Source', 'Licence']) for (const url of ['javascript:alert(1)', 'data:audio/mpeg,x', '//example.org',
    'http://example.org', 'https://user:secret@example.org', 'https://example.org/%0a', '/hors-assets.mp3']) {
    f.md(`## Audio\n\n- Fichier : assets/audio/a.mp3\n- ${field} : [Lien](${url})`);
    assert.throws(() => loadMusic(f.root), /musique\.md:\d+/);
  }
});

test('HTML auto-échappé, un audio natif et crédits sans JS, aucun autoplay', t => {
  const f = fixture(t); f.file('a.mp3'); f.file('b.wav');
  f.md(`## <img src=x onerror=alert(1)>\n\n- Fichier : assets/audio/a.mp3\n${demo.replace('Un auteur', 'A & B')}\n\nExtrait de 36 secondes.\n\n## Second\n\n- Fichier : assets/audio/b.wav`);
  const html = render(loadMusic(f.root));
  assert.equal((html.match(/<audio\b/g) || []).length, 1);
  assert.match(html, /<audio controls preload="none"/);
  assert.doesNotMatch(html, /<audio[^>]*\bhidden|\bautoplay\b|\bloop\b|<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /pas des enregistrements de Loz’Banda/);
  assert.match(html, /href="assets\/audio\/b.wav"/);
  assert.match(html, /type="range"[^>]+disabled/);
  assert.match(html, /aria-live="polite"/);
});

class Element extends EventTarget {
  constructor() { super(); this.hidden = false; this.textContent = ''; this.attributes = {}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  focus() { this.focused = true; }
}
class Media extends Element {
  constructor() {
    super();
    this.paused = true; this.ended = false; this.currentTime = 0; this.duration = NaN;
    this.error = null; this.requests = []; this.loadCount = 0;
  }
  play() {
    this.paused = false;
    return new Promise((resolve, reject) => this.requests.push({ resolve, reject }));
  }
  pause() {
    const changed = !this.paused;
    this.paused = true;
    if (changed) this.dispatchEvent(new Event('pause'));
  }
  load() {
    this.loadCount++;
    this.currentTime = 0; this.duration = NaN; this.ended = false; this.error = null;
    this.dispatchEvent(new Event('emptied'));
  }
}
function player() {
  const audio = new Media();
  const names = ['controls', 'track', 'toggle', 'position', 'time', 'status', 'action', 'icon', 'native-title', 'panel', 'expand', 'current', 'choices', 'kind'];
  const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
  nodes.controls.hidden = true;
  nodes.track.options = [
    { value: 'assets/audio/a.mp3', dataset: { title: 'Premier', demo: 'true' } },
    { value: 'assets/audio/b.mp3', dataset: { title: 'Second' } },
  ];
  nodes.track.selectedIndex = 0;
  Object.defineProperties(nodes.track, {
    selectedOptions: { get() { return [this.options[this.selectedIndex]]; } },
    value: { get() { return this.selectedOptions[0].value; } },
  });
  audio.src = nodes.track.value;
  const view = new EventTarget();
  const root = {
    ownerDocument: { defaultView: view, body: { classList: { add() {} } } },
    setAttribute() {},
    querySelector(query) { return query === 'audio' ? audio : nodes[query.slice(12, -1)]; },
  };
  initMusicPlayer(root);
  return {
    audio, nodes, view,
    click() { nodes.toggle.dispatchEvent(new Event('click')); },
    select(index) { nodes.track.selectedIndex = index; nodes.track.dispatchEvent(new Event('change')); },
    event(name) { audio.dispatchEvent(new Event(name)); },
  };
}

test('amélioration progressive sans chargement, lecture ni stockage à l’initialisation', () => {
  const p = player();
  assert.equal(p.audio.hidden, true);
  assert.equal(p.nodes.controls.hidden, false);
  assert.equal(p.audio.requests.length, 0);
  assert.equal(p.audio.loadCount, 0);
  assert.equal(p.nodes.position.disabled, true);
  assert.equal(p.nodes.time.textContent, '0:00');
  assert.equal(p.nodes.toggle.attributes['aria-label'], 'Lire : Premier');
  const source = readFileSync(join(project, 'src/music-player.js'), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|new Audio|\.loop\s*=|\.autoplay\s*=/);
});

test('mini-lecteur : titre, démo et panneau refermable sans arrêter le morceau', () => {
  const p = player();
  assert.equal(p.nodes.panel.hidden, true);
  assert.equal(p.nodes.current.textContent, 'Premier');
  assert.equal(p.nodes.kind.textContent, 'Démo · ');
  p.click();
  p.nodes.expand.dispatchEvent(new Event('click'));
  assert.equal(p.nodes.panel.hidden, false);
  assert.equal(p.audio.paused, false);
  p.nodes.panel.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(p.nodes.panel.hidden, true);
  assert.equal(p.nodes.expand.focused, true);
  assert.equal(p.audio.paused, false);
  p.nodes.expand.dispatchEvent(new Event('click'));
  p.nodes.expand.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(p.nodes.panel.hidden, true);
  p.select(1);
  assert.equal(p.nodes.current.textContent, 'Second');
  assert.equal(p.nodes.kind.textContent, '');
});

test('play interrompu par pause : rejet absorbé, pas de fausse erreur ni redémarrage tardif', async () => {
  const p = player();
  p.click();
  assert.equal(p.nodes.action.textContent, 'Pause');
  assert.equal(p.nodes.status.textContent, 'Chargement…');
  p.click();
  assert.equal(p.audio.paused, true);
  assert.equal(p.nodes.action.textContent, 'Lire');
  p.audio.requests[0].reject(Object.assign(new Error('interrompu'), { name: 'AbortError' }));
  await tick();
  assert.equal(p.nodes.status.textContent, '', 'pause sans message visible supplémentaire');
  p.audio.paused = false;
  p.event('playing');
  assert.equal(p.audio.paused, true);
});

test('changements rapides et anciennes promesses ne perturbent pas la piste courante', async () => {
  const p = player();
  p.click();
  p.select(1);
  assert.equal(p.audio.paused, true);
  assert.equal(p.audio.requests.length, 1, 'changer de piste ne déclenche pas la suivante');
  p.click();
  p.audio.requests[0].reject(new Error('ancienne erreur réseau'));
  p.event('playing');
  p.audio.requests[1].resolve();
  await tick();
  assert.equal(p.nodes.status.textContent, '');
  assert.equal(p.nodes.action.textContent, 'Pause');
  assert.equal(p.audio.src, 'assets/audio/b.mp3');
  p.select(0); p.select(1); p.select(0);
  assert.equal(p.audio.requests.length, 2);
  assert.equal(p.nodes.action.textContent, 'Lire');
  assert.equal(p.audio.src, 'assets/audio/a.mp3');
});

test('erreurs honnêtes, nouvelle tentative possible et refus navigateur explicite', async () => {
  const p = player();
  p.click();
  p.audio.requests[0].reject(Object.assign(new Error('bloqué'), { name: 'NotAllowedError' }));
  await tick();
  assert.match(p.nodes.status.textContent, /bloquée par le navigateur/);
  assert.equal(p.nodes.action.textContent, 'Lire');
  p.click();
  p.audio.error = { code: 4 };
  p.event('error');
  p.audio.requests[1].reject(new Error('codec'));
  await tick();
  assert.match(p.nodes.status.textContent, /indisponible ou illisible/);
  assert.equal(p.nodes.action.textContent, 'Lire');
  p.click();
  assert.equal(p.audio.loadCount, 1, 'réinitialise un média en erreur pour réessayer');
  p.audio.requests[2].resolve();
  p.event('playing');
  await tick();
  assert.equal(p.nodes.status.textContent, '');
});

test('durée, progression, seek en pause, fin sans boucle et reprise explicite', async () => {
  const p = player();
  p.audio.duration = 36;
  p.audio.currentTime = 3;
  p.event('loadedmetadata');
  assert.equal(p.nodes.position.disabled, false);
  assert.equal(p.nodes.time.textContent, '0:03 / 0:36');
  p.nodes.position.value = 12.7;
  p.nodes.position.dispatchEvent(new Event('input'));
  assert.equal(p.audio.currentTime, 12.7);
  assert.equal(p.audio.paused, true);
  assert.equal(p.audio.requests.length, 0);
  assert.equal(p.nodes.position.attributes['aria-valuetext'], '0:12 sur 0:36');
  p.click(); p.audio.requests[0].resolve(); await tick();
  p.audio.currentTime = 36; p.audio.paused = true; p.audio.ended = true;
  p.event('ended');
  assert.equal(p.audio.requests.length, 1);
  assert.equal(p.nodes.track.selectedIndex, 0);
  assert.equal(p.nodes.action.textContent, 'Lire');
  assert.equal(p.nodes.time.textContent, '0:36 / 0:36');
  assert.equal(p.nodes.status.textContent, 'Morceau terminé.');
  p.click();
  assert.equal(p.audio.currentTime, 0);
  assert.equal(p.audio.requests.length, 2);
  p.audio.requests[1].resolve(); await tick();
});

test('pause externe, durée infinie et sortie de page restent cohérentes', async () => {
  const p = player();
  p.click(); p.audio.requests[0].resolve(); await tick();
  p.audio.pause();
  assert.equal(p.nodes.action.textContent, 'Lire');
  assert.equal(p.nodes.status.textContent, '', 'la pause externe reste discrète');
  p.audio.duration = Infinity;
  p.event('durationchange');
  assert.equal(p.nodes.position.disabled, true);
  p.click();
  p.view.dispatchEvent(new Event('pagehide'));
  p.audio.requests[1].reject(Object.assign(new Error('arrêt'), { name: 'AbortError' }));
  await tick();
  assert.equal(p.audio.paused, true);
  assert.equal(p.nodes.action.textContent, 'Lire');
});

test('budget du lecteur flottant inférieur à 13 Ko, contrôles 44 px et pas de mouvement', () => {
  const files = ['src/music-player.js', 'src/music-player.css', 'src/_includes/music-player.njk'];
  assert.ok(files.reduce((sum, file) => sum + statSync(join(project, file)).size, 0) <= 13000);
  const css = readFileSync(join(project, 'src/music-player.css'), 'utf8');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /var\(--red\)|animation\s*:|transition\s*:/);
});

test('imports YouTube autorisés : sources exactes, empreintes privées et durées intégrales', {
  skip: !existsSync(join(project, 'sources/audio/youtube-20260929/manifest-autorise.json')),
}, () => {
  const manifest = JSON.parse(readFileSync(join(project, 'sources/audio/youtube-20260929/manifest-autorise.json'), 'utf8'));
  assert.equal(manifest.authorization.openLicenseClaimed, false);
  assert.ok(manifest.tracks.length > 0);
  assert.equal(new Set(manifest.tracks.map(track => track.id)).size, manifest.tracks.length);
  const activeSources = loadMusic(project).tracks.map(track => track.source);
  for (const track of manifest.tracks) {
    assert.ok(activeSources.includes(track.source), 'Le manifeste actif ne conserve pas de morceau retiré');
    for (const artifact of [track.original, track.metadata]) {
      assert.ok(artifact.file.startsWith('sources/audio/youtube-20260929/originaux/'));
      assert.equal(digest(readFileSync(join(project, artifact.file))), artifact.sha256);
    }
    const metadata = JSON.parse(readFileSync(join(project, track.metadata.file), 'utf8'));
    assert.equal(metadata.id, track.id);
    assert.equal(track.source, `https://www.youtube.com/watch?v=${track.id}`);
    assert.equal(track.sourceLicense, null, 'aucune licence ouverte inventée');
    assert.ok(Math.abs(Number(track.original.probe.format.duration) - Number(track.published.probe.format.duration)) < .1);
    assert.equal(track.published.probe.streams[0].codec_name, 'mp3');
    assert.equal(track.published.probe.streams[0].bit_rate, '192000');
  }
});

test('sources et extraits de démonstration : provenance, licences, hashes et preuves', {
  skip: !existsSync(join(project, 'sources/audio/manifest.json')),
}, () => {
  const manifest = JSON.parse(readFileSync(join(project, 'sources/audio/manifest.json'), 'utf8'));
  const catalog = JSON.parse(readFileSync(join(project, 'sources/audio/incompetech-pieces.json'), 'utf8'));
  const music = loadMusic(project);
  assert.equal(manifest.tracks.length, 2);
  for (const artifact of [manifest.research.report, ...manifest.evidence, ...manifest.tracks.map(track => track.original)]) {
    assert.match(artifact.file, /^(?:sources\/audio\/|src\/assets\/audio\/)/);
    assert.equal(digest(readFileSync(join(project, artifact.file))), artifact.sha256, artifact.file);
  }
  for (const track of manifest.tracks) {
    assert.equal(track.license.url, 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(track.author, 'Kevin MacLeod (incompetech.com)');
    assert.equal(track.excerpt.durationSeconds, 36);
    assert.equal(new URL(track.download).hostname, 'incompetech.com');
    assert.ok(catalog.some(entry => entry.isrc === track.isrc && entry.title === track.title && entry.genre === '11'));
    const current = music.tracks.find(item => `src/${item.src}` === track.excerpt.file);
    // Les démonstrations peuvent être retirées ou remplacées par l’éditeur.
    if (current?.demo && current.source === track.source) {
      assert.equal(current.changes, track.excerpt.changes);
      assert.equal(digest(readFileSync(join(project, track.excerpt.file))), track.excerpt.sha256);
    }
  }
  for (const file of ['bossa-antigua-page.html', 'local-forecast-page.html']) {
    const page = readFileSync(join(project, 'sources/audio', file), 'utf8');
    assert.match(page, /Licensed under Creative Commons: By Attribution 4\.0 License/);
    assert.match(page, /Kevin MacLeod \(incompetech\.com\)/);
    assert.match(page, /fetch\('pieces\.json'\)/);
  }
});
