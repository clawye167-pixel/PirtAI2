const {
  jsonResponse,
  optionsResponse,
  parseBody,
  getBearerToken,
  createDbClient,
  getSessionUser
} = require("./_shared");

function notAdminResponse() {
  return jsonResponse(403, { error: "Bu islem sadece admin icin." });
}

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
  if (session.user.role !== "admin") {
    return notAdminResponse();
  }

  if (event.httpMethod === "GET") {
    const action = String((event.queryStringParameters || {}).action || "conversations").trim();

    if (action === "users") {
      const { data, error } = await db
        .from("app_users")
        .select("id,username,role,created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        return jsonResponse(500, { error: "Kullanicilar yuklenemedi." });
      }
      return jsonResponse(200, { ok: true, users: data || [] });
    }

    const { data, error } = await db
      .from("conversations")
      .select("id,title,created_at,user_id,app_users!inner(username)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return jsonResponse(500, { error: "Admin sohbet listesi yuklenemedi." });
    }

    const conversations = (data || []).map((item) => ({
      id: item.id,
      title: item.title,
      created_at: item.created_at,
      user_id: item.user_id,
      username: item.app_users ? item.app_users.username : "kullanici"
    }));

    return jsonResponse(200, { ok: true, conversations });
  }

  if (event.httpMethod === "POST") {
    const body = parseBody(event);
    if (!body) {
      return jsonResponse(400, { error: "JSON body hatali." });
    }

    const action = String(body.action || "").trim();

    if (action === "reply") {
      const conversationId = String(body.conversationId || "").trim();
      const message = String(body.message || "").trim();

      if (!conversationId) {
        return jsonResponse(400, { error: "conversationId zorunlu." });
      }
      if (!message) {
        return jsonResponse(400, { error: "Mesaj bos olamaz." });
      }
      if (message.length > 4000) {
        return jsonResponse(400, { error: "Mesaj en fazla 4000 karakter olabilir." });
      }

      const { data: conversation, error: conversationError } = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationError || !conversation) {
        return jsonResponse(404, { error: "Sohbet bulunamadi." });
      }

      const { error: insertError } = await db.from("messages").insert({
        conversation_id: conversationId,
        sender_type: "admin",
        content: message
      });

      if (insertError) {
        return jsonResponse(500, { error: "Admin yaniti kaydedilemedi." });
      }

      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: "Gecersiz action." });
  }

  return jsonResponse(405, { error: "Desteklenmeyen method." });
};

