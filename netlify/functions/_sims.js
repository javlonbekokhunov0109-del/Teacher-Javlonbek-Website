// Interactive test pages (Listening / Reading) that belong to mocks.
// They are compiled into sims/pages.js (see sims/build.js) and ONLY served by mock-sim.js after an access check,
// so nobody can open a paid mock's pages by guessing a URL. sims/manifest.json maps a mock number to its pages:
//   { "1": { "listening": {file,title,audio,minutes,questions}, "reading": {file,title,minutes,questions} } }
// Both are plain require()s, so Netlify's bundler packs them into the function: no extra files to ship.
const PAGES = require("./sims/pages.js"), MANIFEST = require("./sims/manifest.json");
function readSim(file) { return Object.prototype.hasOwnProperty.call(PAGES, file) ? PAGES[file] : null; }
function simsFor(number) { const m = MANIFEST[String(number)] || {}; return { listening: m.listening || null, reading: m.reading || null }; }
module.exports = { readSim, simsFor };
