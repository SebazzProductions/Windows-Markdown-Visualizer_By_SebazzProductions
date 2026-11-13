/**
 * TOC Manager – Inhaltsverzeichnis-Seitenleiste: Baum, Ein-/Ausklappen, Filter, aktiver Eintrag
 */
const TOCManager = (() => {
  let tocContainer = null;
  let onNavigate = null;
  let collapsedIds = new Set(); // bleibt über Neu-Renderings (Live-Vorschau) erhalten
  let currentHeadings = [];
  let filterText = '';
  let activeId = null;

  function init(container, navigateCallback) {
    tocContainer = container;
    onNavigate = navigateCallback;
  }

  function buildTree(headings) {
    const root = { children: [] };
    const stack = [{ node: root, level: 0 }];
    for (const heading of headings) {
      const item = { id: heading.id, text: heading.text, level: heading.level, children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
      stack[stack.length - 1].node.children.push(item);
      stack.push({ node: item, level: heading.level });
    }
    return root.children;
  }

  function renderTree(tree) {
    const ul = document.createElement('ul');
    for (const item of tree) {
      const li = document.createElement('li');
      li.classList.add('toc-item', `toc-level-${item.level}`);
      li.dataset.headingId = item.id;

      const row = document.createElement('div');
      row.classList.add('toc-link-row');

      if (item.children.length > 0) {
        const expanded = !collapsedIds.has(item.id);
        const toggle = document.createElement('button');
        toggle.classList.add('toc-toggle');
        toggle.classList.toggle('expanded', expanded);
        toggle.title = expanded ? 'Einklappen' : 'Ausklappen';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleChildren(li, toggle);
        });
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'toc-spacer';
        row.appendChild(spacer);
      }

      const link = document.createElement('a');
      link.classList.add('toc-link');
      link.href = `#${item.id}`;
      link.textContent = item.text;
      link.title = item.text;
      link.dataset.headingId = item.id;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (onNavigate) onNavigate(item.id);
      });
      row.appendChild(link);
      li.appendChild(row);

      if (item.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.classList.add('toc-children');
        childrenContainer.classList.toggle('expanded', !collapsedIds.has(item.id));
        childrenContainer.appendChild(renderTree(item.children));
        li.appendChild(childrenContainer);
      }
      ul.appendChild(li);
    }
    return ul;
  }

  function toggleChildren(li, toggleBtn) {
    const childrenDiv = li.querySelector(':scope > .toc-children');
    if (!childrenDiv) return;
    const expand = !childrenDiv.classList.contains('expanded');
    childrenDiv.classList.toggle('expanded', expand);
    toggleBtn.classList.toggle('expanded', expand);
    toggleBtn.setAttribute('aria-expanded', String(expand));
    toggleBtn.title = expand ? 'Einklappen' : 'Ausklappen';
    const id = li.dataset.headingId;
    if (expand) collapsedIds.delete(id); else collapsedIds.add(id);
  }

  function setAllExpanded(expanded) {
    if (!tocContainer) return;
    if (expanded) {
      collapsedIds.clear();
    } else {
      tocContainer.querySelectorAll('.toc-item:has(> .toc-children)').forEach(li => collapsedIds.add(li.dataset.headingId));
    }
    tocContainer.querySelectorAll('.toc-children').forEach(div => div.classList.toggle('expanded', expanded));
    tocContainer.querySelectorAll('.toc-toggle').forEach(btn => {
      btn.classList.toggle('expanded', expanded);
      btn.setAttribute('aria-expanded', String(expanded));
    });
  }

  function expandToHeading(headingId) {
    if (!tocContainer) return;
    const link = tocContainer.querySelector(`.toc-link[data-heading-id="${CSS.escape(headingId)}"]`);
    if (!link) return;
    let el = link.closest('.toc-item');
    while (el) {
      const parent = el.parentElement ? el.parentElement.closest('.toc-item') : null;
      if (parent) {
        const childrenDiv = parent.querySelector(':scope > .toc-children');
        const toggle = parent.querySelector(':scope > .toc-link-row > .toc-toggle');
        if (childrenDiv && !childrenDiv.classList.contains('expanded')) {
          childrenDiv.classList.add('expanded');
          if (toggle) { toggle.classList.add('expanded'); toggle.setAttribute('aria-expanded', 'true'); }
          collapsedIds.delete(parent.dataset.headingId);
        }
      }
      el = parent;
    }
  }

  function setActive(headingId) {
    if (!tocContainer) return;
    activeId = headingId || null;
    tocContainer.querySelectorAll('.toc-link.active').forEach(link => link.classList.remove('active'));
    if (!headingId) return;
    const activeLink = tocContainer.querySelector(`.toc-link[data-heading-id="${CSS.escape(headingId)}"]`);
    if (activeLink) {
      activeLink.classList.add('active');
      expandToHeading(headingId);
      activeLink.scrollIntoView({ block: 'nearest' });
    }
  }

  function update(headings) {
    if (!tocContainer) return;
    currentHeadings = Array.isArray(headings) ? headings : [];
    tocContainer.innerHTML = '';
    if (currentHeadings.length === 0) {
      const p = document.createElement('p');
      p.className = 'toc-empty';
      p.textContent = 'Keine Überschriften gefunden';
      tocContainer.appendChild(p);
      return;
    }
    tocContainer.appendChild(renderTree(buildTree(currentHeadings)));
    if (filterText) applyFilter(filterText);
    if (activeId) setActive(activeId);
  }

  /**
   * Filter: Einträge ohne Treffer ausblenden, Eltern von Treffern anzeigen und aufklappen.
   */
  function applyFilter(text) {
    filterText = (text || '').trim();
    if (!tocContainer) return;
    const q = filterText.toLowerCase();
    const items = tocContainer.querySelectorAll('.toc-item');

    if (!q) {
      items.forEach(li => {
        li.classList.remove('filtered-out');
        const link = li.querySelector(':scope > .toc-link-row > .toc-link');
        if (link) link.textContent = link.title;
      });
      return;
    }

    items.forEach(li => li.classList.add('filtered-out'));
    items.forEach(li => {
      const link = li.querySelector(':scope > .toc-link-row > .toc-link');
      if (!link) return;
      const label = link.title;
      const idx = label.toLowerCase().indexOf(q);
      if (idx === -1) {
        link.textContent = label;
        return;
      }
      link.textContent = '';
      link.append(label.slice(0, idx));
      const mark = document.createElement('mark');
      mark.textContent = label.slice(idx, idx + q.length);
      link.append(mark, label.slice(idx + q.length));

      let el = li;
      while (el) {
        el.classList.remove('filtered-out');
        const childrenDiv = el.querySelector(':scope > .toc-children');
        if (childrenDiv) childrenDiv.classList.add('expanded');
        const toggle = el.querySelector(':scope > .toc-link-row > .toc-toggle');
        if (toggle) toggle.classList.add('expanded');
        el = el.parentElement ? el.parentElement.closest('.toc-item') : null;
      }
    });
  }

  function getHeadings() {
    return currentHeadings;
  }

  return { init, update, setActive, expandToHeading, setAllExpanded, applyFilter, getHeadings };
})();
