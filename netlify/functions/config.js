// GET /.netlify/functions/config
// Returns ONLY the public Supabase values the browser is allowed to know.
// The anon key is safe to expose — Row-Level Security is what protects data.
// The service-role key and GEMINI_API_KEY are NEVER sent here.

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Backend not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify.",
      }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // config rarely changes; let the browser cache it briefly
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify({ url, anonKey }),
  };
};
