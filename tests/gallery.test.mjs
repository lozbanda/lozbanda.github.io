import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGallery, nextIndex } from '../site/gallery-data.js';

const data = JSON.parse(readFileSync(new URL('../site/sorties.json', import.meta.url), 'utf8'));
const simple = { titre: ' Notre sortie ', description: ' Un moment en musique. ', image: 'assets/sorties/photo.webp' };

test('le fichier éditorial contient une liste valide, de longueur libre', () => {
  const items = normalizeGallery(data);
  assert.deepEqual(normalizeGallery([]), [], 'Une galerie en attente est valide');
  assert.equal(items.length, data.length);
  assert.ok(items.every(item => typeof item.description === 'string' && item.alt));
});

test('ajouter, réordonner et retirer des photos ne nécessite aucun changement de code', () => {
  const input = [simple, ...data.slice().reverse()];
  const items = normalizeGallery(input);
  assert.equal(items.length, data.length + 1);
  assert.equal(items[0].titre, 'Notre sortie');
  assert.equal(items[0].miniature, simple.image);
  assert.equal(items[0].alt, 'Notre sortie');
  assert.equal(items[0].srcset, '');
  assert.equal(input[0].titre, ' Notre sortie ', 'Pas de mutation du JSON');
  assert.equal(normalizeGallery([simple]).length, 1);
  assert.equal(normalizeGallery([{ ...simple, description: '' }])[0].description, '');
});

test('une configuration invalide est rejetée entièrement pour conserver le repli HTML', () => {
  for (const invalid of [null, {}, [null], [{}], [{ ...simple, titre: '' }], [{ ...simple, description: null }]]) {
    assert.throws(() => normalizeGallery(invalid));
  }
});

test('les fichiers restent locaux, y compris les miniatures et srcset', () => {
  for (const image of ['https://example.org/image.jpg', '//example.org/a.png', '/assets/a.webp',
    'assets/../secret.png', 'assets/%2e%2e/a.png', 'assets/a.svg', 'javascript:alert(1)', 'assets/a.webp?x=1']) {
    assert.throws(() => normalizeGallery([{ ...simple, image }]));
    assert.throws(() => normalizeGallery([{ ...simple, miniature: image }]));
    assert.throws(() => normalizeGallery([{ ...simple, srcset: `${image} 640w` }]));
  }
  assert.throws(() => normalizeGallery([{ ...simple, srcset: 'assets/a.webp 0w' }]));
  assert.throws(() => normalizeGallery([{ ...simple, srcset: 'assets/a.webp 640w,' }]));
  for (const extension of ['jpg', 'jpeg', 'webp', 'png', 'avif']) {
    assert.equal(normalizeGallery([{ ...simple, image: `assets/sorties/ete-2026.${extension}` }]).length, 1);
  }
});

test('les descriptions restent du texte, sans interprétation HTML', () => {
  const description = '<img src=x onerror=alert(1)> & "bonjour"';
  assert.equal(normalizeGallery([{ ...simple, description }])[0].description, description);
  const js = readFileSync(new URL('../site/gallery.js', import.meta.url), 'utf8');
  assert.match(js, /description\.textContent = item\.description/);
  assert.match(js, /title\.textContent = item\.titre/);
});

test('le carrousel boucle dans les deux sens et gère une seule photo', () => {
  assert.equal(nextIndex(0, -1, 4), 3);
  assert.equal(nextIndex(3, 1, 4), 0);
  assert.equal(nextIndex(1, 1, 4), 2);
  assert.equal(nextIndex(0, -1, 1), 0);
  assert.equal(nextIndex(0, 1, 1), 0);
  assert.equal(nextIndex(0, 1, 0), 0);
});
