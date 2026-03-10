const {
  jsonResponse,
  optionsResponse,
  getBearerToken,
  createDbClient,
  getSessionUser
} = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Yalnizca GET desteklenir." });
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

  const conversationId = String((event.queryStringParameters || {}).conversationId || "").trim();
  if (!conversationId) {
    return jsonResponse(400, { error: "conversationId zorunlu." });
  }

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id,user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return jsonResponse(404, { error: "Sohbet bulunamadi." });
  }

  if (session.user.role !== "admin" && conversation.user_id !== session.user.id) {
    return jsonResponse(403, { error: "Bu sohbete erisim iznin yok." });
  }

  const { data: messages, error: messageError } = await db
    .from("messages")
    .select("id,sender_type,content,created_at")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });

  if (messageError) {
    return jsonResponse(500, { error: "Mesajlar yuklenemedi." });
  }

  return jsonResponse(200, { ok: true, messages: messages || [] });
};

