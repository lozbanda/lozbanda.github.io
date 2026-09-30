import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEvents, parsePhotos, parseInfos, loadContent, PHOTO_SIZES } from '../build/content.mjs';

const event = '# Agenda\n\n## Un rendez-vous\n\n- Identifiant : rendez-vous\n- Date : 2027-02-15\n- Début : 18:30\n- Fin : 20:30\n- Lieu : Salle des associations\n\nUne **belle** soirée.\n\nAvec de la musique.\n';
const photo = '# Photos\n\n## Un souvenir\n\n- Image : assets/exemple.webp\n- Alternative : Des musiciens.\n\nUne description.\n';

test('agenda Markdown : titres, champs français, paragraphes et horaires conservés', () => {
  assert.deepEqual(parseEvents(event), [{ id: 'rendez-vous', titre: 'Un rendez-vous', date: '2027-02-15', heure: '18:30', heureFin: '20:30', lieu: 'Salle des associations', description: 'Une belle soirée.\n\nAvec de la musique.' }]);
  assert.deepEqual(parseEvents('# Agenda\n\nAucune date renseignée.\n'), []);
  const noTime = event.replace('- Début : 18:30\n- Fin : 20:30\n', '');
  assert.equal(parseEvents(noTime)[0].heure, undefined);
  assert.equal(parseEvents(event.replace(/\n/g, '\r\n'))[0].heureFin, '20:30');
});

test('exemples Markdown explicitement balisés, sans valeur ambiguë', () => {
  const example = value => event.replace('- Date :', `- Exemple : ${value}\n- Date :`);
  assert.equal(parseEvents(example('oui'))[0].exemple, true);
  assert.equal(parseEvents(example('non'))[0].exemple, false);
  assert.equal(parseEvents(event)[0].exemple, undefined);
  for (const value of ['true', 'peut-être', '']) assert.throws(() => parseEvents(example(value)), /contenu\/agenda.md/);
});

test('dates et champs invalides refusés avec nom de fichier et entrée', () => {
  for (const invalid of [event.replace('2027-02-15', '2027-02-30'), event.replace('Début', 'Horaire'),
    event.replace('18:30', '24:10'), event.replace('20:30', '17:30'), event.replace('Salle des associations', ''),
    event.replace('- Lieu', '- Date : 2027-02-15\n- Lieu'), event.replace('- Date : 2027-02-15\n', ''),
    event + event.slice(event.indexOf('## ')), event.replace('Une **belle** soirée.', '### Un sous-titre'),
    event.replace('- Lieu : Salle des associations', '- Lieu : Salle\n  - Une sous-liste')]) {
    assert.throws(() => parseEvents(invalid), /contenu\/agenda\.md:\d+ — Un rendez-vous/);
  }
  assert.throws(() => parseEvents('## Sans titre de fichier\n'), /commencez par un titre/);
});

test('identifiants automatiques stables au réordonnancement, périodes inclusives', () => {
  const a = event.replace('- Identifiant : rendez-vous\n', '');
  const b = a.replace('Un rendez-vous', 'Un autre rendez-vous').replace('2027-02-15', '2027-03-02');
  const first = parseEvents(a + b.slice(b.indexOf('## ')));
  const second = parseEvents(b + a.slice(a.indexOf('## ')));
  assert.equal(first[0].id, second[1].id);
  const multi = a.replace('- Début : 18:30\n- Fin : 20:30', '- Dernier jour : 2027-02-17');
  assert.equal(parseEvents(multi)[0].dateFin, '2027-02-17');
  assert.throws(() => parseEvents(multi.replace('2027-02-17', '2027-02-13')), /date de fin invalide/);
});

test('source HTTPS sous forme de lien Markdown, pas une URL libre ou un script', () => {
  const withSource = value => event.replace('- Lieu : Salle des associations', `- Source : ${value}`);
  assert.deepEqual(parseEvents(withSource('[La commune](https://example.org/date?a=1&b=2)'))[0].source,
    { url: 'https://example.org/date?a=1&b=2', libelle: 'La commune' });
  for (const value of ['https://example.org', '[Source](http://example.org)', '[Source](javascript:alert(1))',
    '[Source](https://user:pass@example.org)', '[Source](https://example.org) texte en trop']) {
    assert.throws(() => parseEvents(withSource(value)));
  }
});

test('galerie Markdown : ordre éditorial, titre, alternative et description optionnellement vide', () => {
  const second = photo.replace('Un souvenir', 'Un autre').replace('exemple.webp', 'autre.webp');
  const entries = parsePhotos(second + photo.slice(photo.indexOf('## ')));
  assert.deepEqual(entries.map(p => p.titre), ['Un autre', 'Un souvenir']);
  assert.equal(entries[0].alt, 'Des musiciens.');
  assert.equal(parsePhotos(photo.replace('Une description.', ''))[0].description, '');
  assert.deepEqual(parsePhotos('# Photos\n'), [], 'Une galerie sans photo validée peut rester vide');
  assert.throws(() => parsePhotos(photo + photo.slice(photo.indexOf('## '))), /répétée/);
  for (const image of ['../secret.webp', 'assets/../secret.webp', 'https://example.org/image.webp', 'assets/a.svg']) {
    assert.throws(() => parsePhotos(photo.replace('assets/exemple.webp', image)), /contenu\/galerie.md/);
  }
});

test('infos pratiques : vraies cartes Markdown, liens sûrs et bouton éditorial', () => {
  const cards = parseInfos('# Infos\n\n## Le groupe\n\nNotre **banda** et ses *musiciens*.\n\n- Cuivres\n- Bois\n\n## Contact\n\n- Bouton : [Écrire](mailto:test@example.org)\n\n[La commune](https://example.org).\n');
  assert.equal(cards.length, 2);
  assert.match(cards[0].html, /<strong>banda<\/strong>/);
  assert.match(cards[0].html, /<em>musiciens<\/em>/);
  assert.match(cards[0].html, /<ul>/);
  assert.equal(cards[1].button.url, 'mailto:test@example.org');
  assert.match(cards[1].html, /rel="noopener noreferrer"/);
  const literal = parseInfos('# Infos\n\n## Texte\n\n<script>alert(1)</script>\n')[0].html;
  assert.doesNotMatch(literal, /<script/);
  assert.match(literal, /&lt;script&gt;/);
  assert.throws(() => parseInfos('# Infos\n\n## Texte\n\n![Image](https://example.org/a.png)\n'), /pas d’images/);
  assert.throws(() => parseInfos('# Infos\n\n## Texte\n\n[Lien](../sources/prive.txt)\n'), /lien autorisé/);
  assert.throws(() => parseInfos('# Infos\n\n## Vide\n'), /vide/);
  assert.match(parseInfos('# Infos\n\n## Groupe\n\n[Les Musiciens](musiciens.html#contenu)\n')[0].html, /href="musiciens.html#contenu"/);
});

test('Markdown réellement relu à chaque génération, sans cache des textes', () => {
  const content = loadContent();
  const generated = name => JSON.parse(readFileSync(new URL('../site/' + name, import.meta.url), 'utf8'));
  assert.deepEqual(content.events, generated('evenements.json'));
  assert.deepEqual(content.photos, generated('sorties.json'));
  assert.equal(content.gallery.length, content.photos.length);
  assert.equal(content.photoSizes, PHOTO_SIZES);
  assert.ok(content.gallery.every(p => p.width > 0 && p.height > 0));
});

test('contrôle des images : absence, vraie largeur du srcset et liens symboliques hors assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'lozbanda-images-test-'));
  try {
    cpSync(new URL('../contenu/', import.meta.url), join(root, 'contenu'), { recursive: true });
    mkdirSync(join(root, 'src/assets'), { recursive: true });
    writeFileSync(join(root, 'contenu/galerie.md'), photo);
    assert.throws(() => loadContent(root), /image absente/);
    cpSync(new URL('../src/assets/logo.webp', import.meta.url), join(root, 'src/assets/exemple.webp'));
    writeFileSync(join(root, 'contenu/galerie.md'), photo.replace('- Alternative', '- Variantes : assets/exemple.webp 720w\n- Alternative'));
    assert.throws(() => loadContent(root), /largeur incorrecte/);
    writeFileSync(join(root, 'contenu/galerie.md'), photo);
    const first = loadContent(root);
    writeFileSync(join(root, 'contenu/galerie.md'), photo.replace('Un souvenir', 'Titre modifié'));
    assert.equal(loadContent(root).photos[0].titre, 'Titre modifié');
    assert.equal(first.photos[0].titre, 'Un souvenir');
    cpSync(new URL('../src/assets/logo.webp', import.meta.url), join(root, 'hors-assets.webp'));
    symlinkSync(join(root, 'hors-assets.webp'), join(root, 'src/assets/interdit.webp'));
    writeFileSync(join(root, 'contenu/galerie.md'), photo.replace('exemple.webp', 'interdit.webp'));
    assert.throws(() => loadContent(root), /hors du dossier autorisé/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
