// Carrousel natif : défilement tactile, boutons et clavier, jamais automatique.
export function renderEventCarousel(section, events, onSelect) {
  const list = section.querySelector('.event-list');
  const controls = section.querySelector('.carousel-controls');
  const previous = section.querySelector('[data-carousel-prev]');
  const next = section.querySelector('[data-carousel-next]');
  const counter = section.querySelector('.carousel-count');
  const format = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const history = section.id === 'agenda-archives';
  section.hidden = !events.length;
  list.replaceChildren(...events.map(event => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `event-card ${history ? 'archive-event' : 'upcoming-event'}`;
    button.dataset.eventId = event.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', 'calendar-region');
    const time = document.createElement('time');
    time.dateTime = event.extendedProps.date;
    time.textContent = format.format(new Date(`${time.dateTime}T12:00:00Z`));
    button.append(time);
    if (event.extendedProps.exemple) {
      const badge = document.createElement('span');
      badge.className = 'event-example';
      badge.textContent = 'Exemple fictif';
      button.append(badge);
    }
    const name = document.createElement('strong');
    name.textContent = event.extendedProps.titre;
    const place = document.createElement('span');
    place.textContent = event.extendedProps.lieu;
    button.append(name, place);
    button.addEventListener('click', () => onSelect(event));
    li.append(button);
    return li;
  }));
  if (!events.length) return;

  const items = [...list.children];
  const buttons = items.map(item => item.firstElementChild);
  const perPage = () => Number(getComputedStyle(list).getPropertyValue('--cards-per-view')) || 1;
  const step = () => items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : list.clientWidth;
  const first = () => Math.max(0, Math.min(items.length - perPage(), Math.round(list.scrollLeft / (step() || 1))));
  function update() {
    const index = first();
    const last = Math.min(items.length, index + perPage());
    const text = items.length <= perPage() ? `${items.length} date${items.length > 1 ? 's' : ''}`
      : `${index + 1}${last > index + 1 ? ' à ' + last : ''} sur ${items.length}`;
    if (counter.textContent !== text) counter.textContent = text;
    previous.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(last === items.length));
    if (items.length <= perPage() && controls.contains(document.activeElement)) buttons[0].focus({ preventScroll: true });
    controls.hidden = items.length <= perPage();
    section.dataset.first = String(index);
    section.dataset.visible = String(Math.min(perPage(), items.length));
  }
  function move(index, smooth = true) {
    const target = Math.max(0, Math.min(items.length - perPage(), index));
    list.scrollTo({ left: target * step(), behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  previous.addEventListener('click', () => { if (previous.getAttribute('aria-disabled') !== 'true') move(first() - perPage()); });
  next.addEventListener('click', () => { if (next.getAttribute('aria-disabled') !== 'true') move(first() + perPage()); });
  list.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target);
    if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: items.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(items.length - 1, target))].focus({ preventScroll: true });
  });
  list.addEventListener('focusin', event => {
    const index = buttons.indexOf(event.target);
    if (index >= 0 && (index < first() || index >= first() + perPage())) move(index, false);
  });
  let frame;
  list.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }, { passive: true });
  const observer = new ResizeObserver(update);
  observer.observe(list);
  update();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
