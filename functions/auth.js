const {
  jsonResponse,
  optionsResponse,
  parseBody,
  getBearerToken,
  createDbClient,
  createToken,
  verifyPassword,
  getSessionUser,
  normalizeUsername
} = require("./_shared");

function sessionExpiryIso() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Yalnizca POST desteklenir." });
  }

  const db = createDbClient();
  if (!db) {
    return jsonResponse(500, {
      error: "SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam degiskenleri eksik."
    });
  }

  const body = parseBody(event);
  if (!body) {
    return jsonResponse(400, { error: "JSON body hatali." });
  }

  const action = String(body.action || "").trim();

  if (action === "register") {
    return jsonResponse(403, { error: "Yeni kayit kapali." });
  }

  if (action === "login") {
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");

    if (!username || !password) {
      return jsonResponse(400, { error: "Kullanici adi ve sifre zorunlu." });
    }

    const { data: user, error: userError } = await db
      .from("app_users")
      .select("id,username,role,password_hash")
      .eq("username", username)
      .maybeSingle();

    if (userError || !user) {
      return jsonResponse(401, { error: "Kullanici adi veya sifre hatali." });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return jsonResponse(401, { error: "Kullanici adi veya sifre hatali." });
    }

    const token = createToken();
    const { error: sessionError } = await db.from("app_sessions").insert({
      token,
      user_id: user.id,
      expires_at: sessionExpiryIso()
    });

    if (sessionError) {
      return jsonResponse(500, { error: "Oturum acilamadi." });
    }

    return jsonResponse(200, {
      ok: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  }

  if (action === "me") {
    const token = getBearerToken(event);
    const session = await getSessionUser(db, token);
    if (!session) {
      return jsonResponse(401, { error: "Oturum bulunamadi." });
    }
    return jsonResponse(200, { ok: true, user: session.user });
  }

  if (action === "logout") {
    const token = getBearerToken(event);
    if (token) {
      await db.from("app_sessions").delete().eq("token", token);
    }
    return jsonResponse(200, { ok: true });
  }

  return jsonResponse(400, { error: "Gecersiz action." });
};
