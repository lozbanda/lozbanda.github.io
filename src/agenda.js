import { normalizeEvents, todayInParis, upcomingEvent, upcomingEvents, pastEvents, eventDateLabel } from './agenda-data.js';
import { renderEventCarousel } from './agenda-carousel.js';
import { showSource } from './content-data.js';

export function initAgenda() {
  const main = document.querySelector('main');
  const root = document.querySelector('#calendar');
  if (!root || main.disposePage) return;
  const controller = new AbortController();
  const cleanups = [];
  let disposed = false;
  const region = document.querySelector('#calendar-region');
  const fallback = document.querySelector('#calendar-fallback');
  const tools = document.querySelector('#calendar-tools');
  const month = document.querySelector('#calendar-month');
  const detail = document.querySelector('#event-detail');
  const label = document.querySelector('#event-label');
  const title = document.querySelector('#event-title');
  const date = document.querySelector('#event-date');
  const location = document.querySelector('#event-location');
  const description = document.querySelector('#event-description');
  const source = document.querySelector('#event-source');
  const archives = document.querySelector('#agenda-archives');
  const future = document.querySelector('#agenda-upcoming');
  const demoNotice = document.querySelector('#agenda-demo-notice');
  const today = todayInParis();
  const views = [...document.querySelectorAll('[data-calendar-view]')];
  let selectedEvent = null;
  if (!window.FullCalendar?.Calendar) {
    fallback.textContent = 'Le calendrier ne peut pas être affiché. Écrivez-nous pour connaître les prochaines dates.';
    main.dataset.agendaState = 'unavailable';
    return;
  }

  function markDay(el) {
    const day = el.dataset.date;
    el.classList.toggle('agenda-day-selected', Boolean(selectedEvent
      && day >= selectedEvent.extendedProps.date && day <= selectedEvent.extendedProps.dateFin));
  }

  function eventControl(el) {
    return el.matches('a') ? el : el.querySelector('.fc-list-event-title a');
  }

  function markEvent(el) {
    const selected = el.dataset.eventId === selectedEvent?.id;
    el.classList.toggle('agenda-event-selected', selected);
    eventControl(el)?.setAttribute('aria-pressed', String(selected));
  }

  function syncSelection() {
    root.dataset.selectedEventId = selectedEvent?.id ?? '';
    for (const card of main.querySelectorAll('.event-card')) card.setAttribute('aria-pressed', String(card.dataset.eventId === selectedEvent?.id));
    for (const el of root.querySelectorAll('[data-event-id]')) markEvent(el);
    for (const el of root.querySelectorAll('.fc-daygrid-day, .fc-list-day')) markDay(el);
  }

  function showDetails(event, fromClick = false) {
    const past = event.extendedProps.dateFin < today;
    label.textContent = event.extendedProps.exemple ? 'EXEMPLE FICTIF' : past ? 'NOS DERNIÈRES SORTIES' : fromClick ? 'LE RENDEZ-VOUS' : 'PROCHAIN RENDEZ-VOUS';
    detail.dataset.temporalState = past ? 'past' : 'upcoming';
    detail.dataset.example = String(event.extendedProps.exemple);
    title.textContent = event.extendedProps.titre;
    date.textContent = eventDateLabel(event);
    date.hidden = false;
    location.textContent = event.extendedProps.lieu;
    location.hidden = false;
    description.textContent = event.extendedProps.description;
    description.hidden = !description.textContent;
    showSource(source, event.extendedProps.source);
    if (event.extendedProps.source) source.setAttribute('aria-label', `${event.extendedProps.source.libelle}, nouvel onglet`);
    detail.dataset.eventId = event.id;
  }

  function selectEvent(event, target = null) {
    selectedEvent = event;
    if (target === region) calendar.gotoDate(event.extendedProps.date);
    showDetails(event, Boolean(target));
    syncSelection();
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: target === region ? 'start' : 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }

  const calendar = new FullCalendar.Calendar(root, {
    locale: 'fr', timeZone: 'UTC', now: today,
    initialView: 'dayGridMonth', headerToolbar: false, height: 'auto', windowResizeDelay: 0,
    firstDay: 1, fixedWeekCount: false, dayMaxEvents: 2,
    editable: false, eventInteractive: true, displayEventEnd: false,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    allDayText: 'Horaire non renseigné',
    defaultRangeSeparator: ' à ', titleRangeSeparator: ' au ',
    noEventsText: 'Pas de sortie annoncée ce mois-ci.',
    buttonHints: { prev: 'Mois précédent', next: 'Mois suivant' },
    views: {
      dayGridMonth: {
        dayHeaderContent(info) {
          const abbr = document.createElement('abbr');
          abbr.title = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(info.date);
          abbr.textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow', timeZone: 'UTC' }).format(info.date);
          return { domNodes: [abbr] };
        },
      },
      // Garder le rendu natif et ses identifiants ARIA dans la liste.
      listMonth: {
        listDayFormat: { weekday: 'long', day: 'numeric', month: 'long' },
        listDaySideFormat: false,
      },
    },
    dayCellDidMount(info) { markDay(info.el); },
    dayHeaderDidMount(info) {
      markDay(info.el);
      // L’ancre sans href n’est pas un lien : nommer l’en-tête de grille à sa place.
      // La liste conserve son aria-labelledby natif et le texte de date complet.
      const link = info.el.querySelector('a[aria-label]:not([href])');
      if (link) {
        if (info.view.type === 'dayGridMonth') info.el.setAttribute('aria-label', link.getAttribute('aria-label'));
        link.removeAttribute('aria-label');
      }
    },
    datesSet(info) {
      month.textContent = info.view.title;
      root.dataset.month = info.view.currentStart.toISOString().slice(0, 7);
      root.dataset.view = info.view.type;
      for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.calendarView === info.view.type));
      syncSelection();
    },
    eventClick(info) {
      info.jsEvent.preventDefault();
      selectEvent(info.event, detail);
    },
    eventDidMount(info) {
      const text = `${info.event.title}, ${eventDateLabel(info.event)}, ${info.event.extendedProps.lieu}`;
      info.el.dataset.eventId = info.event.id;
      const control = eventControl(info.el);
      control?.setAttribute('role', 'button');
      control?.setAttribute('aria-controls', 'event-detail');
      control?.setAttribute('aria-label', text);
      info.el.title = text;
      markEvent(info.el);
    },
  });
  root.hidden = false;
  tools.hidden = false;
  fallback.textContent = 'Chargement des sorties…';
  calendar.render();
  document.querySelector('#calendar-legend').hidden = false;
  document.querySelector('#month-prev').addEventListener('click', () => calendar.prev());
  document.querySelector('#month-next').addEventListener('click', () => calendar.next());
  document.querySelector('#month-today').addEventListener('click', () => calendar.today());
  for (const button of views) button.addEventListener('click', () => calendar.changeView(button.dataset.calendarView));

  main.disposePage = () => {
    disposed = true; controller.abort();
    for (const cleanup of cleanups) cleanup?.();
    calendar.destroy();
  };
  fetch(new URL('./evenements.json', import.meta.url), { cache: 'no-store', signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (disposed) return;
      const events = normalizeEvents(data);
      calendar.addEventSource(events);
      const fromCard = event => selectEvent(event, region);
      cleanups.push(renderEventCarousel(future, upcomingEvents(events, today), fromCard));
      cleanups.push(renderEventCarousel(archives, pastEvents(events, today), fromCard));
      const upcoming = upcomingEvent(events, today);
      if (upcoming) selectEvent(upcoming);
      else {
        description.textContent = 'Les prochaines dates seront annoncées ici. En attendant, retrouvez nos dernières sorties ci-dessus.';
        detail.dataset.temporalState = 'empty';
      }
      demoNotice.hidden = !events.some(event => event.extendedProps.exemple);
      if (!events.length) description.textContent = 'Les prochaines dates seront annoncées ici.';
      // Une liste vide est un état normal : on n'invente aucune prestation.
      fallback.hidden = true;
      main.dataset.agendaState = 'ready';
    })
    .catch(() => {
      if (disposed) return;
      archives.hidden = true;
      future.hidden = true;
      demoNotice.hidden = true;
      root.hidden = true;
      tools.hidden = true;
      document.querySelector('#calendar-legend').hidden = true;
      fallback.textContent = 'Les dates ne sont pas disponibles pour le moment. Contactez la banda pour les connaître.';
      title.textContent = 'Un petit contretemps.';
      description.textContent = 'Vous pouvez toujours nous écrire pour connaître les prochaines sorties.';
      main.dataset.agendaState = 'error';
    });
}

// Les deux scripts différés locaux (bibliothèque puis français) doivent être prêts.
if (document.readyState === 'complete') initAgenda();
else window.addEventListener('DOMContentLoaded', initAgenda, { once: true });
