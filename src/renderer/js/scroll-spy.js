/**
 * Scroll Spy – ermittelt beim Scrollen die aktuell "aktive" Überschrift.
 * Deterministisch über Positionen (statt IntersectionObserver mit Randbereichen):
 * aktiv ist die letzte Überschrift, deren Oberkante die Lese-Linie passiert hat.
 */
const ScrollSpy = (() => {
  let container = null;
  let onActiveChange = null;
  let headings = [];
  let offsets = [];
  let rafPending = false;
  let lastActive = null;
  let resizeObserver = null;
  const READ_LINE = 80; // px unterhalb der Container-Oberkante

  function init(scrollContainer, callback) {
    container = scrollContainer;
    onActiveChange = callback;
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', () => { measure(); schedule(); });
  }

  function observe() {
    destroy(false);
    if (!container) return;
    headings = Array.from(container.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'));
    measure();
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => { measure(); schedule(); });
      const article = container.firstElementChild;
      if (article) resizeObserver.observe(article);
    }
    lastActive = null;
    schedule();
  }

  function measure() {
    if (!container) return;
    const base = container.getBoundingClientRect().top - container.scrollTop;
    offsets = headings.map(h => h.getBoundingClientRect().top - base);
  }

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      update();
    });
  }

  function update() {
    if (!container || headings.length === 0) return;
    const line = container.scrollTop + READ_LINE;
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;

    let idx = -1;
    // Binäre Suche: letzte Überschrift mit offset <= line
    let lo = 0, hi = offsets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] <= line) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (atBottom) idx = offsets.length - 1;
    if (idx === -1) idx = 0;

    const active = headings[idx] ? headings[idx].id : null;
    if (active !== lastActive) {
      lastActive = active;
      if (onActiveChange) onActiveChange(active);
    }
  }

  function destroy(resetActive = true) {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    headings = [];
    offsets = [];
    if (resetActive) lastActive = null;
  }

  return { init, observe, destroy, refresh: () => { measure(); schedule(); } };
})();
