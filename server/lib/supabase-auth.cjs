const { createClient } = require("@supabase/supabase-js");

function createSupabaseAuth(config = {}) {
  const supabaseUrl = String(config.supabaseUrl || process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(config.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Auth.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  async function verifyToken(token = "") {
    const accessToken = String(token || "").trim();
    if (!accessToken) return null;
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email || "",
      role: "authenticated",
    };
  }

  async function requireAuth(req, res, next) {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match ? match[1].trim() : "";
    const user = await verifyToken(token);
    if (!user) {
      res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
      return;
    }
    req.auth = { token, user };
    next();
  }

  return {
    requireAuth,
    verifyToken,
  };
}

module.exports = { createSupabaseAuth };
