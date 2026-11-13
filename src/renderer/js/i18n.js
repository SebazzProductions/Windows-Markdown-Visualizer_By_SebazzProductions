/**
 * I18n (Renderer) – Übersetzungen aus shared/locales.js (window.MV_LOCALES).
 *
 * Statische Texte im HTML tragen data-i18n (Textinhalt), data-i18n-title, data-i18n-placeholder
 * oder data-i18n-aria und werden mit apply() aktualisiert; dynamische Texte nutzen t().
 */
const I18n = (() => {
  const locales = (typeof MV_LOCALES !== 'undefined' && MV_LOCALES) || { de: {}, en: {}, DEFAULT: 'de', SUPPORTED: ['de', 'en'] };
  let lang = locales.DEFAULT || 'de';
  const listeners = new Set();

  function interpolate(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match));
  }

  /**
   * @param {string} key
   * @param {object} [params]  Platzhalter {name}
   */
  function t(key, params) {
    const dict = locales[lang] || {};
    const value = dict[key] !== undefined ? dict[key] : (locales.de || {})[key];
    return value === undefined ? key : interpolate(value, params);
  }

  /** Ein-/Mehrzahl-Hilfe: keyOne für 1, keyMany mit {count} sonst. */
  function plural(count, keyOne, keyMany, params = {}) {
    return count === 1 ? t(keyOne, { count, ...params }) : t(keyMany, { count, ...params });
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.documentElement.lang = lang;
    document.title = t('app.name');
  }

  function setLanguage(next) {
    const normalized = (locales.SUPPORTED || ['de', 'en']).includes(next) ? next : (locales.DEFAULT || 'de');
    const changed = normalized !== lang;
    lang = normalized;
    apply();
    if (changed) listeners.forEach(fn => { try { fn(lang); } catch (err) { console.error(err); } });
    return changed;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { t, plural, apply, setLanguage, onChange, getLanguage: () => lang };
})();
