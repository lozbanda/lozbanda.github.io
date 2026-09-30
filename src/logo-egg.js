// Petite surprise uniquement sur demande : trois activations rapprochées.
export function initLogoEgg(root = document, motion, now = () => performance.now()) {
  const button = root.querySelector('.logo-egg');
  const logo = button?.querySelector('.hero-logo');
  if (!logo?.animate) return () => {};
  button.disposeLogoEgg?.();
  motion ??= matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController(), options = { signal: events.signal };
  let count = 0, previous = -Infinity, animation;
  function stop() {
    count = 0; previous = -Infinity;
    animation?.cancel(); animation = undefined;
  }
  function preference() { stop(); button.disabled = motion.matches; }
  preference();
  button.addEventListener('click', event => {
    if (motion.matches || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
        || event.button > 0 || animation?.playState === 'running') return;
    const time = now();
    count = time - previous <= 1600 ? count + 1 : 1;
    previous = time;
    if (count < 3) return;
    count = 0;
    animation = logo.animate([
      { transform: 'none' },
      { transform: 'translateY(-4px) rotate(-4deg)' },
      { transform: 'translateY(-6px) rotate(4deg)' },
      { transform: 'translateY(-3px) rotate(-2deg)' },
      { transform: 'translateY(-2px) rotate(2deg)' },
      { transform: 'none' },
    ], { duration: 1100, iterations: 1, easing: 'ease-in-out' });
  }, options);
  button.addEventListener('keydown', event => {
    if (event.key === 'Escape') stop();
    if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
  }, options);
  motion.addEventListener('change', preference, options);
  const dispose = () => {
    if (events.signal.aborted) return;
    events.abort(); stop(); button.disabled = true; delete button.disposeLogoEgg;
  };
  button.disposeLogoEgg = dispose;
  return dispose;
}

if (typeof document !== 'undefined') {
  let dispose = () => {};
  const mount = () => { dispose(); dispose = initLogoEgg(); };
  mount();
  document.addEventListener('site:navigated', mount);
  addEventListener('pageshow', mount);
  addEventListener('pagehide', () => dispose());
}
