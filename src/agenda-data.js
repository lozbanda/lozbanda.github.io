import { normalizeSource } from './content-data.js';

// Dates civiles et horaires français : aucune conversion selon le pays du visiteur.
export function validDate(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function nextDay(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function todayInParis(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeEvents(data) {
  if (!Array.isArray(data)) throw new Error('evenements.json doit être un tableau.');
  const ids = new Set();
  const events = data.map((item, index) => {
    if (!item || typeof item.titre !== 'string' || !item.titre.trim() || !validDate(item.date)) {
      throw new Error(`Sortie ${index + 1} : titre ou date invalide.`);
    }
    const heure = item.heure ?? '';
    const heureFin = item.heureFin ?? '';
    const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    const dateFin = item.dateFin ?? item.date;
    if (typeof heure !== 'string' || (heure && !time.test(heure))
        || typeof heureFin !== 'string' || (heureFin && (!heure || !time.test(heureFin) || heureFin <= heure))
        || !validDate(dateFin) || dateFin < item.date || (dateFin !== item.date && heure)) {
      throw new Error(`Sortie ${index + 1} : horaire ou date de fin invalide.`);
    }
    for (const key of ['lieu', 'description']) {
      if (item[key] != null && typeof item[key] !== 'string') throw new Error(`${key} doit être du texte.`);
    }
    if (item.exemple !== undefined && typeof item.exemple !== 'boolean') throw new Error('exemple doit être un booléen.');
    const exemple = item.exemple === true;
    const id = item.id ?? `${item.date}-${index}`;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) throw new Error('Identifiant vide ou dupliqué.');
    ids.add(id);
    return {
      id, title: `${exemple ? 'Exemple fictif : ' : ''}${item.titre.trim()}`,
      start: heure ? `${item.date}T${heure}:00` : item.date,
      allDay: !heure,
      // FullCalendar attend une fin exclusive pour les journées entières.
      ...(!heure ? { end: nextDay(dateFin) } : heureFin ? { end: `${item.date}T${heureFin}:00` } : {}),
      extendedProps: {
        titre: item.titre.trim(), exemple,
        date: item.date, dateFin, heure, heureFin,
        lieu: item.lieu?.trim() || 'Lieu à préciser',
        description: item.description?.trim() || '',
        source: normalizeSource(item.source),
      },
    };
  });
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'fr'));
}

export function upcomingEvent(events, today = todayInParis()) {
  return events.find(event => event.extendedProps.dateFin >= today) ?? null;
}

export function upcomingEvents(events, today = todayInParis()) {
  return events.filter(event => event.extendedProps.dateFin >= today);
}

export function pastEvents(events, today = todayInParis()) {
  return events.filter(event => event.extendedProps.dateFin < today).slice().reverse();
}

export function eventDateLabel(event) {
  const data = event.extendedProps;
  const format = value => new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`));
  if (data.dateFin !== data.date) return `Du ${format(data.date)} au ${format(data.dateFin)}`;
  const time = data.heure ? data.heure.replace(':', ' h ')
    + (data.heureFin ? ` à ${data.heureFin.replace(':', ' h ')}` : '') : 'Horaire non renseigné';
  return `${format(data.date)} · ${time}`;
}
