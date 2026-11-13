/**
 * Lädt alle Format-Handler (Registrierungsreihenfolge = Reihenfolge der Inhaltserkennung).
 */
require('./markdown-handler');
require('./html-handler');
require('./json-handler');
require('./ts-handler');
require('./js-handler');
require('./css-handler');
require('./code-handler');
require('./text-handler');
