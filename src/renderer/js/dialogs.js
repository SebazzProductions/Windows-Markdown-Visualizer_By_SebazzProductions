/**
 * AppDialog – In-App-Bestätigungsdialog im Design der Anwendung
 * (ersetzt native Nachrichtenboxen für „Ungespeicherte Änderungen“ und „Datei extern geändert“).
 */
const AppDialog = (() => {
  let overlay, titleEl, messageEl, detailEl, iconEl, footer, btnClose;
  let resolver = null;
  let cancelId = 'cancel';

  function init() {
    overlay = document.getElementById('app-dialog');
    titleEl = document.getElementById('app-dialog-title');
    messageEl = document.getElementById('app-dialog-message');
    detailEl = document.getElementById('app-dialog-detail');
    iconEl = document.getElementById('app-dialog-icon');
    footer = document.getElementById('app-dialog-footer');
    btnClose = document.getElementById('btn-app-dialog-close');
    btnClose.addEventListener('click', () => finish(cancelId));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(cancelId); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(cancelId); }
    });
  }

  /**
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} [opts.detail]
   * @param {'warning'|'question'|'info'} [opts.type]
   * @param {Array<{id: string, label: string, primary?: boolean, danger?: boolean}>} opts.buttons  links → rechts
   * @param {string} [opts.cancelId]   Ergebnis bei Esc / Schließen / Klick außerhalb
   * @param {string} [opts.defaultId]  Button mit Fokus
   * @returns {Promise<string>} id des gewählten Buttons
   */
  function show(opts) {
    if (!overlay) init();
    if (resolver) finish(cancelId); // vorherigen Dialog auflösen
    cancelId = opts.cancelId || (opts.buttons.find(b => b.id === 'cancel') ? 'cancel' : opts.buttons[0].id);

    titleEl.textContent = opts.title || '';
    messageEl.textContent = opts.message || '';
    detailEl.textContent = opts.detail || '';
    detailEl.classList.toggle('hidden', !opts.detail);
    const icon = opts.type === 'question' ? 'i-help' : opts.type === 'info' ? 'i-info' : 'i-alert';
    iconEl.innerHTML = `<svg width="26" height="26"><use href="#${icon}"/></svg>`;
    iconEl.className = `app-dialog-icon is-${opts.type || 'warning'}`;

    footer.innerHTML = '';
    let focusTarget = null;
    opts.buttons.forEach((b, i) => {
      if (b.spacerBefore || (i === 1 && opts.buttons.length > 2 && b.id !== cancelId && opts.buttons[0].id === cancelId)) {
        const spacer = document.createElement('span');
        spacer.className = 'spacer';
        footer.appendChild(spacer);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${b.primary ? 'btn-primary' : 'btn-secondary'}${b.danger ? ' btn-danger' : ''}`;
      btn.textContent = b.label;
      btn.dataset.dialogAction = b.id;
      btn.addEventListener('click', () => finish(b.id));
      footer.appendChild(btn);
      if (b.id === opts.defaultId || (!opts.defaultId && b.primary)) focusTarget = btn;
    });

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => (focusTarget || footer.querySelector('button') || btnClose).focus());
    return new Promise(resolve => { resolver = resolve; });
  }

  function finish(result) {
    if (!overlay) return;
    overlay.classList.add('hidden');
    const r = resolver;
    resolver = null;
    if (r) r(result);
  }

  function isOpen() {
    return Boolean(overlay) && !overlay.classList.contains('hidden');
  }

  /** Ungespeicherte Änderungen → 'save' | 'discard' | 'cancel' */
  function confirmUnsaved(fileName) {
    return show({
      type: 'warning',
      title: I18n.t('unsaved.title'),
      message: I18n.t('unsaved.message'),
      detail: fileName || '',
      cancelId: 'cancel',
      defaultId: 'save',
      buttons: [
        { id: 'cancel', label: I18n.t('unsaved.cancel') },
        { id: 'discard', label: I18n.t('unsaved.discard') },
        { id: 'save', label: I18n.t('unsaved.save'), primary: true }
      ]
    });
  }

  /** Datei extern geändert → 'reload' | 'keep' */
  function confirmReload(fileName) {
    return show({
      type: 'question',
      title: I18n.t('reload.title'),
      message: I18n.t('reload.message', { name: fileName || '' }),
      detail: I18n.t('reload.detail'),
      cancelId: 'keep',
      defaultId: 'keep',
      buttons: [
        { id: 'keep', label: I18n.t('reload.keep') },
        { id: 'reload', label: I18n.t('reload.reload'), primary: true }
      ]
    });
  }

  return { init, show, cancel: () => finish(cancelId), isOpen, confirmUnsaved, confirmReload };
})();
