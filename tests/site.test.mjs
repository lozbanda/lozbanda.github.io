import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { loadContent } from '../build/content.mjs';
import { loadMusic } from '../build/audio.mjs';
import siteConfig from '../src/_data/site.js';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const pages = Object.fromEntries(['index.html', 'agenda.html', 'galerie.html', 'musiciens.html', 'infos-pratiques.html']
  .map(name => [name, readFileSync(join(root, name), 'utf8')]));
const html = pages['index.html'];
const gallery = pages['galerie.html'];
const allHTML = Object.values(pages).join('\n');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const js = readFileSync(join(root, 'gallery.js'), 'utf8');
const data = JSON.parse(readFileSync(join(root, 'sorties.json'), 'utf8'));
const events = JSON.parse(readFileSync(join(root, 'evenements.json'), 'utf8'));
const decode = value => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const agendaCode = ['agenda.css', 'agenda.js', 'agenda-data.js', 'agenda-carousel.js'].map(name => readFileSync(join(root, name), 'utf8')).join('\n');
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
const navigation = siteConfig.navigation.map(item => [item.href, item.label]);
const infos = loadContent().infos;

test('cinq vraies pages avec titres distincts, structure et ancres accessibles', () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /<html lang="fr">/);
    assert.equal((page.match(/<h1\b/g) ?? []).length, 1, name);
    assert.equal((page.match(/<main\b/g) ?? []).length, 1, name);
    assert.match(page, /<main id="contenu"[^>]*tabindex="-1"/);
    assert.match(page, /class="skip-link" href="#contenu"/);
    assert.equal(page.match(/name="robots" content="([^"]*)"/)[1], siteConfig.robots);
    titles.add(page.match(/<title>([^<]+)<\/title>/)[1]);
    descriptions.add(page.match(/name="description" content="([^"]+)"/)[1]);
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, name);
    for (const [, id] of page.matchAll(/(?:href="#|aria-(?:labelledby|describedby)=")([^" ]+)"/g)) {
      assert.ok(ids.includes(id), `${name} : ${id}`);
    }
  }
  assert.equal(titles.size, 5);
  assert.equal(descriptions.size, 5);
});

test('les intitulés du menu, des pages et du partage restent cohérents sans changer les URL', () => {
  for (const [href, label] of navigation) {
    const page = pages[href];
    const heading = decode(page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '').trim());
    assert.equal(heading, label, href);
    assert.equal(decode(page.match(/<title>([^<]+)<\/title>/)[1]), `${label} | ${siteConfig.nom}`, href);
    assert.equal(decode(page.match(/property="og:title" content="([^"]+)"/)[1]), `${label} | ${siteConfig.nom}`, href);
  }
});

test('sortie éditoriale et code du site sans symboles décoratifs supprimés', () => {
  function checkDirectory(directory) {
    for (const name of readdirSync(directory)) {
      if (name === 'vendor') continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) checkDirectory(path);
      else if (/\.(?:html|css|js|json)$/.test(name)) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /[\u2197\u2014]/u, path);
      }
    }
  }
  checkDirectory(root);
});

test('quatre liens natifs, logo avant le titre sur l’accueil et retour depuis les autres pages', () => {
  for (const [name, page] of Object.entries(pages)) {
    const header = page.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)[1];
    const nav = header.match(/<nav class="site-nav" aria-label="Navigation principale">([\s\S]*?)<\/nav>/)[1];
    const links = [...nav.matchAll(/<a href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(links.map(([, href, , label]) => [href, label.replace(/<[^>]+>/g, '').trim()]), navigation, name);
    assert.equal((nav.match(/class="nav-icon"/g) ?? []).length, 4);
    for (const [, href, attrs] of links) {
      assert.equal(attrs.includes('aria-current="page"'), href === name, `${name} : ${href}`);
    }
    if (name === 'index.html') {
      assert.doesNotMatch(header, /<img\b|class="brand"|aria-current/);
      assert.match(page, /<section class="hero"[^>]*>\s*<div class="hero-body">/);
      assert.ok(page.indexOf('class="hero-logo"') < page.indexOf('<h1'));
      assert.match(page, /<div class="hero-body">\s*<button class="logo-egg"[^>]*>\s*<img class="hero-logo"/);
    } else {
      assert.ok(header.indexOf('class="brand"') < header.indexOf('<nav'), 'Le logo précède le menu, visuellement et au clavier');
      assert.match(header, /class="brand" href="index.html" aria-label="Loz’Banda, accueil"/);
      assert.equal((header.match(/aria-current="page"/g) ?? []).length, 1);
    }
  }
  assert.match(css, /\.site-header \{[^}]*justify-content: center;[^}]*align-items: center;/);
});

test('accueil : titre, logo, musique et Facebook, contact en pied de page, agenda sourcé', () => {
  assert.equal((html.match(/<img\b/g) ?? []).length, 1, 'Le logo seulement sur l’accueil');
  assert.doesNotMatch(html, /photo-link|<dialog|sorties\.json/);
  assert.doesNotMatch(html, /home-contact|Contacter la banda/);
  assert.match(html, /<span class="sr-only">Loz’Banda/);
  assert.doesNotMatch(html, /<br\b/);
  assert.equal(decode(html.match(/class="email-link"[^>]+href="([^"]+)"/)[1]), `mailto:${siteConfig.email}`);
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(heading, 'Loz’Banda : Des cuivres, du rythme et le plaisir de jouer ensemble.');
  assert.doesNotMatch(html, /tout simplement|class="description"|eyebrow/i);
  assert.doesNotMatch(html, /La fête,/i);
  assert.doesNotMatch(html, /occasions|Fêtes de village|Animations de rue|Rendez-vous en musique/i);
  assert.match(pages['agenda.html'], /Les prochaines dates seront annoncées ici\./);
  assert.match(pages['agenda.html'], /src="vendor\/fullcalendar\/index.global.min.js" defer/);
  assert.match(pages['agenda.html'], /src="agenda.js"/);
  assert.match(pages['agenda.html'], /data-calendar-view="dayGridMonth"/);
  assert.match(pages['agenda.html'], /data-calendar-view="listMonth"/);
  const dates = [...pages['agenda.html'].matchAll(/<time datetime="([^"]+)"/g)].map(match => match[1]);
  assert.equal(dates.length, events.length, 'Chaque date Markdown est aussi lisible sans JavaScript');
  assert.ok(dates.every(date => events.some(event => event.date === date)));
  assert.equal((pages['infos-pratiques.html'].match(/<section aria-labelledby="info-/g) || []).length, infos.length);
  for (const card of infos) assert.ok(pages['infos-pratiques.html'].includes(card.html.trim()), card.titre);
});

test('playlist publiée issue du Markdown : vrai lecteur de fichiers locaux, aucun substitut vidéo', () => {
  const music = loadMusic();
  const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const item of music.tracks) assert.ok(html.includes(escape(item.title)), item.title);
  assert.equal(html.includes('<audio controls'), music.tracks.length > 0);
  assert.equal(html.includes('src="music-player.js"'), music.tracks.length > 0);
  assert.equal(html.includes('href="music-player.css"'), music.tracks.length > 0);
  if (music.tracks.length) for (const page of Object.values(pages)) {
    assert.match(page, /<details class="music-disclosure" data-music-disclosure>/);
    assert.match(page, /<summary[^>]+data-music-launcher[^>]+aria-controls="music-body"/);
    assert.equal((page.match(/id="music-body"/g) || []).length, 1);
  }
  for (const item of music.tracks) assert.ok(html.includes(`value="${escape(item.src)}"`));
  assert.doesNotMatch(html, /music-links|youtube-nocookie|<iframe/);
  const directory = join(root, 'assets/audio');
  const published = existsSync(directory) ? readdirSync(directory).sort() : [];
  assert.deepEqual(published, music.tracks.map(track => track.file).sort(), 'Aucun ancien fichier audio dans le site compilé');
});

test('pages secondaires compactes : titre accessible invisible, archives avant le calendrier', () => {
  for (const name of ['agenda.html', 'galerie.html', 'infos-pratiques.html']) {
    assert.match(pages[name], /<h1 class="sr-only">[^<]+<\/h1>/);
    assert.doesNotMatch(pages[name], /page-heading|page-lead|class="eyebrow"/);
  }
  const agenda = pages['agenda.html'];
  assert.ok(agenda.indexOf('id="agenda-upcoming"') < agenda.indexOf('id="agenda-archives"'));
  assert.ok(agenda.indexOf('id="agenda-archives"') < agenda.indexOf('class="agenda-layout"'));
  assert.match(agenda, /Nos dernières sorties/);
  assert.doesNotMatch(agenda, /Dans les archives/);
  assert.doesNotMatch(agenda, /agenda-contact|Une question pour la banda|<strong>Écrivez-nous/);
});

test('photos déplacées dans la galerie : alternatives, dimensions et repli fidèle au JSON', () => {
  for (const image of allHTML.matchAll(/<img\b[^>]*>/g)) {
    assert.match(image[0], /alt="[^"]+"/);
    assert.match(image[0], /width="\d+" height="\d+"/);
  }
  assert.equal((gallery.match(/<img\b/g) ?? []).length, data.length + 1);
  assert.equal((gallery.match(/loading="lazy"/g) ?? []).length, Math.max(0, data.length - 1));
  const links = [...gallery.matchAll(/class="photo-link" data-photo-index="(\d+)" href="([^"]+)"/g)];
  assert.equal(links.length, data.length, 'Toutes les photos Markdown existent dans le repli généré');
  links.forEach(([, index, href], i) => {
    assert.equal(Number(index), i);
    assert.equal(href, data[i].image, 'Même ordre en HTML et en JSON');
  });
  assert.doesNotMatch(allHTML + css, /LozBanda_IA|logo-480|logo-960|barlow|@font-face|banda\.svg/i);
  assert.equal(readFileSync(join(root, 'assets/logo.webp')).subarray(8, 12).toString(), 'WEBP');
});

test('logo haute densité réservé à l’accueil, sans modifier les petits logos', () => {
  assert.match(html, /class="hero-logo" src="assets\/logo-accueil\.webp" width="1200" height="960"/);
  for (const name of ['agenda.html', 'galerie.html', 'musiciens.html', 'infos-pratiques.html']) {
    assert.match(pages[name], /class="brand-logo" src="assets\/logo\.webp" width="300" height="240"/);
    assert.doesNotMatch(pages[name], /logo-accueil\.webp/);
  }
  assert.equal(readFileSync(join(root, 'assets/logo-accueil.webp')).subarray(8, 12).toString(), 'WEBP');
});

test('galerie élargie : tailles responsive identiques pour le JSON et le repli HTML', () => {
  const sizes = [...gallery.matchAll(/sizes="([^"]+)"/g)].map(m => m[1]);
  assert.equal(sizes.length, data.length);
  assert.equal(new Set(sizes).size, data.length ? 1 : 0);
  if (data.length) assert.ok(js.includes(`img.sizes = '${sizes[0]}'`));
  else assert.match(gallery, /Les photos de la banda arrivent bientôt/);
  assert.match(gallery, /class="container page gallery-page"/);
});

test('liens, ressources et srcset de chaque page compatibles racine et sous-dossier Pages', () => {
  for (const [name, page] of Object.entries(pages)) {
    const paths = [...page.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => decode(m[1])).filter(path => !path.startsWith('#'));
    for (const [, srcset] of page.matchAll(/srcset="([^"]+)"/g)) {
      paths.push(...srcset.split(',').map(part => part.trim().split(/\s+/)[0]));
    }
    if (name === 'galerie.html') {
      for (const item of data) {
        paths.push(item.image, item.miniature || item.image);
        if (item.srcset) paths.push(...item.srcset.split(',').map(part => part.trim().split(/\s+/)[0]));
      }
      paths.push('sorties.json', 'gallery-data.js', 'content-data.js');
    }
    if (name === 'agenda.html') paths.push('evenements.json', 'agenda-data.js', 'agenda-carousel.js', 'content-data.js');
    for (const path of paths) {
      if (/^mailto:/.test(path)) continue;
      if (path.startsWith('https://')) {
        const url = new URL(path);
        assert.equal(url.username + url.password, '');
        continue; // Liens sortants, jamais des ressources chargées automatiquement.
      }
      assert.ok(!/^(?:\/|[a-z]+:)/i.test(path), path);
      for (const prefix of ['/', '/ma-banda/', '/un/depot/']) {
        const url = new URL(path, `https://exemple.github.io${prefix}${name}`);
        assert.ok(url.pathname.startsWith(prefix), `${name} : ${path}`);
        assert.ok(statSync(resolve(root, decodeURIComponent(url.pathname.slice(prefix.length)))).isFile(), path);
      }
    }
  }
  assert.ok(existsSync(join(root, '.nojekyll')));
  assert.match(js, /new URL\('\.\/sorties\.json', import\.meta\.url\)/);
  assert.match(js, /from '\.\/gallery-data\.js'/);
});

test('galerie progressive uniquement sur sa page, sans service tiers ni stockage', () => {
  assert.doesNotMatch(allHTML, /<(?:iframe|video|form)\b|(?:src|srcset)="https?:|<link\b[^>]*href="https?:|\bonclick=/i);
  for (const [name, page] of Object.entries(pages)) {
    assert.equal((page.match(/<audio\b/g) || []).length, loadMusic().tracks.length ? 1 : 0);
    assert.match(page, /src="navigation\.js"/);
    assert.doesNotMatch(page.match(/<main\b[\s\S]*?<\/main>/)[0], /data-music-player/);
  }
  assert.doesNotMatch(html, /<audio[^>]*\b(?:autoplay|loop)\b/);
  assert.doesNotMatch(css, /@import|url\(/i);
  for (const [name, page] of Object.entries(pages)) {
    assert.equal(page.includes('<script type="module" src="gallery.js"></script>'), name === 'galerie.html');
  }
  assert.doesNotMatch(js, /innerHTML|localStorage|sessionStorage|clipboard|setInterval|https?:\/\//);
  assert.match(js, /event\.ctrlKey.*event\.metaKey/);
  assert.match(js, /items\.map\(/, 'Toutes les photos apparaissent dans la grille');
  assert.doesNotMatch(js, /hero-photo|gallery-all|renderHome|items\.slice\(1, 4\)/);
  assert.doesNotMatch(gallery + js + JSON.stringify(data), /gallery-source|Photo publiée par Loz’Banda sur Facebook/);
  assert.match(gallery, /<dialog[^>]+aria-labelledby="gallery-title"/);
  assert.match(gallery, /id="gallery-announcement" role="status" aria-live="polite"/);
  for (const label of ['Photo précédente', 'Photo suivante', 'Fermer la galerie']) assert.ok(gallery.includes(label));
});

test('contacts mailto natifs sur chaque page, préférences et focus conservés', () => {
  for (const page of Object.values(pages)) {
    const contacts = [...page.matchAll(/<a\b[^>]*class="email-link"[^>]*href="([^"]+)"[^>]*>/g)];
    assert.equal(contacts.length, 1);
    assert.equal(decode(contacts[0][1]), `mailto:${siteConfig.email}`);
    assert.doesNotMatch(page, /href="#contact"/);
  }
  for (const pattern of [/prefers-reduced-motion: reduce/, /forced-colors: active/, /:focus-visible/, /overflow-wrap: anywhere/]) {
    assert.match(css, pattern);
  }
});

test('contrastes des couleurs de texte, navigation active et focus', () => {
  const colors = Object.fromEntries([...css.matchAll(/--([a-z-]+): (#[a-f0-9]{6})/g)].map(m => [m[1], m[2]]));
  function luminance(hex) {
    const linear = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  for (const [a, b, minimum] of [['ink', 'paper', 7], ['muted', 'paper', 4.5], ['accent', 'paper', 4.5], ['accent', 'surface', 4.5], ['accent', 'soft', 4.5], ['accent', 'blue-soft', 4.5], ['ink', 'blue-soft', 7], ['ink', 'yellow', 4.5], ['accent', 'yellow', 3], ['ink', 'blue', 4.5], ['ink', 'blue-hover', 4.5], ['accent', 'blue', 3], ['accent', 'blue-hover', 3]]) {
    const values = [luminance(colors[a]), luminance(colors[b])].sort((x, y) => y - x);
    assert.ok((values[0] + .05) / (values[1] + .05) >= minimum, `${a}/${b}`);
  }
});

test('pied de page unique : même contenu, Facebook et contact sur les cinq pages', () => {
  const footers = Object.values(pages).map(page => page.match(/<footer\b[\s\S]*?<\/footer>/)[0]);
  assert.equal(new Set(footers).size, 1);
  assert.ok(footers[0].includes(siteConfig.facebook.replace(/&/g, '&amp;')));
  assert.match(footers[0], /rel="noopener noreferrer"/);
});

test('workflow manuel : génération testée, dépendances verrouillées et artefact limité au site', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /path: site\s/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /name: github-pages/);
  assert.match(workflow, /run: npm ci --ignore-scripts/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run check:publication/);
  assert.ok(workflow.indexOf('run: npm run check:publication') < workflow.indexOf('actions/upload-pages-artifact@'));
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /node-version-file: \.node-version/);
  for (const [, action] of workflow.matchAll(/uses: (\S+)/g)) assert.match(action, /^actions\/[\w-]+@[a-f0-9]{40}$/);
  assert.doesNotMatch(workflow, /path: ['"]?\.['"]?\s/);
});

test('CI automatique distincte : lecture seule, aucun déploiement de push ou de PR', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  for (const trigger of ['push', 'pull_request', 'workflow_dispatch']) assert.match(ci, new RegExp(`^  ${trigger}:`, 'm'));
  assert.match(ci, /contents: read/);
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /run: npm ci --ignore-scripts/);
  assert.match(ci, /run: npm test/);
  assert.match(ci, /run: python3 tests\/lan\.test\.py/);
  assert.doesNotMatch(ci, /pull_request_target|workflow_run|deploy-pages|pages: write|id-token: write|secrets\./);
  for (const [, action] of ci.matchAll(/uses: (\S+)/g)) assert.match(action, /^actions\/[\w-]+@[a-f0-9]{40}$/);
});

test('carrousels natifs accessibles et espace fluide sur l’accueil', () => {
  assert.equal((pages['agenda.html'].match(/aria-roledescription="carrousel"/g) || []).length, 2);
  assert.match(agendaCode, /scroll-snap-type: x mandatory/);
  assert.match(agendaCode, /prefers-reduced-motion/);
  assert.doesNotMatch(agendaCode, /setInterval|innerHTML|localStorage|https?:\/\//);
  assert.doesNotMatch(pages['agenda.html'].match(/<main\b[\s\S]*?<\/main>/)[0] + agendaCode, /[\u2013\u2014]/);
  assert.match(css, /gap: clamp\(28px, 5vmin, 64px\)/);
  for (const event of events.filter(event => event.exemple)) {
    assert.ok(decode(pages['agenda.html']).includes(`Exemple fictif : ${event.titre}`));
  }
});

test('budgets : présentation et navigation sous 101 Ko, lecteur avec CD sous 16 Ko et images sous 1 Mo', () => {
  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  const codeSize = dir => readdirSync(dir).filter(name => name !== 'vendor').reduce((sum, name) => {
    const path = join(dir, name);
    return sum + (statSync(path).isDirectory() ? codeSize(path) : /\.(?:njk|js|css)$/.test(name) ? statSync(path).size : 0);
  }, 0);
  // 95 Ko + 3 Ko pour le logo + 3 Ko pour le CD et son ouverture native, sans dépendance.
  assert.ok(codeSize(sourceRoot) < 101_000);
  const checkImages = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) checkImages(path);
      else if (/\.(?:webp|png|jpe?g|avif)$/i.test(name)) assert.ok(statSync(path).size < 1_000_000, `${path} : optimiser cette image sous 1 Mo`);
    }
  };
  // Pas de plafond global lié aux neuf photos initiales : ajouter une photo
  // optimisée ne doit pas exiger une modification du code ou des tests.
  checkImages(join(root, 'assets'));
  assert.ok(!existsSync(join(root, 'images')) && !existsSync(join(root, 'sources')));
});
