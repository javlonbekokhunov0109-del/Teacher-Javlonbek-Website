// Shared helpers for the serverless functions.
// Files starting with "_" are NOT treated as endpoints by Netlify, but can be
// required by the real functions (esbuild bundles them in).

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Comma-separated list of teacher emails, e.g. "you@gmail.com, admin@mail.ru"
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function missingEnv() {
  return !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY;
}

// A client that bypasses Row-Level Security. Server-side ONLY.
function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Read the Bearer token, then ask Supabase who it belongs to.
// Returns the verified user object, or null if the token is missing/invalid.
async function getUserFromRequest(event) {
  const header =
    event.headers.authorization || event.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());
}

const BUCKET = "lesson-content";

// Decide a simple category from the MIME type (drives icons + how students open it).
function kindFromMime(m) {
  m = String(m || "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.includes("wordprocessing") || m === "application/msword") return "doc";
  if (m.includes("presentation") || m.includes("powerpoint")) return "slides";
  if (m.includes("spreadsheet") || m.includes("excel")) return "sheet";
  return "other";
}

// Make a filename safe for a storage path.
function sanitizeName(name) {
  return String(name || "file")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(-120) || "file";
}

// Turn a storage signedUrl (may be relative) into an absolute URL for the browser.
function absoluteStorageUrl(signedUrl) {
  if (!signedUrl) return signedUrl;
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const base = SUPABASE_URL.replace(/\/+$/, "") + "/storage/v1";
  return base + (signedUrl.startsWith("/") ? signedUrl : "/" + signedUrl);
}

module.exports = {
  json,
  missingEnv,
  serviceClient,
  getUserFromRequest,
  isAdminEmail,
  ADMIN_EMAILS,
  BUCKET,
  kindFromMime,
  sanitizeName,
  absoluteStorageUrl,
};
