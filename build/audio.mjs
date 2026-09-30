// Playlist Markdown à la génération ; aucun téléchargement de média distant.
import { lstatSync, readFileSync, realpathSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { sections, fields, description } from './content.mjs';

const formats = new Map([['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.wave', 'audio/wav']]);
const controls = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const allowed = { Fichier: 'file', Crédit: 'author', Source: 'source', Licence: 'license', Démonstration: 'demo', Empreinte: 'sha256' };
const editorial = 'contenu/musique.md';
const fail = message => { throw new Error(message); };
function text(value, label, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || controls.test(value)) {
    fail(`${label} : texte simple non vide attendu (maximum ${max} caractères).`);
  }
  return value.trim();
}
function https(source, label) {
  const url = text(source.url, label, 2048);
  if (/[\s<>"\\]/u.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url)) fail(`${label} : lien HTTPS invalide.`);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail(`${label} : lien HTTPS public attendu.`);
  return parsed.href;
}
function filename(path) {
  if (!path.startsWith('assets/audio/')) fail('Fichier doit commencer par assets/audio/.');
  const file = path.slice('assets/audio/'.length);
  if (!file || file.startsWith('.') || /[/\\]/u.test(file) || controls.test(file)
      || !formats.has(extname(file).toLowerCase())) fail('Fichier audio invalide : MP3/WAV local, sans sous-dossier.');
  try { encodeURIComponent(file); } catch { fail('Nom de fichier non Unicode.'); }
  return file;
}
export function parseMusic(source, file = editorial) {
  const used = new Set();
  return sections(source, file).map(section => {
    try {
      const { values, body } = fields(section, allowed);
      const title = text(section.title, 'Titre');
      if (!values.file) fail('Fichier est obligatoire : indiquez un MP3/WAV dans assets/audio/.');
      const name = filename(values.file);
      const url = values.source ? https(values.source, 'Source') : '';
      if (used.has(name)) fail(`Fichier répété : ${name}.`);
      used.add(name);
      const author = values.author ? text(values.author, 'Crédit') : '';
      const license = values.license ? { name: text(values.license.libelle, 'Licence'), url: https(values.license, 'Licence') } : null;
      const changes = description(body, section);
      if (values.demo && !['oui', 'non'].includes(values.demo)) fail('Démonstration attend « oui » ou « non ».');
      const demo = values.demo === 'oui';
      if (demo && (!author || !url || !license || !changes)) fail('Une démonstration attend Crédit, Source, Licence et une description des modifications.');
      if (values.sha256 && !/^[a-f0-9]{64}$/.test(values.sha256)) fail('Empreinte SHA-256 : 64 caractères hexadécimaux minuscules.');
      return { title, file: name, source: url, sourceLabel: values.source ? text(values.source.libelle, 'Libellé Source') : '', author,
        license, changes, demo, sha256: values.sha256 || '', context: `${file}:${section.line} : ${title}` };
    } catch (error) {
      if (error.message.startsWith(`${file}:`)) throw error;
      throw new Error(`${file}:${section.line} : ${section.title} : ${error.message}`);
    }
  });
}
function realFile(root, parts, directory = false) {
  let path = root;
  for (const [i, part] of parts.entries()) {
    path = join(path, part);
    let info;
    try { info = lstatSync(path); } catch { fail(`Fichier ou dossier absent : ${parts.join('/')}.`); }
    const isDirectory = i < parts.length - 1 || directory;
    if (info.isSymbolicLink() || (isDirectory ? !info.isDirectory() : !info.isFile())) {
      fail(`${parts.join('/')} : fichier/dossier réel attendu, sans lien symbolique.`);
    }
  }
  return path;
}
// Signature légère, pas un décodeur ; aucun ffmpeg ni réseau requis au build.
function checkSignature(path, extension) {
  const bytes = Buffer.alloc(12), fd = openSync(path, 'r');
  let length;
  try { length = readSync(fd, bytes, 0, bytes.length, 0); } finally { closeSync(fd); }
  const wave = ['RIFF', 'RF64'].includes(bytes.toString('ascii', 0, 4)) && bytes.toString('ascii', 8, 12) === 'WAVE';
  const mp3 = bytes.toString('ascii', 0, 3) === 'ID3'
    || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) === 0x02
      && (bytes[1] & 0x18) !== 0x08 && (bytes[2] & 0xf0) !== 0xf0 && (bytes[2] & 0x0c) !== 0x0c);
  if (length < 12 || !(extension === '.mp3' ? mp3 : wave)) fail(`Signature ${extension} invalide.`);
}
export function loadMusic(root = process.cwd()) {
  root = realpathSync(resolve(root));
  const path = realFile(root, ['contenu', 'musique.md']);
  if (lstatSync(path).size > 65536) fail(`${editorial} : taille maximale 64 Kio.`);
  const entries = parseMusic(readFileSync(path, 'utf8'));
  const tracks = [];
  for (const entry of entries) {
    const { context, sha256, ...track } = entry;
    try {
      const file = realFile(root, ['src', 'assets', 'audio', track.file]);
      const extension = extname(track.file).toLowerCase();
      checkSignature(file, extension);
      if (sha256 && createHash('sha256').update(readFileSync(file)).digest('hex') !== sha256) fail('SHA-256 différent des crédits ; vérifier fichier et attribution.');
      tracks.push({ ...track, src: `assets/audio/${encodeURIComponent(track.file)}`, type: formats.get(extension) });
    } catch (error) { throw new Error(`${context} : ${error.message}`); }
  }
  return { tracks, hasDemos: tracks.some(track => track.demo) };
}
