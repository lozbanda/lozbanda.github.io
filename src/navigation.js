// Navigation progressive : le <audio> commun n’est ni retiré ni réinitialisé.
// Les pages HTML restent utilisables directement, sans JS ni réécriture serveur.
export function sitePage(value, base) {
  try {
    const url = new URL(value, base), root = new URL('./', base);
    if (url.origin !== root.origin || url.username || url.password || !url.pathname.startsWith(root.pathname)) return null;
    const path = url.pathname.slice(root.pathname.length);
    return path === '' ? 'index' : ['index.html', 'agenda.html', 'galerie.html', 'musiciens.html', 'infos-pratiques.html'].includes(path) ? path.slice(0, -5) : null;
  } catch { return null; }
}
export function ordinaryClick(event, link) {
  return !!link && !event.defaultPrevented && event.button === 0
    && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
    && !link.hasAttribute('download') && (!link.target || link.target === '_self');
}
// Garder la barre et le lecteur connectés : déplacer un <audio> peut le mettre en pause.
export function updateHeader(current, incoming) {
  const menu = current?.querySelector('.site-nav'), next = incoming?.querySelector('.site-nav');
  if (!menu || !next) throw new Error('Navigation absente');
  current.className = incoming.className;
  current.querySelector('.brand')?.remove();
  const brand = incoming.querySelector('.brand');
  if (brand) current.prepend(brand);
  menu.replaceWith(next);
}
if (typeof document !== 'undefined') initNavigation();

function initNavigation() {
  const base = new URL('./', import.meta.url);
  const notice = document.querySelector('#navigation-status');
  let version = 0, pending, currentURL = location.href, frame;
  const resources = new Map();
  function resource(path, style = false) {
    const url = new URL(path, base).href;
    if (resources.has(url)) return resources.get(url);
    if (style && [...document.querySelectorAll('link[rel="stylesheet"]')].some(el => el.href === url)) return Promise.resolve();
    const promise = new Promise((resolve, reject) => {
      const el = document.createElement(style ? 'link' : 'script');
      if (style) { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = false; }
      const timer = setTimeout(() => { el.remove(); reject(new Error('Ressource trop lente')); }, 15000);
      el.onload = () => { clearTimeout(timer); resolve(); };
      el.onerror = () => { clearTimeout(timer); el.remove(); reject(new Error('Ressource indisponible')); };
      document.head.append(el);
    }).catch(error => { resources.delete(url); throw error; });
    resources.set(url, promise);
    return promise;
  }
  async function prepare(page) {
    if (page === 'agenda') {
      await resource('agenda.css', true);
      // Une panne de calendrier ne doit pas empêcher d’accéder à la page.
      try {
        if (!window.FullCalendar) await resource('vendor/fullcalendar/index.global.min.js');
        if (!window.FullCalendar?.globalLocales.some(locale => locale.code === 'fr')) await resource('vendor/fullcalendar/fr.global.min.js');
      } catch { /* initAgenda affiche son message de repli. */ }
      return (await import('./agenda.js')).initAgenda;
    }
    if (page === 'galerie') return (await import('./gallery.js')).initGallery;
    return () => {};
  }
  function remember() {
    if (currentURL === location.href) history.replaceState({ ...history.state,
      lozbandaScroll: [scrollX, scrollY] }, '', location.href);
  }
  history.scrollRestoration = 'manual';
  addEventListener('scroll', () => {
    cancelAnimationFrame(frame); frame = requestAnimationFrame(remember);
  }, { passive: true });

  async function navigate(url, pop = false, scroll = [0, 0]) {
    const page = sitePage(url, base);
    if (!page) { location.assign(url); return; }
    const request = ++version;
    pending?.abort(); pending = new AbortController();
    const controller = pending;
    const timeout = setTimeout(() => controller.abort(), 15000);
    document.querySelector('main').setAttribute('aria-busy', 'true');
    notice.textContent = 'Chargement de la page…';
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')
          || sitePage(response.url, base) !== page) throw new Error('Page indisponible');
      const incoming = new DOMParser().parseFromString(await response.text(), 'text/html');
      const main = incoming.querySelector('main#contenu'), header = incoming.querySelector('.site-header');
      if (!main || !header?.querySelector('.site-nav') || incoming.body.dataset.page !== page) throw new Error('Page invalide');
      // Aucun script provenant du HTML récupéré n’est exécuté.
      for (const script of incoming.querySelectorAll('script')) script.remove();
      const activate = await prepare(page);
      if (request !== version) return;
      if (controller.signal.aborted) throw new Error('Navigation trop lente');
      if (!pop) {
        remember();
        history.pushState({ lozbandaScroll: [0, 0] }, '', url);
      }
      const previous = document.querySelector('main');
      previous.disposePage?.();
      updateHeader(document.querySelector('.site-header'), header);
      previous.replaceWith(main);
      document.body.dataset.page = page;
      document.title = incoming.title;
      for (const meta of incoming.querySelectorAll('meta[name="description"], meta[property^="og:"]')) {
        const selector = meta.hasAttribute('name') ? 'meta[name="description"]' : `meta[property="${meta.getAttribute('property')}"]`;
        const old = document.head.querySelector(selector);
        if (old) old.replaceWith(meta);
      }
      currentURL = url.href;
      activate();
      main.focus({ preventScroll: true });
      const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) target.scrollIntoView({ behavior: 'instant' });
      else window.scrollTo({ left: scroll[0], top: scroll[1], behavior: 'instant' });
      notice.textContent = document.title;
      document.dispatchEvent(new CustomEvent('site:navigated', { detail: { page } }));
    } catch {
      if (request === version) location.assign(url.href); // vrais liens en secours
    } finally {
      clearTimeout(timeout);
      if (request === version) document.querySelector('main')?.removeAttribute('aria-busy');
    }
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!ordinaryClick(event, link)) return;
    const url = new URL(link.href);
    if (!sitePage(url, base)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    event.preventDefault();
    if (url.href === currentURL && url.href === location.href) {
      ++version; pending?.abort();
      document.querySelector('main').removeAttribute('aria-busy'); notice.textContent = '';
      return;
    }
    navigate(url);
  });
  addEventListener('hashchange', () => {
    if (new URL(currentURL).pathname === location.pathname) currentURL = location.href;
  });
  addEventListener('popstate', event => {
    const url = new URL(location.href), previous = new URL(currentURL);
    if (url.pathname === previous.pathname && url.search === previous.search) {
      ++version; pending?.abort();
      document.querySelector('main')?.removeAttribute('aria-busy'); notice.textContent = '';
      currentURL = url.href;
      const scroll = event.state?.lozbandaScroll || [0, 0];
      const target = url.hash && document.getElementById(url.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });
      else window.scrollTo({ left: scroll[0], top: scroll[1], behavior: 'instant' });
    } else navigate(url, true, event.state?.lozbandaScroll || [0, 0]);
  });
}
