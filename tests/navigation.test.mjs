import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitePage, ordinaryClick } from '../src/navigation.js';

test('navigation : uniquement les cinq documents locaux, racine et sous-dossier Pages', () => {
  for (const base of ['https://example.org/', 'https://example.org/ma-banda/']) {
    for (const page of ['index', 'agenda', 'galerie', 'musiciens', 'infos-pratiques']) {
      assert.equal(sitePage(`${page}.html`, base), page);
      assert.equal(sitePage(`${page}.html?exemple=1#contenu`, base), page);
    }
    assert.equal(sitePage(base, base), 'index');
    for (const url of ['assets/audio/a.mp3', 'sorties.json', 'constructor', '__proto__', 'https://autre.test/agenda.html',
      'https://user:secret@example.org/agenda.html', 'mailto:banda@example.org', 'javascript:alert(1)', 'page-absente.html']) {
      assert.equal(sitePage(url, base), null, url);
    }
  }
  assert.equal(sitePage('/agenda.html', 'https://example.org/ma-banda/'), null);
});

test('navigation : ne pas voler nouveaux onglets, téléchargements et clics modifiés', () => {
  const event = { button: 0 }, link = { target: '', hasAttribute: () => false };
  assert.equal(ordinaryClick(event, link), true);
  for (const field of ['defaultPrevented', 'ctrlKey', 'metaKey', 'shiftKey', 'altKey']) assert.equal(ordinaryClick({ ...event, [field]: true }, link), false);
  assert.equal(ordinaryClick({ button: 1 }, link), false);
  assert.equal(ordinaryClick(event, { ...link, target: '_blank' }), false);
  assert.equal(ordinaryClick(event, { ...link, hasAttribute: () => true }), false);
  assert.equal(ordinaryClick(event, null), false);
});

test('navigation progressive sans recréer le lecteur ni stockage, budget indépendant', () => {
  const source = readFileSync(new URL('../src/navigation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new Audio|\.play\(|\.pause\(|localStorage|sessionStorage|innerHTML\s*=/);
  assert.match(source, /disposePage/);
  assert.match(source, /popstate/);
  assert.match(source, /location\.assign/);
  assert.ok(Buffer.byteLength(source) < 8000);
});
