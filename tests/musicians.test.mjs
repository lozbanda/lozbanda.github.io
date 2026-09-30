import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nunjucks from 'nunjucks';
import { parseMusicians, loadContent } from '../build/content.mjs';

const member = '# Musiciens\n\nGuide non publié.\n\n## Camille\n\n- Instrument : Saxophone\n\nUne **histoire** personnelle.\n\nEt la suite.\n';
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('musiciens : un bloc par membre, ordre libre, instrument et histoire en texte simple', () => {
  assert.deepEqual(parseMusicians(member), [{ id: 'musicien-1', nom: 'Camille', instrument: 'Saxophone', image: '', alt: '', description: 'Une histoire personnelle.\n\nEt la suite.', exemple: false }]);
  const second = member.slice(member.indexOf('## ')).replace('Camille', 'Claude').replace('Saxophone', 'Percussions');
  assert.deepEqual(parseMusicians(member + second).map(m => m.nom), ['Camille', 'Claude']);
  assert.equal(parseMusicians(member.replace(/\n/g, '\r\n'))[0].instrument, 'Saxophone');
  assert.deepEqual(parseMusicians('# Musiciens\n\nBientôt.\n'), []);
});

test('musiciens : photo facultative, alternative automatique ou éditoriale, exemples explicites', () => {
  const photo = member.replace('- Instrument', '- Photo : assets/musiciens/camille.webp\n- Instrument');
  assert.equal(parseMusicians(photo)[0].alt, 'Portrait de Camille');
  assert.equal(parseMusicians(photo.replace('- Photo', '- Alternative : Camille à la trompette\n- Photo'))[0].alt, 'Camille à la trompette');
  for (const value of ['oui', 'non']) assert.equal(parseMusicians(member.replace('- Instrument', `- Exemple : ${value}\n- Instrument`))[0].exemple, value === 'oui');
  for (const extension of ['webp', 'jpg', 'jpeg', 'png', 'avif']) assert.ok(parseMusicians(photo.replace('camille.webp', `camille.${extension}`))[0].image);
});

test('musiciens : champs manquants ou ambigus, chemins distants et traversées refusés', () => {
  const invalid = [member.replace('- Instrument : Saxophone', '- Instrument :'), member.replace('- Instrument : Saxophone\n', ''),
    member.replace('- Instrument', '- Inconnu : non\n- Instrument'), member.replace('- Instrument', '- Instrument : Trompette\n- Instrument'),
    member.replace('- Instrument', '- Exemple : peut-être\n- Instrument'), member.replace('- Instrument', '- Alternative : Sans photo\n- Instrument'),
    member.replace('Une **histoire** personnelle.\n\nEt la suite.', ''), member.replace('Une **histoire** personnelle.', '![Image](https://example.org/a.png)')];
  for (const image of ['https://example.org/a.jpg', '/assets/musiciens/a.png', 'assets/musiciens/../a.png', 'assets/musiciens/%2e%2e/a.png', 'assets/musiciens/a.svg', 'assets/musiciens/a.webp?x=1', 'assets/autre/a.jpg']) {
    invalid.push(member.replace('- Instrument', `- Photo : ${image}\n- Instrument`));
  }
  for (const source of invalid) assert.throws(() => parseMusicians(source), /contenu\/musiciens.md:\d+ : Camille/);
});

test('musiciens : contrôle des portraits locaux, dimensions réelles et erreur contextualisée', () => {
  const root = mkdtempSync(join(tmpdir(), 'lozbanda-musicians-'));
  try {
    mkdirSync(join(root, 'contenu'));
    mkdirSync(join(root, 'src/assets/musiciens'), { recursive: true });
    writeFileSync(join(root, 'contenu/agenda.md'), '# Agenda\n');
    writeFileSync(join(root, 'contenu/infos-pratiques.md'), '# Infos\n\n## Test\n\nTexte.\n');
    writeFileSync(join(root, 'contenu/galerie.md'), '# Photos\n\n## Test\n\n- Image : assets/logo.webp\n');
    cpSync(new URL('../src/assets/logo.webp', import.meta.url), join(root, 'src/assets/logo.webp'));
    const file = join(root, 'contenu/musiciens.md');
    const photo = member.replace('- Instrument', '- Photo : assets/musiciens/camille.webp\n- Instrument');
    writeFileSync(file, photo);
    assert.throws(() => loadContent(root), /contenu\/musiciens.md:\d+ : Camille : image absente/);
    writeFileSync(join(root, 'src/assets/musiciens/camille.webp'), 'pas une image');
    assert.throws(() => loadContent(root), /format d’image invalide/);
    cpSync(new URL('../src/assets/logo.webp', import.meta.url), join(root, 'src/assets/musiciens/camille.webp'));
    const content = loadContent(root);
    assert.equal(content.musicians[0].width, 300);
    assert.equal(content.musicians[0].height, 240);
    assert.equal(content.hasDemoMusicians, false);
    cpSync(new URL('../src/assets/logo.webp', import.meta.url), join(root, 'portrait-prive.webp'));
    symlinkSync(join(root, 'portrait-prive.webp'), join(root, 'src/assets/musiciens/interdit.webp'));
    writeFileSync(file, photo.replace('camille.webp', 'interdit.webp'));
    assert.throws(() => loadContent(root), /contenu\/musiciens.md:.*hors du dossier autorisé/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('musiciens : rendu sans JS, portrait réel ou emplacement neutre, textes échappés', () => {
  const template = readFileSync(new URL('../src/musiciens.njk', import.meta.url), 'utf8').replace(/^---[\s\S]*?---\n/, '');
  const env = new nunjucks.Environment(null, { autoescape: true });
  const members = parseMusicians(member.replace('Camille', '<script>Camille</script>'));
  const render = musicians => env.renderString(template, { contenus: { musicians } });
  const placeholder = render(members);
  assert.match(placeholder, /&lt;script&gt;Camille&lt;\/script&gt;/);
  assert.doesNotMatch(placeholder, /<script>|<img/);
  assert.match(placeholder, /Photo à venir/);
  const photo = render([{ ...members[0], image: 'assets/musiciens/camille.webp', alt: 'Portrait de Camille', width: 300, height: 240 }]);
  assert.match(photo, /src="assets\/musiciens\/camille.webp" width="300" height="240" alt="Portrait de Camille" loading="lazy"/);
  assert.doesNotMatch(photo, /Photo à venir/);
  assert.match(render([]), /Les portraits des musiciens arrivent bientôt/);
  const fiction = render([{ ...members[0], exemple: true }]);
  assert.match(fiction, /&lt;script&gt;Camille&lt;\/script&gt; <span class="musician-fiction">\(portrait fictif\)<\/span><\/h2>/);
  assert.doesNotMatch(placeholder, /musician-fiction/);
  assert.doesNotMatch(fiction, /Fiches? d’exemple|Des instruments, des personnalités|musicians-draft/);
});

test('musiciens : toutes les fiches éditoriales dans le HTML généré, aucune dépendance dédiée', () => {
  const { musicians } = loadContent();
  const html = readFileSync(new URL('../site/musiciens.html', import.meta.url), 'utf8');
  assert.equal((html.match(/class="musician-card"/g) || []).length, musicians.length);
  assert.equal((html.match(/class="musician-fiction"/g) || []).length, musicians.filter(member => member.exemple).length);
  assert.doesNotMatch(html, /Fiches? d’exemple|Des instruments, des personnalités|musicians-draft/);
  for (const member of musicians) {
    const notice = member.exemple ? ' <span class="musician-fiction">(portrait fictif)</span>' : '';
    assert.ok(html.includes(`id="${member.id}">${escape(member.nom)}${notice}</h2>`));
    assert.ok(html.includes(escape(member.instrument)));
    assert.ok(html.includes(escape(member.description)));
    if (member.image) assert.ok(html.includes(`src="${member.image}"`));
  }
  assert.doesNotMatch(html, /musiciens\.js|musicians\.js|<iframe|src="https?:/);
});
