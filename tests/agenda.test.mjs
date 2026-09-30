import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { showSource } from '../site/content-data.js';
import { validDate, nextDay, todayInParis, normalizeEvents, upcomingEvent, upcomingEvents, pastEvents, eventDateLabel } from '../site/agenda-data.js';

const sortie = { titre: 'Rendez-vous test', date: '2026-09-25', lieu: 'Lieu de test', description: 'Description.' };

test('le fichier éditorial est valide, une liste vide est permise sans fausses dates', () => {
  const data = JSON.parse(readFileSync(new URL('../site/evenements.json', import.meta.url), 'utf8'));
  assert.equal(normalizeEvents(data).length, data.length);
  assert.deepEqual(normalizeEvents([]), []);
  assert.equal(upcomingEvent([]), null);
});

test('dates civiles valides, années bissextiles et changements de mois/année', () => {
  for (const date of ['2024-02-29', '2026-09-25', '2026-12-31']) assert.ok(validDate(date));
  for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '2026-01-00', '25/09/2026', null]) assert.equal(validDate(date), false);
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.equal(nextDay('2024-02-28'), '2024-02-29');
  assert.equal(nextDay('2026-03-29'), '2026-03-30');
});

test('aujourd’hui suit Paris, même autour de minuit et en heure d’été', () => {
  assert.equal(todayInParis(new Date('2026-09-24T22:30:00Z')), '2026-09-25');
  assert.equal(todayInParis(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('horaires annoncés préservés, sans inventer une heure de fin', () => {
  const [event] = normalizeEvents([{ ...sortie, heure: '18:30' }]);
  assert.equal(event.start, '2026-09-25T18:30:00');
  assert.equal(event.allDay, false);
  assert.equal(event.end, undefined);
  assert.match(eventDateLabel(event), /vendredi 25 septembre 2026 · 18 h 30/);
});

test('date seule et période inclusive converties en fin exclusive pour FullCalendar', () => {
  const [single] = normalizeEvents([sortie]);
  assert.equal(single.end, '2026-09-26');
  assert.equal(single.allDay, true);
  assert.match(eventDateLabel(single), /Horaire non renseigné/);
  const [multi] = normalizeEvents([{ ...sortie, dateFin: '2026-09-27' }]);
  assert.equal(multi.end, '2026-09-28');
  assert.match(eventDateLabel(multi), /au dimanche 27 septembre 2026/);
  assert.equal(upcomingEvent([multi], '2026-09-26'), multi, 'Une sortie en cours reste visible');
});

test('tri chronologique et prochain rendez-vous indépendant de l’ordre du fichier', () => {
  const events = normalizeEvents([{ ...sortie, date: '2027-01-01' }, { ...sortie, date: '2026-08-01' }, sortie]);
  assert.equal(events[0].start, '2026-08-01');
  assert.equal(upcomingEvent(events, '2026-09-25').start, sortie.date);
  assert.equal(upcomingEvent(events, '2026-09-26').start, '2027-01-01');
  assert.equal(upcomingEvent(events, '2027-02-01'), null);
});

test('données invalides refusées entièrement, doublons d’identifiants compris', () => {
  for (const data of [null, {}, [null], [{ ...sortie, date: '2026-02-30' }],
    [{ ...sortie, titre: '' }], [{ ...sortie, heure: '24:00' }], [{ ...sortie, heure: '09:60' }],
    [{ ...sortie, heure: 9 }], [{ ...sortie, dateFin: '2026-09-24' }],
    [{ ...sortie, dateFin: '2026-09-27', heure: '10:00' }], [{ ...sortie, lieu: {} }],
    [{ ...sortie, id: 'a' }, { ...sortie, id: 'a' }]]) assert.throws(() => normalizeEvents(data));
});

test('textes non interprétés comme HTML et aucun tiers ajouté par les données', () => {
  const [event] = normalizeEvents([{ ...sortie, description: '<img src=x onerror=alert(1)>', url: 'https://example.invalid' }]);
  assert.equal(event.extendedProps.description, '<img src=x onerror=alert(1)>');
  assert.equal(event.url, undefined);
  const js = readFileSync(new URL('../site/agenda.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|localStorage|sessionStorage|clipboard/);
  assert.match(js, /description\.textContent = event\.extendedProps\.description/);
});

test('plage horaire explicitement annoncée et fins invalides refusées', () => {
  const [event] = normalizeEvents([{ ...sortie, heure: '10:00', heureFin: '12:00' }]);
  assert.equal(event.end, '2026-09-25T12:00:00');
  assert.match(eventDateLabel(event), /10 h 00 à 12 h 00/);
  for (const item of [{ ...sortie, heureFin: '12:00' }, { ...sortie, heure: '12:00', heureFin: '10:00' },
    { ...sortie, heure: '12:00', heureFin: '12:00' }, { ...sortie, heure: '10:00', heureFin: '24:00' }]) {
    assert.throws(() => normalizeEvents([item]));
  }
});

test('archives décroissantes, sans mêler passé, présent et futur', () => {
  const events = normalizeEvents([{ ...sortie, date: '2026-01-01' }, sortie,
    { ...sortie, date: '2026-02-01' }, { ...sortie, date: '2027-01-01' }]);
  const history = pastEvents(events, '2026-09-25');
  assert.deepEqual(history.map(e => e.start), ['2026-02-01', '2026-01-01']);
  assert.equal(upcomingEvent(events, '2026-09-25').start, '2026-09-25');
  assert.equal(events[0].start, '2026-01-01', 'Le tri des archives ne modifie pas la liste');
  assert.equal(upcomingEvent(history, '2026-09-25'), null);
  assert.deepEqual(pastEvents([], '2026-09-25'), []);
});

test('dates à venir : ordre chronologique, période en cours et liste vide', () => {
  const events = normalizeEvents([{ ...sortie, date: '2027-01-01' },
    { ...sortie, date: '2026-09-24', dateFin: '2026-09-26' }, { ...sortie, date: '2026-08-01' }, sortie]);
  assert.deepEqual(upcomingEvents(events, '2026-09-25').map(e => e.start), ['2026-09-24', '2026-09-25', '2027-01-01']);
  assert.deepEqual(upcomingEvents([], '2026-09-25'), []);
  assert.equal(events.length, 4);
});

test('fiction explicitement signalée dans le calendrier et conservée dans les détails', () => {
  const [demo] = normalizeEvents([{ ...sortie, exemple: true }]);
  assert.equal(demo.title, 'Exemple fictif : Rendez-vous test');
  assert.equal(demo.extendedProps.titre, sortie.titre);
  assert.equal(demo.extendedProps.exemple, true);
  assert.equal(normalizeEvents([sortie])[0].extendedProps.exemple, false);
  for (const exemple of ['oui', 'false', 1, null]) assert.throws(() => normalizeEvents([{ ...sortie, exemple }]));
});

test('FullCalendar local, version épinglée, licences et empreintes conservées', () => {
  const base = new URL('../site/vendor/fullcalendar/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));
  for (const file of manifest) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(file.file, base))).digest('hex'), file.sha256);
    if (file.package !== 'preact') assert.equal(file.version, '6.1.21');
    assert.ok(file.source.startsWith('https://registry.npmjs.org/'));
  }
  assert.match(readFileSync(new URL('LICENSE.md', base), 'utf8'), /MIT License/);
  assert.match(readFileSync(new URL('LICENSE-preact.txt', base), 'utf8'), /MIT License/);
});

// Contrat des hooks FullCalendar, sans navigateur ni dépendance DOM supplémentaire.
async function selectionHarness(reducedMotion = false) {
  const cards = [], eventNodes = [], days = [], scrolls = [];
  let focused = null, calendar;
  function element(tag = 'DIV', dataset = {}) {
    const attributes = new Map(), classes = new Set();
    return {
      dataset, textContent: '', hidden: false, listeners: {},
      classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute: (name, value) => attributes.set(name, String(value)),
      getAttribute: name => attributes.get(name) ?? null,
      removeAttribute: name => attributes.delete(name),
      matches: selector => selector === 'a' && tag === 'A',
      querySelector(selector) { return selector === '.fc-list-event-title a' ? this.control : null; },
      querySelectorAll: () => [],
      addEventListener(type, handler) { this.listeners[type] = handler; },
      focus(options) { assert.equal(options.preventScroll, true); focused = this; },
      scrollIntoView(options) { scrolls.push({ target: this, ...options }); },
    };
  }
  const nodes = Object.fromEntries(['main', '#calendar', '#calendar-region', '#calendar-fallback', '#calendar-tools', '#calendar-month',
    '#event-detail', '#event-label', '#event-title', '#event-date', '#event-location', '#event-description', '#event-source',
    '#agenda-archives', '#agenda-upcoming', '#agenda-demo-notice', '#calendar-legend', '#month-prev', '#month-next', '#month-today']
    .map(id => [id, element()]));
  const views = ['dayGridMonth', 'listMonth'].map(calendarView => element('BUTTON', { calendarView }));
  nodes.main.querySelectorAll = () => cards;
  nodes['#calendar'].querySelectorAll = selector => selector === '[data-event-id]' ? eventNodes : days;
  const document = { readyState: 'complete', querySelector: id => nodes[id], querySelectorAll: () => views };
  function mountEvent(event, list = false) {
    const el = element(list ? 'TR' : 'A');
    if (list) el.control = element('A');
    calendar.options.eventDidMount({ el, event });
    eventNodes.push(el);
    return el;
  }
  function mountDay(date, list = false) {
    const el = element(list ? 'TR' : 'TD', { date });
    calendar.options[list ? 'dayHeaderDidMount' : 'dayCellDidMount']({ el, view: calendar.view });
    days.push(el);
    return el;
  }
  class Calendar {
    constructor(root, options) {
      calendar = this;
      this.options = options;
      this.view = { type: 'dayGridMonth', title: 'Septembre 2026', currentStart: new Date('2026-09-01T00:00:00Z') };
    }
    render() { this.options.datesSet({ view: this.view }); }
    gotoDate(date) { this.view.currentStart = new Date(`${date.slice(0, 7)}-01T00:00:00Z`); this.render(); }
    changeView(type) { this.view.type = type; this.render(); }
    addEventSource(events) { this.events = events; events.forEach(event => mountEvent(event)); }
  }
  const data = [
    { ...sortie, id: 'archive', date: '2026-08-31' },
    { ...sortie, id: 'range"[]<>', titre: '<b>Période</b>', date: '2026-09-30', dateFin: '2026-10-02', exemple: true,
      source: { url: 'https://example.org/date', libelle: 'Annonce' } },
    { ...sortie, id: 'same-day', titre: 'Même jour', date: '2026-09-30' },
  ];
  const code = readFileSync(new URL('../site/agenda.js', import.meta.url), 'utf8')
    .replace(/^import .+;\n/gm, '').replace(/^export /gm, '').replace('import.meta.url', JSON.stringify('https://example.org/agenda.js'));
  runInNewContext(code, {
    document, window: { FullCalendar: { Calendar } }, FullCalendar: { Calendar }, URL, AbortController,
    matchMedia: () => ({ matches: reducedMotion }), fetch: async () => ({ ok: true, json: async () => data }),
    normalizeEvents, todayInParis: () => '2026-09-25', upcomingEvent, upcomingEvents, pastEvents, eventDateLabel, showSource,
    renderEventCarousel(section, events, onSelect) {
      section.hidden = !events.length;
      for (const event of events) {
        const card = element('BUTTON', { eventId: event.id });
        card.activate = () => onSelect(event);
        cards.push(card);
      }
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.main.dataset.agendaState, 'ready');
  return { nodes, cards, eventNodes, days, scrolls, calendar, mountEvent, mountDay, get focused() { return focused; } };
}

test('sélection : une carte cadre le calendrier, sans envoyer le focus aux détails', async () => {
  const h = await selectionHarness(true);
  h.cards.find(card => card.dataset.eventId === 'archive').activate();
  assert.equal(h.focused, h.nodes['#calendar-region']);
  assert.equal(h.scrolls.length, 1);
  assert.equal(h.scrolls[0].target, h.nodes['#calendar-region']);
  assert.equal(h.scrolls[0].block, 'start');
  assert.equal(h.scrolls[0].behavior, 'instant');
  assert.equal(h.nodes['#calendar'].dataset.month, '2026-08');
  assert.equal(h.nodes['#event-detail'].dataset.eventId, 'archive');
  assert.equal(h.nodes['#event-label'].textContent, 'NOS DERNIÈRES SORTIES');
  assert.deepEqual(h.cards.filter(card => card.getAttribute('aria-pressed') === 'true').map(card => card.dataset.eventId), ['archive']);
});

test('sélection : identité exacte, texte sûr et période inclusive entre deux mois', async () => {
  const h = await selectionHarness();
  const dates = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
  dates.forEach(date => h.mountDay(date));
  h.cards.find(card => card.dataset.eventId === 'range"[]<>').activate();
  assert.equal(h.nodes['#event-title'].textContent, '<b>Période</b>');
  assert.equal(h.nodes['#event-label'].textContent, 'EXEMPLE FICTIF');
  assert.equal(h.nodes['#event-source'].getAttribute('aria-label'), 'Annonce, nouvel onglet');
  assert.deepEqual(h.days.filter(day => day.classList.contains('agenda-day-selected')).map(day => day.dataset.date), dates.slice(1, 4));
  assert.deepEqual(h.eventNodes.filter(el => el.classList.contains('agenda-event-selected')).map(el => el.dataset.eventId), ['range"[]<>']);
  assert.equal(h.eventNodes.find(el => el.dataset.eventId === 'same-day').getAttribute('aria-pressed'), 'false');
  assert.equal(h.scrolls[0].behavior, 'smooth');
});

test('sélection : mois, vue et remontage conservent l’état sans déplacer le focus', async () => {
  const h = await selectionHarness();
  h.cards.find(card => card.dataset.eventId === 'range"[]<>').activate();
  h.calendar.gotoDate('2026-10-01');
  h.calendar.changeView('listMonth');
  const selected = h.mountEvent(h.calendar.events.find(event => event.id === 'range"[]<>'), true);
  const sibling = h.mountEvent(h.calendar.events.find(event => event.id === 'same-day'), true);
  const day = h.mountDay('2026-10-02', true);
  assert.equal(h.nodes['#calendar'].dataset.selectedEventId, 'range"[]<>');
  assert.equal(h.nodes['#calendar'].dataset.view, 'listMonth');
  assert.equal(selected.getAttribute('role'), null, 'La ligne conserve sa sémantique de tableau');
  assert.equal(selected.control.getAttribute('role'), 'button');
  assert.equal(selected.control.getAttribute('aria-pressed'), 'true');
  assert.equal(sibling.control.getAttribute('aria-pressed'), 'false');
  assert.equal(day.classList.contains('agenda-day-selected'), true);
  h.calendar.gotoDate('2027-01-01');
  assert.equal(h.mountDay('2027-01-01', true).classList.contains('agenda-day-selected'), false);
  h.calendar.gotoDate('2026-09-01');
  h.calendar.changeView('dayGridMonth');
  assert.equal(h.mountDay('2026-09-30').classList.contains('agenda-day-selected'), true);
  assert.equal(h.focused, h.nodes['#calendar-region']);
  assert.equal(h.scrolls.length, 1);
});

test('sélection : activer un événement du calendrier ouvre ses détails et désélectionne les autres', async () => {
  const h = await selectionHarness();
  const firstDay = h.mountDay('2026-09-30'), lastDay = h.mountDay('2026-10-02');
  let prevented = false;
  h.calendar.options.eventClick({ event: h.calendar.events.find(event => event.id === 'same-day'), jsEvent: { preventDefault() { prevented = true; } } });
  assert.ok(prevented);
  assert.equal(h.focused, h.nodes['#event-detail']);
  assert.equal(h.scrolls[0].block, 'nearest');
  assert.equal(h.nodes['#calendar'].dataset.selectedEventId, 'same-day');
  assert.equal(firstDay.classList.contains('agenda-day-selected'), true);
  assert.equal(lastDay.classList.contains('agenda-day-selected'), false);
  assert.deepEqual(h.cards.filter(card => card.getAttribute('aria-pressed') === 'true').map(card => card.dataset.eventId), ['same-day']);
  assert.deepEqual(h.eventNodes.filter(el => el.classList.contains('agenda-event-selected')).map(el => el.dataset.eventId), ['same-day']);
});

test('sélection : région nommée et focusable, cartes à état explicite, palette sans rouge', () => {
  const read = name => readFileSync(new URL(`../site/${name}`, import.meta.url), 'utf8');
  assert.match(read('agenda.html'), /id="calendar-region" tabindex="-1" aria-label="Calendrier des sorties"/);
  assert.match(read('agenda-carousel.js'), /setAttribute\('aria-pressed', 'false'\)/);
  assert.match(read('agenda-carousel.js'), /setAttribute\('aria-controls', 'calendar-region'\)/);
  assert.doesNotMatch(read('agenda.css'), /var\(--red\)/);
});
