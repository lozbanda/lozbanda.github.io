import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitePage, ordinaryClick, updateHeader } from '../src/navigation.js';

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

test('le menu est remplacé sans détacher la barre et son lecteur, avec ou sans logo', () => {
  for (const withBrand of [true, false]) {
    const actions = [], next = {}, brand = {};
    const player = Object.freeze({ audio: 'persistant' });
    const bar = Object.freeze({ player });
    const current = {
      bar,
      querySelector(selector) {
        if (selector === '.site-nav') return { replaceWith(node) { actions.push(['menu', node]); } };
        if (selector === '.brand') return { remove() { actions.push(['logo retiré']); } };
        throw new Error(`Ne pas toucher au lecteur : ${selector}`);
      },
      prepend(node) { actions.push(['logo ajouté', node]); },
      replaceWith() { throw new Error('Le header doit rester connecté'); },
    };
    const incoming = {
      className: withBrand ? 'site-header container' : 'site-header home-header container',
      querySelector(selector) { return selector === '.site-nav' ? next : withBrand ? brand : null; },
    };
    updateHeader(current, incoming);
    assert.equal(current.bar, bar);
    assert.equal(current.bar.player, player);
    assert.equal(current.className, incoming.className);
    assert.deepEqual(actions, [['logo retiré'], ...(withBrand ? [['logo ajouté', brand]] : []), ['menu', next]]);
  }
});

test('un en-tête sans menu est refusé avant toute mutation', () => {
  const current = { className: 'intact', querySelector: () => null };
  assert.throws(() => updateHeader(current, { className: 'invalide', querySelector: () => null }), /Navigation absente/);
  assert.equal(current.className, 'intact');
});

test('navigation progressive sans recréer le lecteur ni stockage, budget indépendant', () => {
  const source = readFileSync(new URL('../src/navigation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new Audio|\.play\(|\.pause\(|localStorage|sessionStorage|innerHTML\s*=/);
  assert.match(source, /disposePage/);
  assert.match(source, /popstate/);
  assert.match(source, /location\.assign/);
  assert.ok(Buffer.byteLength(source) < 8000);
});
