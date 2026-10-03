// Lecteur local persistant, sans autoplay.
export function initMusicPlayer(root) {
  const find = name => root.querySelector(`[data-music-${name}]`);
  const audio = root.querySelector('audio');
  const controls = find('controls'), select = find('track'), toggle = find('toggle');
  const position = find('position'), time = find('time'), status = find('status');
  if (!audio?.play || !select?.options.length || !controls || !toggle || !position || !time || !status) return;
  const panel = find('panel'), expand = find('expand'), current = find('current');
  const disclosure = find('disclosure'), launcher = find('launcher'), body = find('body');
  if (!disclosure || !launcher || !body) return;
  let wanted = false, revision = 0, place = () => {};
  function launcherState() {
    const label = `${disclosure.open ? 'Masquer' : 'Afficher'} le lecteur de musique${wanted ? ' (lecture en cours)' : ''}`;
    launcher.setAttribute('aria-expanded', String(disclosure.open));
    launcher.setAttribute('aria-label', label);
    launcher.title = label;
    root.setAttribute('data-playing', String(wanted));
  }
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.open) unfold(false);
    launcherState();
    place();
  });
  function unfold(open) {
    if (!panel || !expand) return;
    panel.hidden = !open;
    expand.setAttribute('aria-expanded', String(open));
    expand.setAttribute('aria-label', open ? 'Réduire le lecteur' : 'Afficher les morceaux et les crédits');
  }
  expand?.addEventListener('click', () => unfold(panel.hidden));
  for (const area of [panel, expand, toggle, launcher]) area?.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !disclosure.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (panel && !panel.hidden) { unfold(false); expand?.focus(); }
    else {
      disclosure.open = false;
      launcherState();
      launcher.focus();
      place();
    }
  });
  const title = () => select.selectedOptions[0].dataset.title;
  const clock = seconds => {
    const total = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  function button() {
    find('action').textContent = wanted ? 'Pause' : 'Lire';
    find('icon').textContent = wanted ? 'Ⅱ' : '▶';
    toggle.setAttribute('aria-label', `${wanted ? 'Mettre en pause' : 'Lire'} : ${title()}`);
    if (current) { current.textContent = title(); current.title = title(); }
    if (find('kind')) find('kind').textContent = select.selectedOptions[0].dataset.demo === 'true' ? 'Démo · ' : '';
    launcherState();
  }
  function progress() {
    const duration = audio.duration;
    const known = Number.isFinite(duration) && duration > 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    position.disabled = !known;
    position.max = known ? duration : 100;
    position.value = known ? Math.min(current, duration) : 0;
    time.textContent = known ? `${clock(current)} / ${clock(duration)}` : clock(current);
    position.setAttribute('aria-valuetext', known ? `${clock(current)} sur ${clock(duration)}` : 'Durée inconnue');
  }
  function stop() {
    revision++;
    wanted = false;
    audio.pause();
    button();
  }
  function failure(message) {
    stop();
    status.textContent = message;
  }
  toggle.addEventListener('click', async () => {
    if (wanted) {
      stop();
      status.textContent = '';
      return;
    }
    const request = ++revision;
    wanted = true;
    button();
    status.textContent = 'Chargement…';
    try {
      if (audio.error) audio.load();
      if (audio.ended) audio.currentTime = 0;
      await audio.play();
      if (request === revision && wanted && !audio.paused) status.textContent = '';
    } catch (error) {
      // Ignorer les promesses des lectures abandonnées.
      if (request !== revision || !wanted) return;
      failure(error.name === 'NotAllowedError' ? 'Lecture bloquée par le navigateur. Réessayez avec Lire.'
        : error.name === 'AbortError' ? 'Lecture interrompue. Réessayez avec Lire.'
          : 'Fichier indisponible ou illisible. Essayez un autre morceau.');
    }
  });
  select.addEventListener('change', () => {
    stop();
    audio.src = select.value;
    audio.setAttribute('aria-label', `Écouter ${title()}`);
    audio.load();
    progress();
    status.textContent = 'Morceau sélectionné. Appuyez sur Lire.';
  });
  position.addEventListener('input', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      audio.currentTime = Math.max(0, Math.min(Number(position.value), audio.duration));
      status.textContent = '';
      progress();
    } catch { status.textContent = 'Déplacement indisponible pour ce fichier.'; }
  });
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied', 'seeked']) {
    audio.addEventListener(event, progress);
  }
  audio.addEventListener('playing', () => {
    if (!wanted) { audio.pause(); return; }
    status.textContent = '';
    button();
  });
  audio.addEventListener('pause', () => {
    if (audio.paused && wanted) {
      revision++;
      wanted = false;
      button();
      status.textContent = '';
    }
  });
  audio.addEventListener('ended', () => {
    if (!audio.ended) return;
    stop();
    progress();
    status.textContent = 'Morceau terminé.';
  });
  audio.addEventListener('waiting', () => { if (wanted) status.textContent = 'Chargement…'; });
  audio.addEventListener('error', () => {
    if (audio.error) failure('Fichier indisponible ou illisible. Essayez un autre morceau.');
  });
  root.ownerDocument.defaultView.addEventListener('pagehide', stop);
  button();
  progress();
  // Repli natif jusqu’à l’initialisation complète.
  find('native-title').hidden = true;
  audio.hidden = true;
  controls.hidden = false;
  if (panel && expand) {
    find('choices').hidden = false;
    unfold(false);
    root.setAttribute('data-enhanced', '');
    if (typeof ResizeObserver !== 'undefined') {
      const doc = root.ownerDocument, bar = root.closest('.header-menu');
      place = () => {
        const available = doc.defaultView.innerHeight - bar.getBoundingClientRect().bottom - 22;
        body.style.setProperty('--music-height', `${Math.max(80, Math.floor(available))}px`);
      };
      const observer = new ResizeObserver(place);
      observer.observe(bar);
      doc.defaultView.addEventListener('scroll', place, { passive: true });
      doc.defaultView.addEventListener('resize', place);
      doc.addEventListener('site:navigated', place);
      place();
    }
  }
}

if (typeof document !== 'undefined') {
  const player = document.querySelector('[data-music-player]');
  if (player) initMusicPlayer(player);
}
