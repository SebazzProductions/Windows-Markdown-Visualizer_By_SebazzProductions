/**
 * Toast – kurze, nicht blockierende Benachrichtigungen unten rechts.
 */
const Toast = (() => {
  let container = null;

  const ICONS = {
    info: 'i-info',
    success: 'i-check',
    warning: 'i-alert',
    error: 'i-error'
  };

  function init() {
    container = document.getElementById('toast-container');
  }

  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {'info'|'success'|'warning'|'error'} [opts.type]
   * @param {string} [opts.title]
   * @param {number} [opts.duration]  ms, 0 = bleibt bis zum Klick
   * @param {{label: string, onClick: Function}} [opts.action]
   */
  function show(message, opts = {}) {
    if (!container) init();
    if (!container) return null;

    const type = opts.type || 'info';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    icon.style.flexShrink = '0';
    icon.style.marginTop = '1px';
    icon.style.color = `var(--${type === 'info' ? 'accent' : type === 'error' ? 'danger' : type}-color)`;
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${ICONS[type] || ICONS.info}`);
    icon.appendChild(use);
    el.appendChild(icon);

    const text = document.createElement('div');
    text.className = 'toast-message';
    if (opts.title) {
      const t = document.createElement('span');
      t.className = 'toast-title';
      t.textContent = opts.title;
      text.appendChild(t);
    }
    text.appendChild(document.createTextNode(message));
    el.appendChild(text);

    if (opts.action && typeof opts.action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = opts.action.label || 'OK';
      btn.addEventListener('click', () => {
        opts.action.onClick();
        dismiss(el);
      });
      el.appendChild(btn);
    }

    const close = document.createElement('button');
    close.className = 'btn-icon-sm';
    close.title = 'Schließen';
    close.innerHTML = '<svg width="14" height="14"><use href="#i-close"/></svg>';
    close.addEventListener('click', () => dismiss(el));
    el.appendChild(close);

    container.appendChild(el);

    const duration = opts.duration !== undefined ? opts.duration : (type === 'error' ? 8000 : 4000);
    if (duration > 0) {
      let timer = setTimeout(() => dismiss(el), duration);
      el.addEventListener('mouseenter', () => clearTimeout(timer));
      el.addEventListener('mouseleave', () => { timer = setTimeout(() => dismiss(el), 1500); });
    }

    // Maximal 4 Toasts gleichzeitig
    while (container.children.length > 4) {
      container.firstElementChild.remove();
    }
    return el;
  }

  function dismiss(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  }

  const info = (m, o) => show(m, { ...o, type: 'info' });
  const success = (m, o) => show(m, { ...o, type: 'success' });
  const warning = (m, o) => show(m, { ...o, type: 'warning' });
  const error = (m, o) => show(m, { ...o, type: 'error' });

  return { init, show, dismiss, info, success, warning, error };
})();
