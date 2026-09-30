import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { buildMaintenance } from '../scripts/build-maintenance.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const project = fileURLToPath(new URL('../', import.meta.url));
// Jeux indépendants du contenu réel : une correction éditoriale ne doit jamais
// obliger à modifier les tests. Ces textes restent dans les copies temporaires.
const fixtureAgenda = '# Agenda\n\n## Rendez-vous de test\n\n- Date : 2027-02-15\n\nUn exemple non publié.\n';
const fixtureInfos = '# Infos\n\n## Carte de test\n\nTexte initial.\n';
const fixtureGallery = '# Galerie\n\n## Première photo de test\n\n- Image : assets/logo.webp\n\nUne description.\n\n## Seconde photo de test\n\n- Image : assets/favicon.png\n\nUne autre description.\n';
const fixtureMusicians = '# Musiciens\n\n## Camille de test\n\n- Instrument : Trompette\n\nUn choix raconté dans le Markdown.\n';
function seed(root) {
  for (const [name, text] of [['agenda', fixtureAgenda], ['infos-pratiques', fixtureInfos], ['galerie', fixtureGallery], ['musiciens', fixtureMusicians]]) {
    writeFileSync(join(root, `contenu/${name}.md`), text);
  }
}
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'lozbanda-build-test-'));
  for (const path of ['src', 'contenu', 'build', 'scripts', 'tests', 'maintenance', '.github', '.gitignore', 'eleventy.config.js', 'package.json', '.node-version']) {
    cpSync(join(project, path), join(root, path), { recursive: true });
  }
  // Dépendances installées réutilisées ; aucun original privé ni ancien site.
  symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'), 'dir');
  return root;
}
function build(root, success = true) {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status === 0, success, result.stdout + result.stderr);
  return result;
}
const read = (root, path) => readFileSync(join(root, path), 'utf8');
function change(root, file, transform) { writeFileSync(join(root, file), transform(read(root, file))); }
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(join(dir, entry.name), prefix + entry.name + '/') : [prefix + entry.name]);
}

test('génération depuis les seules sources publiables, données et médias fidèles', () => {
  const root = workspace();
  try {
    assert.equal(existsSync(join(root, 'sources')), false);
    assert.equal(existsSync(join(root, 'site')), false);
    build(root);
    assert.deepEqual(files(join(root, 'site')).sort(), files(join(project, 'site')).sort());
    for (const file of files(join(root, 'site'))) {
      assert.doesNotMatch(file, /^(?:contenu|build|scripts|sources|node_modules)\//);
      assert.doesNotMatch(file, /\.(?:njk|11ty\.js)$/);
      assert.deepEqual(readFileSync(join(root, 'site', file)), readFileSync(join(project, 'site', file)), file);
    }
    writeFileSync(join(root, 'site/obsolete.html'), 'Ancien fichier à ne plus publier.');
    build(root);
    assert.equal(existsSync(join(root, 'site/obsolete.html')), false, 'Pas de sortie obsolète conservée');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bascule complète aller-retour : maintenance isolée puis site rétabli sans résidus', () => {
  const root = workspace();
  try {
    build(root);
    const original = files(join(root, 'site')).sort().map(file => [file, readFileSync(join(root, 'site', file))]);
    buildMaintenance(root);
    assert.match(read(root, 'site/index.html'), /Maintenance en cours/);
    assert.equal(existsSync(join(root, 'site/evenements.json')), false);
    assert.equal(existsSync(join(root, 'site/assets/audio')), false);
    build(root);
    assert.deepEqual(files(join(root, 'site')).sort(), original.map(([file]) => file));
    for (const [file, data] of original) assert.deepEqual(readFileSync(join(root, 'site', file)), data, file);
    assert.equal(existsSync(join(root, 'site/maintenance.css')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('édition Markdown seule : calendrier, cartes et ordre des photos régénérés ensemble', () => {
  const root = workspace();
  try {
    seed(root);
    change(root, 'contenu/agenda.md', text => text.replace('## Rendez-vous de test', '## Rentrée modifiée en Markdown'));
    change(root, 'contenu/infos-pratiques.md', text => text.replace('Texte initial.', 'Notre **banda** est éditée en Markdown.\n\n[Un lien](https://example.org)\n\n## Autre carte\n\n- Bouton : [Informations](https://example.org/contact)\n\nDu contenu entièrement nouveau.'));
    change(root, 'contenu/galerie.md', text => {
      const [head, ...entries] = text.split(/(?=^## )/m);
      return head + entries.reverse().join('').replace('## Seconde photo de test', '## Photo déplacée en tête');
    });
    build(root);
    const events = JSON.parse(read(root, 'site/evenements.json'));
    assert.equal(events[0].titre, 'Rentrée modifiée en Markdown');
    assert.match(read(root, 'site/agenda.html'), /Rentrée modifiée en Markdown/);
    assert.match(read(root, 'site/infos-pratiques.html'), /Notre <strong>banda<\/strong> est éditée en Markdown/);
    const photos = JSON.parse(read(root, 'site/sorties.json'));
    assert.equal(photos[0].titre, 'Photo déplacée en tête');
    const html = read(root, 'site/galerie.html');
    assert.ok(html.indexOf(photos[0].image) < html.indexOf(photos[1].image));
    assert.match(html, /data-title="Photo déplacée en tête"/);
    assert.match(read(root, 'site/musiciens.html'), /Camille de test/);
    assert.match(read(root, 'site/musiciens.html'), /Un choix raconté dans le Markdown/);
    const portable = readdirSync(join(root, 'tests')).filter(file => file.endsWith('.test.mjs') && file !== 'build.test.mjs');
    const suite = spawnSync(process.execPath, ['--test', ...portable.map(file => 'tests/' + file)], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(suite.status, 0, 'Les tests ne doivent pas figer les contenus :\n' + suite.stdout + suite.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication : les exemples sont visibles en aperçu mais bloquent la mise en ligne', () => {
  const root = workspace();
  try {
    seed(root);
    const check = () => spawnSync(process.execPath, ['scripts/check-content.mjs', '--publication'], { cwd: root, encoding: 'utf8' });
    assert.equal(check().status, 0);
    change(root, 'contenu/agenda.md', text => text.replace('- Date :', '- Exemple : oui\n- Date :'));
    build(root);
    assert.match(read(root, 'site/agenda.html'), /Exemple fictif : Rendez-vous de test/);
    assert.equal(JSON.parse(read(root, 'site/evenements.json'))[0].exemple, true);
    const result = check();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Publication bloquée/);
    seed(root);
    assert.equal(check().status, 0);
    change(root, 'contenu/musiciens.md', text => text.replace('- Instrument :', '- Exemple : oui\n- Instrument :'));
    build(root);
    assert.match(read(root, 'site/musiciens.html'), /Camille de test <span class="musician-fiction">\(portrait fictif\)<\/span>/);
    const draft = check();
    assert.equal(draft.status, 1);
    assert.match(draft.stderr, /Publication bloquée.*contenu\/musiciens.md/);
    const approved = ['Camille Morel', 'Julien Perrin', 'Léa Garnier', 'Émile Roussel', 'Manon Delcourt', 'Hugo Bellier'];
    writeFileSync(join(root, 'contenu/musiciens.md'), '# Musiciens\n\n' + approved.map(name =>
      `## ${name}\n\n- Instrument : Trompette\n- Exemple : oui\n\nUn récit fictif signalé.\n`).join('\n'));
    assert.equal(check().status, 0, 'Les six portraits fictifs expressément demandés sont publiables');
    build(root);
    assert.equal((read(root, 'site/musiciens.html').match(/\(portrait fictif\)/g) || []).length, 6);
    change(root, 'contenu/musiciens.md', text => text.replace('- Exemple : oui', '- Exemple : non'));
    const unmarked = check();
    assert.equal(unmarked.status, 1, 'Interdit de transformer ces fictions en vraies identités');
    assert.match(unmarked.stderr, /doivent garder Exemple : oui/);
    seed(root);
    assert.equal(check().status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('playlist Markdown : seuls les MP3/WAV déclarés partent dans le site, jamais les originaux en attente', () => {
  const root = workspace();
  try {
    const audio = join(root, 'src/assets/audio');
    mkdirSync(audio, { recursive: true });
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(30)]);
    writeFileSync(join(audio, 'autorise.mp3'), mp3);
    writeFileSync(join(audio, 'non-declare.mp3'), mp3);
    writeFileSync(join(audio, 'credits.json'), '{ancien format ignoré}');
    writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n\n## Titre éditorial\n\n- Fichier : assets/audio/autorise.mp3\n');
    build(root);
    assert.match(read(root, 'site/index.html'), /Titre éditorial/);
    assert.match(read(root, 'site/index.html'), /music-player\.js/);
    assert.deepEqual(readdirSync(join(root, 'site/assets/audio')), ['autorise.mp3']);
    const old = read(root, 'site/index.html');
    writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n\n## Fichier absent\n\n- Fichier : assets/audio/absent.mp3\n');
    build(root, false);
    assert.equal(read(root, 'site/index.html'), old);
    writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n');
    build(root);
    assert.doesNotMatch(read(root, 'site/index.html'), /<audio|music-player\.js|autorise\.mp3/);
    assert.equal(existsSync(join(root, 'site/assets/audio/autorise.mp3')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('erreur éditoriale : génération refusée sans altérer le dernier site valide', () => {
  const root = workspace();
  try {
    build(root);
    const original = files(join(root, 'site')).map(file => [file, readFileSync(join(root, 'site', file))]);
    writeFileSync(join(root, 'contenu/agenda.md'), fixtureAgenda.replace('2027-02-15', '2027-02-30'));
    const failure = build(root, false);
    assert.match(failure.stdout + failure.stderr, /contenu\/agenda.md:\d+/);
    assert.match(failure.stderr, /site\/ est conservé/);
    for (const [file, data] of original) assert.deepEqual(readFileSync(join(root, 'site', file)), data, file);
    assert.ok(readdirSync(root).every(file => !file.startsWith('.build-')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('aperçu local : édition des cinq Markdown et sélection de fichiers audio surveillée', { timeout: 60_000 }, async () => {
  const root = workspace();
  seed(root);
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['scripts/dev.mjs', `--port=${port}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', bytes => { log += bytes; });
  child.stderr.on('data', bytes => { log += bytes; });
  const exited = once(child, 'exit');
  async function waitFor(path, text) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/${path}`, { signal: AbortSignal.timeout(1500) });
        const body = await response.text();
        if (response.ok && body.includes(text)) return body;
      } catch { /* Serveur ou génération pas encore prêt. */ }
      if (child.exitCode !== null) assert.fail(log);
      await delay(100);
    }
    assert.fail(`Délai dépassé pour ${path} : ${text}\n${log}`);
  }
  try {
    await waitFor('index.html', 'logo-accueil.webp');
    const network = Object.values(networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal);
    if (network) await assert.rejects(fetch(`http://${network.address}:${port}/`, { signal: AbortSignal.timeout(1500) }), 'Le serveur de test ne doit pas écouter sur l’interface réseau');
    // Le workspace contient la liste Git fermée : ses négations ne doivent pas
    // empêcher Eleventy de surveiller les cinq Markdown réellement éditables.
    assert.equal(existsSync(join(root, '.gitignore')), true);
    // L’adaptateur utilise bien listen({host: '127.0.0.1'}), pas une option ignorée.
    assert.match(read(root, 'build/dev-server/index.cjs'), /listen\(\{ port, host: '127\.0\.0\.1' \}\)/);
    change(root, 'contenu/agenda.md', text => text.replace('## Rendez-vous de test', '## Modification surveillée de l’agenda'));
    await waitFor('evenements.json', 'Modification surveillée de l’agenda');
    change(root, 'contenu/infos-pratiques.md', text => text.replace('## Carte de test', '## Carte modifiée pendant l’aperçu'));
    await waitFor('infos-pratiques.html', 'Carte modifiée pendant l’aperçu');
    change(root, 'contenu/galerie.md', text => text.replace('## Première photo de test', '## Photo modifiée pendant l’aperçu'));
    await waitFor('sorties.json', 'Photo modifiée pendant l’aperçu');
    await waitFor('galerie.html', 'Photo modifiée pendant l’aperçu');
    change(root, 'contenu/musiciens.md', text => text.replace('Camille de test', 'Musicien modifié pendant l’aperçu'));
    await waitFor('musiciens.html', 'Musicien modifié pendant l’aperçu');
    mkdirSync(join(root, 'src/assets/audio'), { recursive: true });
    const audioFile = join(root, 'src/assets/audio/00-audio-surveille.wav');
    const wave = Buffer.alloc(48);
    wave.write('RIFF', 0); wave.write('WAVE', 8);
    writeFileSync(audioFile, wave); // Fixture de signature, pas un enregistrement publié.
    writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n\n## Audio surveillé\n\n- Fichier : assets/audio/00-audio-surveille.wav\n');
    await waitFor('index.html', 'Audio surveillé');
    // Le HTML peut être écrit avant la fin de la copie passthrough du WAV.
    // Attendre seulement ce 404 transitoire ; une réponse 200 reste un échec.
    let audioRange;
    for (const start = Date.now(); Date.now() - start < 20_000; await delay(100)) {
      audioRange = await fetch(`http://127.0.0.1:${port}/assets/audio/00-audio-surveille.wav`, {
        headers: { Range: 'bytes=0-11' }, signal: AbortSignal.timeout(1500),
      });
      if (audioRange.status !== 404) break;
      await audioRange.arrayBuffer();
    }
    assert.equal(audioRange?.status, 206, 'L’aperçu permet de se déplacer dans les morceaux :\n' + log);
    assert.equal(audioRange.headers.get('Content-Range'), 'bytes 0-11/48');
    assert.deepEqual(Buffer.from(await audioRange.arrayBuffer()), wave.subarray(0, 12));
    writeFileSync(join(root, 'contenu/musique.md'), '# Musique\n');
    rmSync(audioFile);
    const emptyMusic = join(root, 'src/assets/audio');
    for (const file of readdirSync(emptyMusic)) if (/\.(?:mp3|wav|wave)$/i.test(file)) rmSync(join(emptyMusic, file));
    const start = Date.now();
    while (true) {
      const page = await fetch(`http://127.0.0.1:${port}/index.html`).then(response => response.text());
      if (!page.includes('data-music-player')) break;
      assert.ok(Date.now() - start < 20_000, 'La suppression des morceaux masque le lecteur :\n' + log);
      await delay(100);
    }
    const absent = await fetch(`http://127.0.0.1:${port}/contenu/agenda.md`);
    assert.equal(absent.status, 404, 'Les Markdown ne sont pas servis');
    assert.doesNotMatch(log, /error with your custom Eleventy server/, 'Aucun repli vers le serveur exposé au réseau');
  } finally {
    child.kill('SIGTERM');
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    rmSync(root, { recursive: true, force: true });
  }
});
