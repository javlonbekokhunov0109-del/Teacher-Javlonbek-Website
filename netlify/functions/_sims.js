// Interactive test pages (Listening / Reading simulators) that belong to mocks.
// The files live next to the functions (sims/) and are ONLY served by mock-sim.js after an access check,
// so nobody can open a paid mock's pages by guessing a URL. manifest.json maps a mock number to its pages.
const fs = require("fs"), path = require("path");
const DIRS = [path.join(__dirname, "sims"), path.join(process.env.LAMBDA_TASK_ROOT || "/var/task", "netlify/functions/sims"), path.join(process.cwd(), "netlify/functions/sims")];
function readFile(name) { for (const d of DIRS) { try { return fs.readFileSync(path.join(d, name), "utf8"); } catch (e) { /* try next */ } } return null; }
function readSim(file) { return /^[a-z0-9._-]+\.html$/i.test(String(file)) ? readFile(file) : null; }
function manifest() { try { return JSON.parse(readFile("manifest.json") || "{}"); } catch (e) { return {}; } }
function simsFor(number) { const m = manifest()[String(number)] || {}; return { listening: m.listening || null, reading: Array.isArray(m.reading) ? m.reading : [] }; }
module.exports = { readSim, simsFor };
