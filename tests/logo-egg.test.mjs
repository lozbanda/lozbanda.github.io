import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initLogoEgg } from '../src/logo-egg.js';

function fixture(reduced = false) {
  const button = new EventTarget(), motion = new EventTarget(), animations = [];
  let time = 0;
  const logo = { animate(frames, options) {
    const value = { frames, options, playState: 'running', cancelled: false,
      cancel() { this.cancelled = true; this.playState = 'idle'; } };
    animations.push(value); return value;
  } };
  button.disabled = true;
  button.querySelector = () => logo;
  motion.matches = reduced;
  const root = { querySelector: () => button };
  const init = () => initLogoEgg(root, motion, () => time);
  const dispatch = (type, props = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props); button.dispatchEvent(event); return event;
  };
  const click = props => { time += 100; return dispatch('click', props); };
  return { root, logo, button, motion, animations, init, dispatch, click,
    advance: ms => { time += ms; }, triple: () => { click(); click(); click(); } };
}

test('logo : immobile au chargement, trois activations puis une danse finie sans altérer le dessin', () => {
  const f = fixture(), dispose = f.init();
  assert.equal(f.button.disabled, false);
  assert.equal(f.animations.length, 0);
  f.click(); f.click(); assert.equal(f.animations.length, 0);
  f.click(); assert.equal(f.animations.length, 1);
  const a = f.animations[0];
  assert.deepEqual(a.options, { duration: 1100, iterations: 1, easing: 'ease-in-out' });
  assert.equal(a.frames[0].transform, 'none');
  assert.equal(a.frames.at(-1).transform, 'none');
  assert.ok(a.frames.every(frame => Object.keys(frame).join() === 'transform'));
  f.triple(); assert.equal(f.animations.length, 1, 'Pas de pile d’animations');
  a.playState = 'finished'; f.triple(); assert.equal(f.animations.length, 2);
  dispose();
});

test('logo : des clics espacés ne déclenchent pas la surprise', () => {
  const f = fixture(), dispose = f.init();
  f.click(); f.advance(1700); f.click(); f.click();
  assert.equal(f.animations.length, 0);
  f.click(); assert.equal(f.animations.length, 1);
  dispose();
});

test('logo : clics modifiés ignorés, répétition clavier refusée, Échap arrête immédiatement', () => {
  const f = fixture(), dispose = f.init();
  for (const props of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { button: 1 }]) f.click(props);
  assert.equal(f.animations.length, 0);
  assert.equal(f.dispatch('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  assert.equal(f.dispatch('keydown', { key: ' ', repeat: true }).defaultPrevented, true);
  assert.equal(f.dispatch('keydown', { key: 'Enter', repeat: false }).defaultPrevented, false, 'Activation native conservée');
  f.triple(); f.dispatch('keydown', { key: 'Escape' });
  assert.equal(f.animations[0].cancelled, true);
  f.click(); f.click(); assert.equal(f.animations.length, 1);
  dispose();
});

test('logo : préférence de mouvement réduit respectée au chargement et pendant la danse', () => {
  const f = fixture(true), dispose = f.init();
  assert.equal(f.button.disabled, true); f.triple(); assert.equal(f.animations.length, 0);
  f.motion.matches = false; f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.button.disabled, false); f.triple(); assert.equal(f.animations.length, 1);
  f.motion.matches = true; f.motion.dispatchEvent(new Event('change'));
  assert.equal(f.animations[0].cancelled, true); assert.equal(f.button.disabled, true);
  f.triple(); assert.equal(f.animations.length, 1);
  dispose();
});

test('logo : remontage idempotent et nettoyage des listeners, même après navigation', () => {
  const f = fixture(), first = f.init(), second = f.init();
  first(); assert.equal(f.button.disabled, false, 'Ancien nettoyage sans effet sur le nouveau montage');
  f.triple(); assert.equal(f.animations.length, 1);
  second(); assert.equal(f.animations[0].cancelled, true); assert.equal(f.button.disabled, true);
  f.triple(); assert.equal(f.animations.length, 1);
  f.motion.dispatchEvent(new Event('change')); assert.equal(f.button.disabled, true);
  const third = f.init(); f.triple(); assert.equal(f.animations.length, 2); third();
});

test('logo : absence ou API manquante sans erreur, bouton natif sans changement de taille ni ressource tierce', () => {
  initLogoEgg({ querySelector: () => null })();
  const f = fixture(); delete f.logo.animate; f.init()(); assert.equal(f.button.disabled, true);
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.match(read('src/index.njk'), /<button class="logo-egg" type="button" aria-label="[^"]*trois activations[^"]*" disabled>/);
  assert.match(read('src/index.njk'), /width="1200" height="960"/);
  const code = read('src/logo-egg.js');
  assert.ok(Buffer.byteLength(code) < 3000);
  assert.doesNotMatch(code, /fetch\(|localStorage|sessionStorage|setInterval|\.play\(|https?:/);
  assert.match(code, /site:navigated/);
  assert.match(code, /pageshow/);
  assert.match(code, /pagehide/);
  assert.match(read('src/_includes/base.njk'), /src="logo-egg.js"/);
});
