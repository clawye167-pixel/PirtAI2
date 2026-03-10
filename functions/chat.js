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
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Yalnizca POST desteklenir." });
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

  const body = parseBody(event);
  if (!body) {
    return jsonResponse(400, { error: "JSON body hatali." });
  }

  const text = String(body.message || "").trim();
  if (!text) {
    return jsonResponse(400, { error: "Mesaj bos olamaz." });
  }
  if (text.length > 4000) {
    return jsonResponse(400, { error: "Mesaj en fazla 4000 karakter olabilir." });
  }

  let conversationId = String(body.conversationId || "").trim();

  if (!conversationId) {
    const { data: createdConversation, error: createError } = await db
      .from("conversations")
      .insert({
        user_id: session.user.id,
        title: text.slice(0, 45) || "Yeni Sohbet"
      })
      .select("id")
      .single();

    if (createError || !createdConversation) {
      return jsonResponse(500, { error: "Yeni sohbet olusturulamadi." });
    }
    conversationId = createdConversation.id;
  } else {
    const { data: conversation, error: conversationError } = await db
      .from("conversations")
      .select("id,user_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return jsonResponse(404, { error: "Sohbet bulunamadi." });
    }
    if (conversation.user_id !== session.user.id && session.user.role !== "admin") {
      return jsonResponse(403, { error: "Bu sohbete erisim iznin yok." });
    }
  }

  const { error: insertError } = await db.from("messages").insert({
    conversation_id: conversationId,
    sender_type: "user",
    content: text
  });

  if (insertError) {
    return jsonResponse(500, { error: "Mesaj kaydedilemedi." });
  }

  return jsonResponse(200, {
    ok: true,
    conversationId,
    mode: "manual_admin_reply",
    message: "Mesaj kaydedildi. Admin panelinden cevaplanacak."
  });
};

