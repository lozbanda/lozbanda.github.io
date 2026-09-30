import { normalizeGallery, nextIndex } from './gallery-data.js';

// Sans JavaScript ou sans <dialog>, les liens HTML ouvrent les photos entières.
initGallery();

export function initGallery() {
  const dialog = document.querySelector('#gallery-dialog');
  const main = document.querySelector('main');
  if (!dialog || !main || main.disposePage || typeof dialog.showModal !== 'function') return;
  const controller = new AbortController();
  let disposed = false;
  const grid = document.querySelector('.photo-grid');
  const previous = document.querySelector('#gallery-prev');
  const next = document.querySelector('#gallery-next');
  const close = document.querySelector('#gallery-close');
  const title = document.querySelector('#gallery-title');
  const description = document.querySelector('#gallery-description');
  const counter = document.querySelector('#gallery-counter');
  const announcement = document.querySelector('#gallery-announcement');
  const stage = document.querySelector('#gallery-stage');
  const slot = document.querySelector('#gallery-image-slot');
  const status = document.querySelector('#gallery-status');
  const original = document.querySelector('#gallery-original');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Repli immédiatement utilisable si le JSON est absent, invalide ou trop lent.
  let items = normalizeGallery([...main.querySelectorAll('.photo-link')].map(link => {
    const img = link.querySelector('img');
    link.setAttribute('aria-haspopup', 'dialog');
    return {
      titre: link.dataset.title || 'La banda, en images',
      description: link.dataset.description ?? img.alt, alt: img.alt,
      image: link.getAttribute('href'), miniature: img.getAttribute('src'),
      srcset: img.getAttribute('srcset') || '',
    };
  }));
  let viewerItems = [];
  let activeIndex = 0;
  let requestVersion = 0;
  let opener = null;
  let openerHref = '';
  let touch = null;
  let backdropStart = false;

  function makeLink(item, index) {
    const link = document.createElement('a');
    link.className = 'photo-link';
    link.href = item.image;
    link.dataset.photoIndex = index;
    link.setAttribute('aria-label', `Agrandir : ${item.titre}`);
    link.setAttribute('aria-haspopup', 'dialog');
    const img = document.createElement('img');
    img.alt = item.alt;
    img.width = 720;
    img.height = 480;
    img.decoding = 'async';
    if (index === 0) img.fetchPriority = 'high';
    else img.loading = 'lazy';
    img.sizes = '(max-width: 700px) calc(100vw - 24px), (max-width: 1000px) calc(100vw - 48px), (max-width: 1488px) calc((100vw - 72px) / 2), 708px';
    if (item.srcset) img.srcset = item.srcset;
    img.src = item.miniature;
    link.append(img);
    return link;
  }

  function renderGallery() {
    // La page dédiée présente toutes les photos, dans l’ordre du JSON.
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Les photos de la banda arrivent bientôt.';
      grid.replaceChildren(empty);
      return;
    }
    grid.replaceChildren(...items.map((item, index) => {
      const figure = document.createElement('figure');
      figure.append(makeLink(item, index));
      return figure;
    }));
  }

  async function showPhoto(index, direction = 0) {
    activeIndex = index;
    const version = ++requestVersion;
    const item = viewerItems[index];
    title.textContent = item.titre;
    description.textContent = item.description;
    description.hidden = !item.description;
    counter.textContent = `${index + 1} / ${viewerItems.length}`;
    previous.hidden = next.hidden = viewerItems.length < 2;
    original.href = item.image;
    original.hidden = true;
    announcement.textContent = '';
    status.textContent = 'Chargement de la photo…';
    slot.replaceChildren();
    stage.setAttribute('aria-busy', 'true');

    const image = new Image();
    image.className = 'gallery-image';
    image.alt = item.alt;
    image.draggable = false;
    image.decoding = 'async';
    image.src = item.image;
    try {
      await image.decode();
      // Une navigation rapide ou une fermeture ne doit pas afficher une ancienne image.
      if (version !== requestVersion || !dialog.open) return;
      image.width = image.naturalWidth;
      image.height = image.naturalHeight;
      slot.replaceChildren(image);
      status.textContent = '';
      if (!reducedMotion.matches && image.animate) {
        image.animate([
          { opacity: 0, transform: `translateX(${direction * 22}px) scale(.94)` },
          { opacity: 1, transform: 'translateX(0) scale(1)' },
        ], { duration: 280, easing: 'cubic-bezier(.2,.65,.3,1)' });
      }
      announcement.textContent = `${item.titre}. Photo ${index + 1} sur ${viewerItems.length}.`;
    } catch {
      if (version !== requestVersion || !dialog.open) return;
      status.textContent = 'Cette photo ne peut pas être chargée.';
      original.hidden = false;
    } finally {
      if (version === requestVersion) stage.setAttribute('aria-busy', 'false');
    }
  }

  function openViewer(index, trigger) {
    if (dialog.open || !items[index]) return;
    // La liste reste stable pendant la visite, même si le JSON termine son chargement.
    viewerItems = items.slice();
    opener = trigger;
    openerHref = trigger.href || '';
    showPhoto(index);
    dialog.showModal();
    document.documentElement.style.setProperty('--scrollbar-width', `${innerWidth - document.documentElement.clientWidth}px`);
    document.documentElement.classList.add('viewer-open');
    close.focus({ preventScroll: true });
  }

  function move(direction) {
    if (dialog.open && viewerItems.length > 1) {
      showPhoto(nextIndex(activeIndex, direction, viewerItems.length), direction);
    }
  }

  main.addEventListener('click', event => {
    const link = event.target.closest('a[data-photo-index]');
    if (!link || event.defaultPrevented || event.button !== 0
        || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const index = Number(link.dataset.photoIndex);
    if (!items[index]) return;
    event.preventDefault();
    openViewer(index, link);
  });
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  close.addEventListener('click', () => dialog.close());

  dialog.addEventListener('keydown', event => {
    // Boucle explicite : certains navigateurs laissent Tab atteindre leur barre d’adresse.
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href]')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
    // Échap et l’inertie de l’arrière-plan sont gérés par le dialogue natif.
  });
  const outside = event => {
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right
      || event.clientY < r.top || event.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropStart = outside(event); });
  dialog.addEventListener('click', event => {
    if (backdropStart && outside(event)) dialog.close();
    backdropStart = false;
  });
  dialog.addEventListener('close', () => {
    if (disposed) return;
    ++requestVersion;
    touch = null;
    slot.replaceChildren();
    stage.setAttribute('aria-busy', 'false');
    document.documentElement.classList.remove('viewer-open');
    document.documentElement.style.removeProperty('--scrollbar-width');
    const target = opener?.isConnected ? opener
      : [...main.querySelectorAll('.photo-link')].find(link => link.href === openerHref)
        || grid.querySelector('.photo-link');
    target?.focus({ preventScroll: true });
  });

  // Balayage horizontal sur mobile ; le défilement vertical et le pincement restent natifs.
  stage.addEventListener('pointerdown', event => {
    touch = event.pointerType === 'touch' && event.isPrimary
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp } : null;
  });
  stage.addEventListener('pointercancel', () => { touch = null; });
  stage.addEventListener('pointerup', event => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    if (event.timeStamp - touch.time < 800 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      move(dx < 0 ? 1 : -1);
    }
    touch = null;
  });

  main.disposePage = () => {
    disposed = true; ++requestVersion; controller.abort();
    if (dialog.open) dialog.close();
    document.documentElement.classList.remove('viewer-open');
    document.documentElement.style.removeProperty('--scrollbar-width');
  };
  fetch(new URL('./sorties.json', import.meta.url), { cache: 'no-store', signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (disposed) return;
      items = normalizeGallery(data);
      renderGallery();
      main.dataset.gallerySource = 'json';
    })
    .catch(() => {
      if (disposed) return;
      main.dataset.gallerySource = 'fallback';
      console.warn('Galerie : données générées indisponibles ou invalides ; photos HTML conservées.');
    });
}
