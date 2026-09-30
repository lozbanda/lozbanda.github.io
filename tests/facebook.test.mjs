import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { loadContent, parseInfos } from '../build/content.mjs';
import { ordinaryClick, sitePage } from '../src/navigation.js';
import site from '../src/_data/site.js';

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(fileURLToPath(new URL('../src/_includes/', import.meta.url))), { autoescape: true });
const macro = '{% from "facebook-button.njk" import facebookButton %}{{ facebookButton(url) }}';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function checkFacebook(link, label = 'Facebook') {
  assert.match(link, /class="button button--secondary facebook-button"/);
  assert.ok(link.includes(`href="${escape(site.facebook)}"`));
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /aria-label="[^"]*nouvel onglet"/);
  assert.equal(link.replace(/<[^>]+>/g, '').trim(), escape(label));
  assert.doesNotMatch(link, /<svg|<img|<span|onclick=/);
}

test('Facebook : même bouton bleu natif, texte seul, nouvel onglet protégé', () => {
  checkFacebook(env.renderString(macro, { url: site.facebook }));
  const special = env.renderString(macro, { url: 'https://example.org/?a="&b=1' });
  assert.match(special, /href="https:\/\/example.org\/\?a=&quot;&amp;b=1"/);
  assert.equal(sitePage(site.facebook, 'https://example.org/ma-banda/'), null);
  assert.equal(ordinaryClick({ button: 0 }, { target: '_blank', hasAttribute: () => false }), false);
});

test('infos : Facebook secondaire depuis le Markdown, contact jaune et autres liens conservés', () => {
  const template = read('src/infos-pratiques.njk').replace(/^---[\s\S]*?---\n/, '');
  const infos = parseInfos(`# Infos\n\n## Rejoindre\n\n- Bouton : [Facebook](${site.facebook})\n\nPour faire connaissance.\n\n## Inviter\n\n- Bouton : [Contacter la banda](mailto:test@example.org)\n\nPour préparer une fête.\n\n## Autre lien\n\n- Bouton : [Informations](https://example.org/)\n\nDu texte.\n`);
  const html = env.renderString(template, { site, contenus: { infos } });
  const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
  assert.equal(links.length, 3);
  checkFacebook(links[0]);
  assert.match(links[1], /class="button" href="mailto:test@example.org"/);
  assert.doesNotMatch(links[1], /button--secondary|target=/);
  assert.match(links[1], /Contacter la banda/);
  assert.match(links[2], /class="button" href="https:\/\/example.org\/" target="_blank" rel="noopener noreferrer"/);
  infos[0].button.libelle = 'Facebook & <autres>';
  const custom = env.renderString(template, { site, contenus: { infos } });
  checkFacebook(custom.match(/<a\b[^>]*>[\s\S]*?<\/a>/)[0], infos[0].button.libelle);
});

test('mise en avant limitée à l’accueil, la galerie et aux cartes éditoriales, pied de page inchangé', () => {
  const infoButtons = loadContent().infos.filter(card => card.button?.url === site.facebook);
  for (const [page, count] of [['index', 1], ['galerie', 1], ['infos-pratiques', infoButtons.length], ['agenda', 0], ['musiciens', 0]]) {
    const html = read(`site/${page}.html`);
    const main = html.match(/<main\b[\s\S]*?<\/main>/)[0];
    const links = [...main.matchAll(/<a class="button button--secondary facebook-button"[\s\S]*?<\/a>/g)].map(match => match[0]);
    assert.equal(links.length, count, page);
    links.forEach((link, index) => checkFacebook(link, page === 'infos-pratiques' ? infoButtons[index].button.libelle : 'Facebook'));
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /class="source-link"/);
    assert.doesNotMatch(footer, /class="button|facebook-button|button--secondary/);
    assert.doesNotMatch(html, /connect\.facebook\.net|fb-root|fb-page|fbq\(|<iframe/);
    if (page === 'index') assert.match(main, /<\/h1>\s*<a class="button button--secondary facebook-button"/);
    if (page === 'galerie') assert.ok(main.indexOf('facebook-callout') < main.indexOf('class="photo-grid"'));
  }
});
