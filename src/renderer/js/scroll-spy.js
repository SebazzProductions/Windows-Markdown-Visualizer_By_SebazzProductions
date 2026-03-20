/**
 * Scroll Spy - IntersectionObserver-based heading tracking
 */
const ScrollSpy = (() => {
  let observer = null;
  let onActiveChange = null;
  let contentContainer = null;
  let headingElements = [];

  /**
   * Initialize scroll spy
   * @param {HTMLElement} container - The scrollable content container
   * @param {Function} callback - Called with heading ID when active heading changes
   */
  function init(container, callback) {
    contentContainer = container;
    onActiveChange = callback;
  }

  /**
   * Start observing headings in the content
   */
  function observe() {
    // Cleanup previous observer
    destroy();

    if (!contentContainer) return;

    headingElements = Array.from(
      contentContainer.querySelectorAll('h1, h2, h3, h4, h5, h6')
    ).filter(el => el.id);

    if (headingElements.length === 0) return;

    // Track which headings are currently intersecting
    const visibleHeadings = new Set();

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visibleHeadings.add(entry.target.id);
          } else {
            visibleHeadings.delete(entry.target.id);
          }
        });

        // Find the topmost visible heading
        if (visibleHeadings.size > 0) {
          // Get the heading that appears first in document order
          for (const el of headingElements) {
            if (visibleHeadings.has(el.id)) {
              if (onActiveChange) onActiveChange(el.id);
              return;
            }
          }
        }

        // If no headings are visible, find the one just scrolled past
        if (visibleHeadings.size === 0) {
          const scrollTop = contentContainer.scrollTop;
          let lastAbove = null;

          for (const el of headingElements) {
            // offsetTop relative to content container
            const top = el.offsetTop - contentContainer.offsetTop;
            if (top <= scrollTop + 100) {
              lastAbove = el;
            } else {
              break;
            }
          }

          if (lastAbove && onActiveChange) {
            onActiveChange(lastAbove.id);
          }
        }
      },
      {
        root: contentContainer,
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0
      }
    );

    headingElements.forEach(el => observer.observe(el));
  }

  /**
   * Stop observing
   */
  function destroy() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    headingElements = [];
  }

  return { init, observe, destroy };
})();
