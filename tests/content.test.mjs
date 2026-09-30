import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeSource } from '../site/content-data.js';
import { normalizeEvents } from '../site/agenda-data.js';
import { normalizeGallery } from '../site/gallery-data.js';

const source = { url: 'https://www.facebook.com/photo/?fbid=1382553327192338', libelle: ' Publication d’origine ' };

test('source facultative, HTTPS, libellé en texte simple', () => {
  assert.equal(normalizeSource(undefined), null);
  assert.equal(normalizeSource(null), null);
  assert.equal(normalizeSource(source).libelle, 'Publication d’origine');
  assert.equal(normalizeSource({ ...source, libelle: '<img src=x>' }).libelle, '<img src=x>');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.org', '/source.html',
    'http://example.org', 'https://user:password@example.org', 'https://example.org/\ninvalide']) {
    assert.throws(() => normalizeSource({ ...source, url }));
  }
  for (const value of ['', {}, { url: source.url, libelle: '' }, { ...source, url: 42 }]) {
    assert.throws(() => normalizeSource(value));
  }
});

test('sources présentes dans les données, sans URL de navigation automatique FullCalendar', () => {
  const [event] = normalizeEvents([{ titre: 'Test', date: '2026-09-03', source }]);
  const [photo] = normalizeGallery([{ titre: 'Test', description: '', image: 'assets/test.webp', source }]);
  assert.deepEqual(event.extendedProps.source, photo.source);
  assert.equal(event.url, undefined);
  for (const name of ['agenda.html', 'galerie.html']) {
    const html = readFileSync(new URL('../site/' + name, import.meta.url), 'utf8');
    for (const [link] of html.matchAll(/<a\b[^>]*(?:href="https:|id="(?:event|gallery)-source")[^>]*>/g)) {
      assert.match(link, /target="_blank"/);
      assert.match(link, /rel="noopener noreferrer"/);
    }
  }
});

test('justificatifs municipaux conservés hors site, avec source HTTPS et empreinte', { skip: !existsSync(new URL('../sources/agenda/manifest.json', import.meta.url)) }, () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('sources/agenda/manifest.json', root), 'utf8'));
  for (const document of manifest.documents) {
    assert.ok(document.fichier.startsWith('sources/agenda/'));
    assert.equal(new URL(document.url).protocol, 'https:');
    const digest = createHash('sha256').update(readFileSync(new URL(document.fichier, root))).digest('hex');
    assert.equal(digest, document.sha256);
    assert.ok(document.verification.length > 0);
  }
});

test('photos Facebook locales, sources et empreintes conservées, aucune URL CDN périssable', { skip: !existsSync(new URL('../sources/facebook/manifest.json', import.meta.url)) }, () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('sources/facebook/manifest.json', root), 'utf8'));
  const photos = JSON.parse(readFileSync(new URL('site/sorties.json', root), 'utf8'));
  assert.ok(manifest.images.length > 0);
  for (const image of manifest.images) {
    assert.ok(image.photo.startsWith('https://www.facebook.com/photo/'));
    for (const file of [{ fichier: image.original, sha256: image.sha256 }, ...image.derives]) {
      const digest = createHash('sha256').update(readFileSync(new URL(file.fichier, root))).digest('hex');
      assert.equal(digest, file.sha256);
    }
  }
  assert.ok(photos.filter(p => /^assets\/facebook\/[^/]+$/.test(p.image)).every(photo => photo.source
    && manifest.images.some(image => image.derives.some(file => file.fichier === 'src/' + photo.image))));
  assert.doesNotMatch(JSON.stringify(photos), /fbcdn|scontent/);
  assert.equal(manifest.images.find(i => i.nom.startsWith('salagou')).evenementDate, null);
  for (const name of ['groupe-espalion-2023', 'groupe-plein-air-2019']) {
    assert.equal(manifest.images.find(i => i.nom === name).evenementDate, null, 'La publication ne date pas la prise de vue');
  }
});

test('collection Facebook complémentaire : originaux et dérivés fidèles, dates non déduites', {
  skip: !existsSync(new URL('../sources/facebook/recherche-20260929/derives.json', import.meta.url)),
}, () => {
  const root = new URL('../', import.meta.url);
  const sources = JSON.parse(readFileSync(new URL('sources/facebook/recherche-20260929/manifest.json', root), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('sources/facebook/recherche-20260929/derives.json', root), 'utf8'));
  const photos = JSON.parse(readFileSync(new URL('site/sorties.json', root), 'utf8'));
  for (const image of manifest.images) {
    const original = sources.images.find(item => item.fichier === image.original);
    assert.ok(['musique', 'vie-du-groupe'].includes(original.categorie));
    assert.equal(original.datePriseDeVue, null);
    assert.equal(image.source, original.urlPermanente);
    for (const file of [{ fichier: image.original, sha256: image.sha256 }, ...image.derives]) {
      assert.equal(createHash('sha256').update(readFileSync(new URL(file.fichier, root))).digest('hex'), file.sha256);
    }
    const photo = photos.find(p => image.derives.some(d => d.fichier === 'src/' + p.image));
    if (photo) assert.equal(photo.source.url, image.source);
  }
  assert.doesNotMatch(JSON.stringify(photos), /fbcdn|scontent/);
});

test('photo du final collectif : provenance du partenaire et empreintes conservées', { skip: !existsSync(new URL('../sources/partenaires/manifest.json', import.meta.url)) }, () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('sources/partenaires/manifest.json', root), 'utf8'));
  const photos = JSON.parse(readFileSync(new URL('site/sorties.json', root), 'utf8'));
  for (const image of manifest.images) {
    assert.equal(new URL(image.page).protocol, 'https:');
    assert.equal(new URL(image.photo).protocol, 'https:');
    assert.ok(image.verification.includes('Loz Banda'));
    for (const file of [{ fichier: image.original, sha256: image.sha256 }, ...image.derives]) {
      assert.equal(createHash('sha256').update(readFileSync(new URL(file.fichier, root))).digest('hex'), file.sha256);
    }
    const entry = photos.find(photo => image.derives.some(file => file.fichier === 'src/' + photo.image));
    if (entry) assert.equal(entry.source?.url, image.page, 'Provenance conservée si la photo reste publiée');
  }
});
