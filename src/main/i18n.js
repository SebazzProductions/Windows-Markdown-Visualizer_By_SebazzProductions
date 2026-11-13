/**
 * i18n (Main-Prozess) – Übersetzungen für Menü, Dialoge, Kontextmenü und Export.
 * Die Sprache kommt aus den Einstellungen ('system' → Systemsprache des Betriebssystems).
 */
const { app } = require('electron');
const LOCALES = require('../shared/locales');
const { settings } = require('./settings');

function systemLanguage() {
  // Testläufe (und Nutzer, die es wünschen) können die Systemsprache per Umgebungsvariable festlegen
  if (LOCALES.SUPPORTED.includes(process.env.MV_LANG)) return process.env.MV_LANG;
  try {
    const locale = String(app.getLocale() || '').toLowerCase();
    return locale.startsWith('de') ? 'de' : 'en';
  } catch {
    return LOCALES.DEFAULT;
  }
}

/** @returns {'de'|'en'} */
function effectiveLanguage() {
  let configured = null;
  try { configured = settings.get('language'); } catch { configured = null; }
  if (LOCALES.SUPPORTED.includes(configured)) return configured;
  return systemLanguage();
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? String(params[key]) : match));
}

/**
 * @param {string} key
 * @param {object} [params]
 */
function t(key, params) {
  const lang = effectiveLanguage();
  const value = (LOCALES[lang] && LOCALES[lang][key]) ?? (LOCALES.de && LOCALES.de[key]);
  return value === undefined ? key : interpolate(value, params);
}

module.exports = { t, effectiveLanguage, systemLanguage };
