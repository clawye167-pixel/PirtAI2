const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload)
  };
}

function optionsResponse() {
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: ""
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (_error) {
    return null;
  }
}

function getBearerToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function createDbClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return "scrypt$" + salt + "$" + hash;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const salt = parts[1];
  const expected = parts[2];
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(derived, "hex"));
  } catch (_error) {
    return false;
  }
}

async function getSessionUser(db, token) {
  if (!token) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("app_sessions")
    .select("token,user_id,expires_at,app_users!inner(id,username,role)")
    .eq("token", token)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error || !data || !data.app_users) {
    return null;
  }

  return {
    token: data.token,
    user: {
      id: data.app_users.id,
      username: data.app_users.username,
      role: data.app_users.role
    }
  };
}

function normalizeUsername(rawUsername) {
  return String(rawUsername || "").trim().toLowerCase();
}

function validateUsername(username) {
  if (!username) {
    return "Kullanici adi bos olamaz.";
  }
  if (username.length < 3 || username.length > 24) {
    return "Kullanici adi 3-24 karakter olmali.";
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Kullanici adi sadece kucuk harf, rakam ve _ icerebilir.";
  }
  return "";
}

function validatePassword(password) {
  if (!password) {
    return "Sifre bos olamaz.";
  }
  if (password.length < 6 || password.length > 72) {
    return "Sifre 6-72 karakter olmali.";
  }
  return "";
}

module.exports = {
  corsHeaders,
  jsonResponse,
  optionsResponse,
  parseBody,
  getBearerToken,
  createDbClient,
  createToken,
  hashPassword,
  verifyPassword,
  getSessionUser,
  normalizeUsername,
  validateUsername,
  validatePassword
};

