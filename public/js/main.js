(function mainApp() {
  var cfg = window.PIRTAI_CONFIG || {};
  var POLL_MS = Number(cfg.POLL_MS) > 0 ? Number(cfg.POLL_MS) : 3000;
  var TOKEN_KEY = "pirtai_token";

  var authView = document.getElementById("authView");
  var appView = document.getElementById("appView");
  var authStatus = document.getElementById("authStatus");
  var chatStatus = document.getElementById("chatStatus");

  var loginForm = document.getElementById("loginForm");

  var newConversationBtn = document.getElementById("newConversationBtn");
  var conversationList = document.getElementById("conversationList");
  var chatTitle = document.getElementById("chatTitle");
  var messageList = document.getElementById("messageList");
  var composerForm = document.getElementById("composerForm");
  var messageInput = document.getElementById("messageInput");
  var sendBtn = document.getElementById("sendBtn");
  var logoutBtn = document.getElementById("logoutBtn");
  var adminLink = document.getElementById("adminLink");

  var state = {
    token: "",
    user: null,
    conversations: [],
    activeConversationId: null,
    pollTimer: null,
    isSending: false
  };

  loginForm.addEventListener("submit", onLoginSubmit);
  logoutBtn.addEventListener("click", onLogout);
  newConversationBtn.addEventListener("click", startNewConversation);
  composerForm.addEventListener("submit", onComposerSubmit);

  bootstrap().catch(function (error) {
    setStatus(authStatus, error.message || "Baslangicta hata olustu.", "error");
  });

  async function bootstrap() {
    var savedToken = localStorage.getItem(TOKEN_KEY) || "";
    if (!savedToken) {
      clearSessionView();
      return;
    }
    state.token = savedToken;

    try {
      var data = await authAction("me");
      state.user = data.user;
      showAppView();
      await loadConversations();
      startPolling();
    } catch (_error) {
      clearSessionView();
    }
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    setStatus(authStatus, "Giris yapiliyor...", "");

    var username = document.getElementById("loginUsername").value.trim().toLowerCase();
    var password = document.getElementById("loginPassword").value;

    try {
      var data = await authAction("login", {
        username: username,
        password: password
      });
      handleAuthSuccess(data);
    } catch (error) {
      setStatus(authStatus, error.message || "Giris basarisiz.", "error");
    }
  }

  function handleAuthSuccess(data) {
    state.token = data.token || "";
    state.user = data.user || null;
    if (!state.token || !state.user) {
      throw new Error("Oturum verisi eksik.");
    }
    localStorage.setItem(TOKEN_KEY, state.token);
    setStatus(authStatus, "Giris basarili.", "success");
    showAppView();
    loadConversations().catch(function (error) {
      setStatus(chatStatus, error.message || "Sohbetler yuklenemedi.", "error");
    });
    startPolling();
  }

  async function onLogout() {
    try {
      await authAction("logout");
    } catch (_error) {
      // no-op
    }
    clearSessionView();
  }

  function clearSessionView() {
    stopPolling();
    state.token = "";
    state.user = null;
    state.activeConversationId = null;
    state.conversations = [];
    localStorage.removeItem(TOKEN_KEY);
    loginForm.reset();
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    adminLink.classList.add("hidden");
    setStatus(authStatus, "", "");
    setStatus(chatStatus, "", "");
    conversationList.innerHTML = "";
    messageList.innerHTML = '<p class="empty-state">Mesajlasmaya baslamak icin once giris yap.</p>';
  }

  function showAppView() {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    adminLink.classList.toggle("hidden", !(state.user && state.user.role === "admin"));
    setStatus(chatStatus, "", "");
  }

  async function loadConversations(silent) {
    try {
      var data = await apiRequest("/api/conversations", {
        method: "GET"
      });
      state.conversations = data.conversations || [];
      renderConversationList();

      if (state.conversations.length === 0) {
        startNewConversation();
        return;
      }

      var currentId = state.activeConversationId;
      var exists = state.conversations.some(function (item) {
        return item.id === currentId;
      });
      if (!exists) {
        currentId = state.conversations[0].id;
      }
      if (currentId !== state.activeConversationId) {
        await activateConversation(currentId);
      }
    } catch (error) {
      if (!silent) {
        throw error;
      }
    }
  }

  function renderConversationList() {
    if (state.conversations.length === 0) {
      conversationList.innerHTML = '<p class="empty-state">Henuz sohbet yok.</p>';
      return;
    }

    conversationList.innerHTML = "";
    state.conversations.forEach(function (conversation) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item" + (conversation.id === state.activeConversationId ? " is-active" : "");
      button.innerHTML =
        '<p class="conversation-title">' +
        escapeHtml(conversation.title || "Yeni Sohbet") +
        "</p>" +
        '<p class="conversation-meta">' +
        formatDate(conversation.created_at) +
        "</p>";
      button.addEventListener("click", function () {
        activateConversation(conversation.id).catch(function (error) {
          setStatus(chatStatus, error.message || "Sohbet acilirken hata olustu.", "error");
        });
      });
      conversationList.appendChild(button);
    });
  }

  function startNewConversation() {
    state.activeConversationId = null;
    chatTitle.textContent = "Yeni Sohbet";
    messageList.innerHTML = '<p class="empty-state">Ilk mesaji yaz ve yeni sohbet olustur.</p>';
    renderConversationList();
  }

  async function activateConversation(conversationId) {
    state.activeConversationId = conversationId;
    renderConversationList();

    var active = state.conversations.find(function (item) {
      return item.id === conversationId;
    });
    chatTitle.textContent = active ? active.title || "Sohbet" : "Sohbet";
    await loadMessages(conversationId);
  }

  async function loadMessages(conversationId, silent) {
    if (!conversationId) {
      messageList.innerHTML = '<p class="empty-state">Ilk mesaji yazarak sohbet ac.</p>';
      return;
    }

    try {
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
      messageList.innerHTML = '<p class="empty-state">Bu sohbette henuz mesaj yok.</p>';
      return;
    }

    messageList.innerHTML = "";
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
      messageList.appendChild(item);
    });
    messageList.scrollTop = messageList.scrollHeight;
  }

  async function onComposerSubmit(event) {
    event.preventDefault();
    if (state.isSending) {
      return;
    }

    var text = messageInput.value.trim();
    if (!text) {
      return;
    }

    state.isSending = true;
    messageInput.disabled = true;
    sendBtn.disabled = true;
    setStatus(chatStatus, "Mesaj gonderiliyor...", "");

    try {
      var data = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          conversationId: state.activeConversationId || null,
          message: text
        })
      });

      messageInput.value = "";
      state.activeConversationId = data.conversationId;
      await loadConversations();
      await loadMessages(state.activeConversationId);
      setStatus(chatStatus, "Mesaj gonderildi. Admin panelinden cevap bekleniyor.", "success");
    } catch (error) {
      setStatus(chatStatus, error.message || "Mesaj gonderilemedi.", "error");
    } finally {
      state.isSending = false;
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    }
  }

  async function authAction(action, extraPayload) {
    var payload = Object.assign({ action: action }, extraPayload || {});
    return apiRequest("/api/auth", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function apiRequest(url, options) {
    var opts = options || {};
    var headers = Object.assign(
      {
        "Content-Type": "application/json"
      },
      opts.headers || {}
    );

    if (state.token) {
      headers.Authorization = "Bearer " + state.token;
    }

    var response = await fetch(url, Object.assign({}, opts, { headers: headers }));
    var payload = await response.json().catch(function () {
      return {};
    });

    if (response.status === 401 && state.token) {
      clearSessionView();
      throw new Error(payload.error || "Oturum kapandi. Tekrar giris yap.");
    }

    if (!response.ok) {
      throw new Error(payload.error || "Istek basarisiz oldu.");
    }

    return payload;
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = window.setInterval(function () {
      if (!state.user) {
        return;
      }
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

  function setStatus(target, text, type) {
    target.textContent = text || "";
    target.classList.remove("error", "success");
    if (type) {
      target.classList.add(type);
    }
  }

  function senderLabel(senderType) {
    if (senderType === "user") {
      return "Sen";
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

