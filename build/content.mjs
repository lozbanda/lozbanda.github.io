// Lecture éditoriale à la génération seulement. Rien de ce module n’est publié.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import MarkdownIt from 'markdown-it';
import { imageSize } from 'image-size';
import { normalizeEvents, eventDateLabel } from '../src/agenda-data.js';
import { normalizeGallery } from '../src/gallery-data.js';
import { normalizeSource } from '../src/content-data.js';

export const PHOTO_SIZES = '(max-width: 700px) calc(100vw - 24px), (max-width: 1000px) calc(100vw - 48px), (max-width: 1488px) calc((100vw - 72px) / 2), 708px';
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
const eventFields = { Identifiant: 'id', Date: 'date', 'Dernier jour': 'dateFin', Début: 'heure', Fin: 'heureFin', Lieu: 'lieu', Source: 'source', Exemple: 'exemple' };
const photoFields = { Image: 'image', Miniature: 'miniature', Variantes: 'srcset', Alternative: 'alt', Source: 'source' };
const infoFields = { Bouton: 'button' };
const musicianFields = { Instrument: 'instrument', Photo: 'image', Alternative: 'alt', Exemple: 'exemple' };

function fail(context, message, token) {
  const line = token?.map ? token.map[0] + 1 : context.line;
  throw new Error(`${context.file}:${line} — ${context.title || 'document'} : ${message}`);
}

function text(tokens, context) {
  return (tokens || []).map(token => {
    if (token.type === 'text' || token.type === 'code_inline') return token.content;
    if (['softbreak', 'hardbreak'].includes(token.type)) return '\n';
    if (['em_open', 'em_close', 'strong_open', 'strong_close', 's_open', 's_close'].includes(token.type)) return '';
    fail(context, 'texte simple attendu ici ; réservez les liens aux champs Source, Licence ou Bouton.');
  }).join('').trim();
}

// H1 et préambule : guide d’édition non publié. H2 : une entrée. Les sections
// sont détectées dans l’arbre Markdown, jamais par une regex sur des blocs de code.
export function sections(source, file) {
  const tokens = md.parse(source.replace(/^\uFEFF/, ''), {});
  const root = { file, line: 1 };
  if (tokens[0]?.type !== 'heading_open' || tokens[0].tag !== 'h1') {
    fail(root, 'commencez par un titre « # … ».');
  }
  const result = [];
  let section;
  for (let i = 3; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && token.tag === 'h1') fail(root, 'un seul titre de niveau 1 est autorisé.', token);
    if (token.type === 'heading_open' && token.tag === 'h2' && token.level === 0) {
      section = { file, line: token.map[0] + 1, title: text(tokens[i + 1].children, root), tokens: [] };
      if (!section.title) fail(section, 'titre vide.');
      result.push(section);
      i += 2;
    } else if (section) {
      section.tokens.push(token);
    } else if (!['paragraph_open', 'inline', 'paragraph_close'].includes(token.type)) {
      fail(root, 'avant la première entrée, seuls le titre et un court texte d’aide sont admis.', token);
    }
  }
  return result;
}

function safeLink(url, context) {
  if (/[\u0000-\u0020\u007f]/.test(url)) fail(context, 'lien contenant des espaces ou caractères de contrôle.');
  if (/^https:\/\//.test(url)) {
    try { return normalizeSource({ url, libelle: 'Lien' }).url; } catch (error) { fail(context, error.message); }
  }
  if (/^mailto:[^\s?@]+@[^\s?@]+(?:\?[^\s]*)?$/.test(url)) return url;
  if (/^(?:(?:index|agenda|galerie|musiciens|infos-pratiques)\.html)?#[a-zA-Z][\w-]*$/.test(url)
      || /^(?:index|agenda|galerie|musiciens|infos-pratiques)\.html$/.test(url)) return url;
  fail(context, 'lien autorisé : HTTPS, adresse mailto ou lien vers une page du site.');
}

function linkField(tokens, context, key) {
  const open = tokens.findIndex(token => token.type === 'link_open');
  const close = tokens.findIndex(token => token.type === 'link_close');
  if (open < 0 || close <= open || tokens.slice(close + 1).some(t => t.content.trim())
      || tokens.slice(open + 1, close).some(t => t.type === 'link_open')) {
    fail(context, `${key} doit être un lien Markdown : [Libellé](https://…).`);
  }
  const prefix = tokens.slice(0, open).map(t => t.content).join('');
  if (prefix.trim() !== `${key} :` && prefix.trim() !== `${key}:`) fail(context, `un seul lien attendu pour ${key}.`);
  const libelle = text(tokens.slice(open + 1, close), context);
  if (!libelle) fail(context, `${key} : libellé vide.`);
  const url = tokens[open].attrGet('href');
  try {
    return key !== 'Bouton' ? normalizeSource({ url, libelle }) : { url: safeLink(url, context), libelle };
  } catch (error) {
    if (error.message.startsWith(`${context.file}:`)) throw error;
    fail(context, error.message);
  }
}

export function fields(section, allowed, required = true) {
  const tokens = section.tokens;
  if (tokens[0]?.type !== 'bullet_list_open') {
    if (required) fail(section, 'une liste de champs « - Date : … » ou « - Image : … » doit suivre le titre.');
    return { values: {}, body: tokens };
  }
  // Dans les infos, une liste ordinaire peut commencer le texte d’une carte.
  const first = tokens.find(t => t.type === 'inline');
  if (!required && !/^Bouton\s*:/.test(first?.content || '')) return { values: {}, body: tokens };
  const end = tokens.findIndex(t => t.type === 'bullet_list_close' && t.level === 0);
  const list = tokens.slice(1, end);
  const values = {};
  for (let i = 0; i < list.length;) {
    if (list[i]?.type !== 'list_item_open' || list[i + 1]?.type !== 'paragraph_open'
        || list[i + 2]?.type !== 'inline' || list[i + 3]?.type !== 'paragraph_close'
        || list[i + 4]?.type !== 'list_item_close') {
      fail(section, 'un champ par puce, sans sous-liste ni second paragraphe.', list[i]);
    }
    const inline = list[i + 2];
    const match = inline.content.match(/^([^:]+)\s*:\s*([\s\S]*)$/);
    const key = match?.[1].trim();
    if (!Object.hasOwn(allowed, key)) fail(section, `champ inconnu « ${key || inline.content} ». Champs possibles : ${Object.keys(allowed).join(', ')}.`, inline);
    const name = allowed[key];
    if (Object.hasOwn(values, name)) fail(section, `champ « ${key} » répété.`, inline);
    const value = ['Source', 'Licence', 'Bouton'].includes(key) ? linkField(inline.children, section, key)
      : text(md.parseInline(match[2], {})[0].children, section);
    if (!value) fail(section, `champ « ${key} » vide : supprimez la ligne s’il n’est pas renseigné.`, inline);
    values[name] = value;
    i += 5;
  }
  return { values, body: tokens.slice(end + 1) };
}

export function description(tokens, context) {
  const paragraphs = [];
  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i]?.type !== 'paragraph_open' || tokens[i + 1]?.type !== 'inline' || tokens[i + 2]?.type !== 'paragraph_close') {
      fail(context, 'la description attend des paragraphes de texte, sans image ni sous-titre.', tokens[i]);
    }
    paragraphs.push(text(tokens[i + 1].children, context).replace(/\s*\n\s*/g, ' '));
  }
  return paragraphs.join('\n\n');
}

export function parseEvents(source, file = 'contenu/agenda.md') {
  const ids = new Set();
  return sections(source, file).map(section => {
    const { values, body } = fields(section, eventFields);
    if (values.exemple !== undefined) {
      if (!['oui', 'non'].includes(values.exemple)) fail(section, 'Exemple attend « oui » ou « non ».');
      values.exemple = values.exemple === 'oui';
    }
    const event = { ...values, titre: section.title, description: description(body, section) };
    // Identifiant optionnel, mais stable lorsque le fichier est réordonné.
    event.id ||= `${event.date}-${slug(event.titre)}${event.heure ? '-' + event.heure.replace(':', '') : ''}`;
    if (ids.has(event.id)) fail(section, `identifiant « ${event.id} » dupliqué.`);
    ids.add(event.id);
    try { normalizeEvents([event]); } catch (error) { fail(section, error.message); }
    return event;
  });
}

function slug(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parsePhotos(source, file = 'contenu/galerie.md') {
  const images = new Set();
  const entries = sections(source, file);
  return entries.map(section => {
    const { values, body } = fields(section, photoFields);
    const photo = { ...values, titre: section.title, description: description(body, section) };
    if (images.has(photo.image)) fail(section, `image « ${photo.image} » répétée.`);
    images.add(photo.image);
    try { normalizeGallery([photo]); } catch (error) { fail(section, error.message); }
    return photo;
  });
}

export function parseInfos(source, file = 'contenu/infos-pratiques.md') {
  const entries = sections(source, file);
  if (!entries.length) fail({ file, line: 1 }, 'au moins une carte est nécessaire.');
  return entries.map((section, index) => {
    const { values, body } = fields(section, infoFields, false);
    if (!body.length) fail(section, 'texte de carte vide.');
    for (const token of body) {
      if (['fence', 'code_block', 'table_open'].includes(token.type)) fail(section, 'code et tableaux ne sont pas prévus dans les cartes.', token);
      for (const inline of token.children || []) {
        if (inline.type === 'image') fail(section, 'les cartes ne contiennent pas d’images.', token);
        if (inline.type === 'link_open') {
          const url = safeLink(inline.attrGet('href'), section);
          inline.attrSet('href', url);
          if (url.startsWith('https:')) {
            inline.attrSet('target', '_blank');
            inline.attrSet('rel', 'noopener noreferrer');
          }
        }
      }
    }
    return { id: `info-${index + 1}`, titre: section.title, html: md.renderer.render(body, md.options, {}), ...values };
  });
}

export function parseMusicians(source, file = 'contenu/musiciens.md') {
  return sections(source, file).map((section, index) => {
    const { values, body } = fields(section, musicianFields);
    if (!values.instrument) fail(section, 'Instrument est obligatoire.');
    if (values.image && !/^assets\/musiciens\/[a-z0-9][a-z0-9_-]*\.(?:webp|jpe?g|png|avif)$/i.test(values.image)) {
      fail(section, 'Photo attend une image locale WebP, JPEG, PNG ou AVIF dans assets/musiciens/ (nom sans espaces).');
    }
    if (values.alt && !values.image) fail(section, 'Alternative nécessite une Photo.');
    if (values.exemple !== undefined && !['oui', 'non'].includes(values.exemple)) fail(section, 'Exemple attend « oui » ou « non ».');
    const story = description(body, section);
    if (!story) fail(section, 'racontez le choix de l’instrument dans un paragraphe après les champs.');
    return { id: `musicien-${index + 1}`, nom: section.title, instrument: values.instrument,
      image: values.image || '', alt: values.image ? values.alt || `Portrait de ${section.title}` : '',
      description: story, exemple: values.exemple === 'oui' };
  });
}

export function loadContent(root = process.cwd()) {
  const read = name => readFileSync(resolve(root, 'contenu', name), 'utf8');
  const events = parseEvents(read('agenda.md'));
  const photoText = read('galerie.md');
  const photos = parsePhotos(photoText);
  const photoSections = sections(photoText, 'contenu/galerie.md');
  const infos = parseInfos(read('infos-pratiques.md'));
  const musicianText = read('musiciens.md');
  const musicianSections = sections(musicianText, 'contenu/musiciens.md');
  const assets = realpathSync(resolve(root, 'src/assets')) + sep;
  const cache = new Map();
  function dimensions(path, context) {
    if (cache.has(path)) return cache.get(path);
    let file;
    try { file = realpathSync(resolve(root, 'src', path)); } catch { fail(context, `image absente de src/assets/ : ${path}.`); }
    if (!file.startsWith(assets) || !statSync(file).isFile()) fail(context, 'image hors du dossier autorisé.');
    let size;
    try { size = imageSize(readFileSync(file)); } catch { fail(context, 'format d’image invalide ou illisible.'); }
    if (!size.width || !size.height) fail(context, 'dimensions inconnues.');
    cache.set(path, size);
    return size;
  }
  const gallery = normalizeGallery(photos).map((photo, index) => {
    const context = photoSections[index];
    dimensions(photo.image, context);
    const preview = dimensions(photo.miniature, context);
    const widths = new Set();
    if (photo.srcset) for (const candidate of photo.srcset.split(',')) {
      const [path, width] = candidate.trim().split(/\s+/);
      const pixels = Number(width.slice(0, -1));
      if (dimensions(path, context).width !== pixels || widths.has(pixels)) {
        fail(context, `variante « ${candidate.trim()} » de largeur incorrecte ou répétée.`);
      }
      widths.add(pixels);
    }
    return { ...photo, width: preview.width, height: preview.height };
  });
  const musicians = parseMusicians(musicianText).map((member, index) => {
    if (!member.image) return member;
    const { width, height } = dimensions(member.image, musicianSections[index]);
    return { ...member, width, height };
  });
  const eventList = normalizeEvents(events).slice().reverse().map(event => ({
    titre: event.title, date: event.extendedProps.date, label: eventDateLabel(event),
    lieu: event.extendedProps.lieu, description: event.extendedProps.description,
    source: event.extendedProps.source,
  }));
  return { events, photos, infos, musicians, gallery, eventList,
    hasDemoMusicians: musicians.some(member => member.exemple),
    hasDemoEvents: events.some(event => event.exemple), photoSizes: PHOTO_SIZES };
}
