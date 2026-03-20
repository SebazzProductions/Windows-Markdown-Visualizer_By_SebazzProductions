/**
 * TOC Manager - Generates and manages the Table of Contents sidebar
 */
const TOCManager = (() => {
  let tocContainer = null;
  let onNavigate = null;  // callback when user clicks a heading

  /**
   * Initialize the TOC manager
   */
  function init(container, navigateCallback) {
    tocContainer = container;
    onNavigate = navigateCallback;
  }

  /**
   * Build hierarchical tree from flat headings list
   */
  function buildTree(headings) {
    const root = { children: [] };
    const stack = [{ node: root, level: 0 }];

    for (const heading of headings) {
      const item = {
        id: heading.id,
        text: heading.text,
        level: heading.level,
        children: []
      };

      // Find the right parent: pop stack until we find a level less than current
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
        stack.pop();
      }

      stack[stack.length - 1].node.children.push(item);
      stack.push({ node: item, level: heading.level });
    }

    return root.children;
  }

  /**
   * Render the TOC tree into DOM elements
   */
  function renderTree(tree, isTopLevel = true) {
    const ul = document.createElement('ul');

    for (const item of tree) {
      const li = document.createElement('li');
      li.classList.add('toc-item', `toc-level-${item.level}`);
      li.dataset.headingId = item.id;

      // Container for toggle + link
      const linkRow = document.createElement('div');
      linkRow.classList.add('toc-link-row');

      // Create toggle button if has children
      if (item.children.length > 0) {
        const toggle = document.createElement('button');
        toggle.classList.add('toc-toggle', 'expanded');
        toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleChildren(li, toggle);
        });
        linkRow.appendChild(toggle);
      } else {
        // Spacer for alignment
        const spacer = document.createElement('span');
        spacer.style.width = '18px';
        spacer.style.flexShrink = '0';
        linkRow.appendChild(spacer);
      }

      // Create link
      const link = document.createElement('a');
      link.classList.add('toc-link');
      link.href = `#${item.id}`;
      link.textContent = item.text;
      link.dataset.headingId = item.id;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (onNavigate) onNavigate(item.id);
      });
      linkRow.appendChild(link);
      li.appendChild(linkRow);

      // Render children
      if (item.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.classList.add('toc-children', 'expanded');
        childrenContainer.appendChild(renderTree(item.children, false));
        li.appendChild(childrenContainer);
      }

      ul.appendChild(li);
    }

    return ul;
  }

  /**
   * Toggle children visibility for a TOC item
   */
  function toggleChildren(li, toggleBtn) {
    const childrenDiv = li.querySelector(':scope > .toc-children');
    if (!childrenDiv) return;

    const isExpanded = childrenDiv.classList.contains('expanded');
    if (isExpanded) {
      childrenDiv.classList.remove('expanded');
      toggleBtn.classList.remove('expanded');
    } else {
      childrenDiv.classList.add('expanded');
      toggleBtn.classList.add('expanded');
    }
  }

  /**
   * Expand parent nodes to make a specific heading visible in TOC
   */
  function expandToHeading(headingId) {
    if (!tocContainer) return;

    const link = tocContainer.querySelector(`[data-heading-id="${CSS.escape(headingId)}"]`);
    if (!link) return;

    // Walk up and expand all parent .toc-children
    let el = link.closest('.toc-item');
    while (el) {
      const parent = el.parentElement?.closest('.toc-item');
      if (parent) {
        const childrenDiv = parent.querySelector(':scope > .toc-children');
        const toggle = parent.querySelector(':scope > .toc-link-row > .toc-toggle');
        if (childrenDiv && !childrenDiv.classList.contains('expanded')) {
          childrenDiv.classList.add('expanded');
          if (toggle) toggle.classList.add('expanded');
        }
      }
      el = parent;
    }
  }

  /**
   * Set the active heading in the TOC
   */
  function setActive(headingId) {
    if (!tocContainer) return;

    // Remove all active classes
    const allLinks = tocContainer.querySelectorAll('.toc-link.active');
    allLinks.forEach(link => link.classList.remove('active'));

    if (!headingId) return;

    // Set new active
    const activeLink = tocContainer.querySelector(`.toc-link[data-heading-id="${CSS.escape(headingId)}"]`);
    if (activeLink) {
      activeLink.classList.add('active');

      // Expand tree to show active item
      expandToHeading(headingId);

      // Scroll active item into view within the sidebar
      activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Generate and render the full TOC
   */
  function update(headings) {
    if (!tocContainer) return;

    tocContainer.innerHTML = '';

    if (!headings || headings.length === 0) {
      tocContainer.innerHTML = '<p style="padding: 1rem; color: var(--text-tertiary); font-size: 0.82rem;">Keine Überschriften gefunden</p>';
      return;
    }

    const tree = buildTree(headings);
    const dom = renderTree(tree);
    tocContainer.appendChild(dom);
  }

  /**
   * Generate TOC HTML for PDF export (flat list with clickable links)
   */
  function generatePdfTocHtml(headings) {
    if (!headings || headings.length === 0) return '';

    let html = '<div class="pdf-toc"><h1 style="margin-bottom: 1em; font-size: 1.5em;">Inhaltsverzeichnis</h1>';
    html += '<nav>';

    for (const heading of headings) {
      const indent = (heading.level - 1) * 1.5;
      const fontSize = heading.level === 1 ? '1em' : heading.level === 2 ? '0.95em' : '0.88em';
      const weight = heading.level <= 2 ? '600' : '400';
      html += `<div style="padding: 0.3em 0; padding-left: ${indent}em; font-size: ${fontSize}; font-weight: ${weight};">`;
      html += `<a href="#${heading.id}" style="color: #4f6ef7; text-decoration: none;">${escapeHtml(heading.text)}</a>`;
      html += '</div>';
    }

    html += '</nav></div>';
    html += '<div style="page-break-after: always;"></div>';
    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  return { init, update, setActive, expandToHeading, generatePdfTocHtml };
})();
