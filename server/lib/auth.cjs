const crypto = require("node:crypto");

function base64urlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function resolveAdmin(config = {}) {
  const email = String(config.email || process.env.ADMIN_EMAIL || "andre09azevedo@gmail.com").trim().toLowerCase();
  const password = String(config.password || process.env.ADMIN_PASSWORD || "StudioDrive2026!").trim();
  const secret = String(config.secret || process.env.AUTH_SECRET || "automatizador-tiktok-secret").trim();
  return { email, password, secret };
}

function createAuth(config = {}) {
  const admin = resolveAdmin(config);

  function buildToken(email = admin.email) {
    const payload = JSON.stringify({
      email: String(email).trim().toLowerCase(),
      type: "admin",
    });
    const encodedPayload = base64urlEncode(payload);
    const signature = crypto.createHmac("sha256", admin.secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  function verifyToken(token = "") {
    const [encodedPayload = "", signature = ""] = String(token || "").trim().split(".");
    if (!encodedPayload || !signature) return null;

    const expectedSignature = crypto.createHmac("sha256", admin.secret).update(encodedPayload).digest("base64url");
    if (signature.length !== expectedSignature.length) {
      return null;
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    try {
      const payload = JSON.parse(base64urlDecode(encodedPayload));
      if (payload.email !== admin.email) return null;
      return {
        id: payload.email,
        email: payload.email,
        role: payload.type || "admin",
      };
    } catch {
      return null;
    }
  }

  function authenticate(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "");
    if (normalizedEmail !== admin.email || normalizedPassword !== admin.password) {
      return null;
    }
    const user = {
      id: admin.email,
      email: admin.email,
      role: "admin",
    };
    return {
      token: buildToken(admin.email),
      user,
    };
  }

  function getAuthHeaderToken(req) {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
  }

  function requireAuth(req, res, next) {
    const token = getAuthHeaderToken(req);
    const user = verifyToken(token);
    if (!user) {
      res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
      return;
    }
    req.auth = { token, user };
    next();
  }

  return {
    admin,
    authenticate,
    buildToken,
    getAuthHeaderToken,
    requireAuth,
    verifyToken,
  };
}

module.exports = { createAuth };
