// Liens de provenance facultatifs, jamais chargés automatiquement.
export function normalizeSource(source) {
  if (source == null) return null;
  if (typeof source.url !== 'string' || typeof source.libelle !== 'string'
      || !source.libelle.trim() || /[\u0000-\u0020\u007f]/.test(source.url)) {
    throw new Error('Source : URL et libellé requis.');
  }
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Source : lien HTTPS public uniquement.');
  }
  return { url: url.href, libelle: source.libelle.trim() };
}

export function showSource(link, source) {
  link.hidden = !source;
  if (source) {
    link.href = source.url;
    link.textContent = `${source.libelle} ↗`;
    link.setAttribute('aria-label', `${source.libelle} — nouvel onglet`);
  } else {
    link.removeAttribute('href');
    link.removeAttribute('aria-label');
    link.textContent = '';
  }
}
