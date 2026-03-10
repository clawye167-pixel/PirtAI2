(function adminApp() {
  var cfg = window.PIRTAI_CONFIG || {};
  var POLL_MS = Number(cfg.POLL_MS) > 0 ? Number(cfg.POLL_MS) : 3000;
  var TOKEN_KEY = "pirtai_token";

  var statusEl = document.getElementById("adminStatus");
  var listEl = document.getElementById("adminConversationList");
  var titleEl = document.getElementById("adminChatTitle");
  var metaEl = document.getElementById("adminChatMeta");
  var messageEl = document.getElementById("adminMessageList");
  var composerForm = document.getElementById("adminComposerForm");
  var inputEl = document.getElementById("adminMessageInput");
  var sendBtn = document.getElementById("adminSendBtn");
  var logoutBtn = document.getElementById("adminLogoutBtn");

  var state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    conversations: [],
    activeConversationId: null,
    pollTimer: null
  };

  composerForm.addEventListener("submit", onSendReply);
  logoutBtn.addEventListener("click", onLogout);

  init().catch(function (error) {
    setStatus(error.message || "Admin panel baslatilamadi.", "error");
  });

  async function init() {
    if (!state.token) {
      redirectLogin();
      return;
    }

    var me = await authAction("me");
    state.user = me.user;
    if (!state.user || state.user.role !== "admin") {
      setStatus("Bu sayfaya sadece admin erisebilir.", "error");
      setTimeout(redirectLogin, 1200);
      return;
    }

    await loadConversations();
    startPolling();
  }

  async function loadConversations(silent) {
    try {
      var data = await apiRequest("/api/admin?action=conversations", {
        method: "GET"
      });
      state.conversations = data.conversations || [];
      renderConversationList();

      if (state.conversations.length === 0) {
        state.activeConversationId = null;
        titleEl.textContent = "Sohbet yok";
        metaEl.textContent = "Henuz kullanici mesaji gelmedi.";
        messageEl.innerHTML = '<p class="empty-state">Sohbet bulunamadi.</p>';
        return;
      }

      var exists = state.conversations.some(function (item) {
        return item.id === state.activeConversationId;
      });
      if (!exists) {
        state.activeConversationId = state.conversations[0].id;
        await loadMessages(state.activeConversationId);
      }
    } catch (error) {
      if (!silent) {
        throw error;
      }
    }
  }

  function renderConversationList() {
    if (state.conversations.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Sohbet yok.</p>';
      return;
    }

    listEl.innerHTML = "";
    state.conversations.forEach(function (conversation) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item" + (conversation.id === state.activeConversationId ? " is-active" : "");
      button.innerHTML =
        '<p class="conversation-title">' +
        escapeHtml(conversation.title || "Yeni Sohbet") +
        "</p>" +
        '<p class="conversation-meta">' +
        "Kullanici: " +
        escapeHtml(conversation.username || "kullanici") +
        " | " +
        formatDate(conversation.created_at) +
        "</p>";
      button.addEventListener("click", function () {
        state.activeConversationId = conversation.id;
        renderConversationList();
        loadMessages(conversation.id).catch(function (error) {
          setStatus(error.message || "Mesajlar yuklenemedi.", "error");
        });
      });
      listEl.appendChild(button);
    });
  }

  async function loadMessages(conversationId, silent) {
    try {
      var active = state.conversations.find(function (item) {
        return item.id === conversationId;
      });
      titleEl.textContent = active ? active.title || "Sohbet" : "Sohbet";
      metaEl.textContent = active ? "Kullanici: " + (active.username || "kullanici") : "Kullanici: -";

      var data = await apiRequest("/api/messages?conversationId=" + encodeURIComponent(conversationId), {
        method: "GET"
      });
      renderMessages(data.messages || []);
    } catch (error) {
      if (!silent) {
        throw error;
      }
    }
  }

  function renderMessages(messages) {
    if (!messages.length) {
      messageEl.innerHTML = '<p class="empty-state">Bu sohbette mesaj yok.</p>';
      return;
    }

    messageEl.innerHTML = "";
    messages.forEach(function (msg) {
      var item = document.createElement("article");
      item.className = "message " + normalizeSenderType(msg.sender_type);
      item.innerHTML =
        '<div class="message-header">' +
        senderLabel(msg.sender_type) +
        " - " +
        formatDate(msg.created_at) +
        "</div>" +
        '<div class="message-body">' +
        escapeHtml(msg.content) +
        "</div>";
      messageEl.appendChild(item);
    });
    messageEl.scrollTop = messageEl.scrollHeight;
  }

  async function onSendReply(event) {
    event.preventDefault();
    if (!state.activeConversationId) {
      setStatus("Yanit icin once sohbet sec.", "error");
      return;
    }

    var text = inputEl.value.trim();
    if (!text) {
      return;
    }

    inputEl.disabled = true;
    sendBtn.disabled = true;
    setStatus("Yanit gonderiliyor...", "");

    try {
      await apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify({
          action: "reply",
          conversationId: state.activeConversationId,
          message: text
        })
      });
      inputEl.value = "";
      await loadMessages(state.activeConversationId);
      setStatus("Yanit gonderildi.", "success");
    } catch (error) {
      setStatus(error.message || "Yanit gonderilemedi.", "error");
    } finally {
      inputEl.disabled = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  async function onLogout() {
    try {
      await authAction("logout");
    } catch (_error) {
      // no-op
    }
    localStorage.removeItem(TOKEN_KEY);
    redirectLogin();
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = window.setInterval(function () {
      loadConversations(true).catch(function () {
        // no-op
      });
      if (state.activeConversationId) {
        loadMessages(state.activeConversationId, true).catch(function () {
          // no-op
        });
      }
    }, POLL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function redirectLogin() {
    stopPolling();
    window.location.href = "/index.html";
  }

  async function authAction(action) {
    return apiRequest("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: action })
    });
  }

  async function apiRequest(url, options) {
    var opts = options || {};
    var headers = Object.assign(
      {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.token
      },
      opts.headers || {}
    );

    var response = await fetch(url, Object.assign({}, opts, { headers: headers }));
    var payload = await response.json().catch(function () {
      return {};
    });

    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      redirectLogin();
      throw new Error("Oturum kapandi.");
    }
    if (!response.ok) {
      throw new Error(payload.error || "Istek basarisiz oldu.");
    }
    return payload;
  }

  function setStatus(message, type) {
    statusEl.textContent = message || "";
    statusEl.classList.remove("error", "success");
    if (type) {
      statusEl.classList.add(type);
    }
  }

  function senderLabel(senderType) {
    if (senderType === "user") {
      return "Kullanici";
    }
    if (senderType === "admin") {
      return "Admin";
    }
    return "Sistem";
  }

  function normalizeSenderType(senderType) {
    if (senderType === "user" || senderType === "admin") {
      return senderType;
    }
    return "admin";
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString("tr-TR", {
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();

