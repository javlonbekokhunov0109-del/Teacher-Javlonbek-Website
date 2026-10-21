// Interactive test pages (Listening / Reading simulators) that belong to mocks.
// They are compiled into sims/pages.js (see sims/build.js) and ONLY served by mock-sim.js after an access check,
// so nobody can open a paid mock's pages by guessing a URL. sims/manifest.json maps a mock number to its pages.
// Both are plain require()s, so Netlify's bundler packs them into the function: no extra files to ship.
const PAGES = require("./sims/pages.js"), MANIFEST = require("./sims/manifest.json");
function readSim(file) { return Object.prototype.hasOwnProperty.call(PAGES, file) ? PAGES[file] : null; }
function simsFor(number) { const m = MANIFEST[String(number)] || {}; return { listening: m.listening || null, reading: Array.isArray(m.reading) ? m.reading : [] }; }
module.exports = { readSim, simsFor };
