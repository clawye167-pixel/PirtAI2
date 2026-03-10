const {
  jsonResponse,
  optionsResponse,
  parseBody,
  getBearerToken,
  createDbClient,
  getSessionUser
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }

  const db = createDbClient();
  if (!db) {
    return jsonResponse(500, {
      error: "SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam degiskenleri eksik."
    });
  }

  const token = getBearerToken(event);
  const session = await getSessionUser(db, token);
  if (!session) {
    return jsonResponse(401, { error: "Oturum bulunamadi." });
  }

  if (event.httpMethod === "GET") {
    const { data, error } = await db
      .from("conversations")
      .select("id,title,created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return jsonResponse(500, { error: "Sohbetler yuklenemedi." });
    }

    return jsonResponse(200, { ok: true, conversations: data || [] });
  }

  if (event.httpMethod === "POST") {
    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, { error: "JSON body hatali." });
    }

    const title = String(body.title || "Yeni Sohbet").trim().slice(0, 60) || "Yeni Sohbet";

    const { data, error } = await db
      .from("conversations")
      .insert({
        user_id: session.user.id,
        title
      })
      .select("id,title,created_at")
      .single();

    if (error || !data) {
      return jsonResponse(500, { error: "Sohbet olusturulamadi." });
    }

    return jsonResponse(200, { ok: true, conversation: data });
  }

  return jsonResponse(405, { error: "Yalnizca GET ve POST desteklenir." });
};

