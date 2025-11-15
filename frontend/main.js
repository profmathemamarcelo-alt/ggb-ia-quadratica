// frontend/main.js

let ggbLoaded = false;
let history = [];

// wrapper (GGBApplet) para injetar e redimensionar
let ggbWrapper = null;

// API do GeoGebra (getValue, setValue, etc.)
let ggbApi = null;

// -------- 1) Redimensionar o applet de acordo com o container --------

function resizeGGB() {
  if (!ggbWrapper) return; // ainda não injetou

  const container = document.getElementById("ggb-element");
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(300, Math.floor(rect.height));

  try {
    // wrapper sabe se redimensionar
    ggbWrapper.setSize(width, height);
    if (typeof ggbWrapper.refreshViews === "function") {
      ggbWrapper.refreshViews();
    }
    console.log("Redimensionando GeoGebra para:", width, height);
  } catch (e) {
    console.warn("Não consegui redimensionar o GeoGebra:", e);
  }
}

// -------- 2) Inicializar GeoGebra --------

function initGGB() {
  const params = {
    appName: "classic",
    showToolBar: true,
    showAlgebraInput: true,
    showMenuBar: true,
    enableRightClick: true,
    enableShiftDragZoom: true,
    filename: "quadratica.ggb",

    // AQUI vem a API de verdade
    appletOnLoad: function (api) {
      // api é o objeto que tem getValue, setValue, etc.
      ggbApi = api || window.ggbApplet || null;
      if (!ggbApi) {
        console.error("API do GeoGebra não disponível.");
        logMessage(
          "ai",
          "Não consegui inicializar a API do GeoGebra. Atualize a página."
        );
        return;
      }

      ggbLoaded = true;

      logMessage(
        "ai",
        "GeoGebra carregado. Use os controles da função e depois peça explicações ou desafios."
      );

      resizeGGB();
    },
  };

  // wrapper para injetar e controlar tamanho
  const applet = new GGBApplet(params, true);
  ggbWrapper = applet;

  applet.inject("ggb-element");

  window.addEventListener("resize", () => {
    resizeGGB();
  });
}

// -------- 3) Ler estado atual da construção --------

function getGgbState() {
  if (!ggbLoaded || !ggbApi) {
    console.warn("Ainda não consigo ler o estado do GeoGebra.");
    return null;
  }

  try {
    const a = ggbApi.getValue("a");
    const b = ggbApi.getValue("b");
    const c = ggbApi.getValue("c");

    // LER EXPLICITAMENTE X_1 e X_2
    let x1 = null;
    let x2 = null;

    try {
      const v1 = ggbApi.getXcoord("X_1");
      if (Number.isFinite(v1)) x1 = v1;
    } catch (e) {
      x1 = null;
    }

    try {
      const v2 = ggbApi.getXcoord("X_2");
      if (Number.isFinite(v2)) x2 = v2;
    } catch (e) {
      x2 = null;
    }

    const vx = ggbApi.getXcoord("V");
    const vy = ggbApi.getYcoord("V");

    let areaRect = 0;
    try {
      areaRect = ggbApi.getValue("A");
    } catch (e) {
      areaRect = 0;
    }

    const state = {
      a,
      b,
      c,
      x1,
      x2,
      vertex: { x: vx, y: vy },
      areaRect,
    };

    console.log("ggbState enviado para a IA:", state);
    return state;
  } catch (e) {
    console.error("Erro ao ler estado do GeoGebra:", e);
    return null;
  }
}

// -------- 4) Aplicar ações IA → GeoGebra --------

// -------- 4) Aplicar ações IA → GeoGebra --------
function applyActions(actions) {
  if (!ggbLoaded || !ggbApi || !actions || !actions.length) {
    return;
  }

  console.log("Aplicando ações ao GeoGebra:", actions);

  actions.forEach((act, idx) => {
    const { command, object, value } = act;
    console.log(`Ação #${idx}:`, act);

    try {
      if (command === "setValue") {
        ggbApi.setValue(object, value);
      } else if (command === "setVisible") {
        ggbApi.setVisible(object, !!value);
      } else if (command === "setPoint") {
        ggbApi.setCoords(object, value.x, value.y);
      } else if (command === "evalCommand") {
        // aqui você permite criar objetos, tipo reta tangente
        if (typeof value === "string") {
          ggbApi.evalCommand(value);
        }
      } else {
        console.warn("Comando desconhecido:", command);
      }
    } catch (e) {
      console.error("Erro ao aplicar ação IA → GeoGebra:", act, e);
    }
  });
}

// -------- 5) Chat / log visual --------

function logMessage(role, text) {
  const chatLog = document.getElementById("chat-log");
  if (!chatLog) return;
  const div = document.createElement("div");
  div.className = `chat-message ${role}`;
  const span = document.createElement("span");
  span.textContent = text;
  div.appendChild(span);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// -------- 6) Chamada ao backend --------

async function sendToAI({ mode, message }) {
  const ggbState = getGgbState();

  if (!ggbState && !ggbLoaded && mode !== "explain") {
    logMessage(
      "ai",
      "Ainda estou carregando o GeoGebra. Aguarde um instante e tente de novo."
    );
    return;
  }
  history.push({ role: "user", content: message || `[botão:${mode}]` });

  // mantém só as últimas 20 mensagens (10 interações)
  if (history.length > 20) {
    history = history.slice(history.length - 20);
  }
  try {
    const resp = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode,
        message,
        ggbState,
        history,
      }),
    });

    const data = await resp.json();
    const { reply, actions } = data;

    history.push({ role: "assistant", content: reply });

    logMessage("ai", reply);
    applyActions(actions);
  } catch (e) {
    console.error("Erro ao falar com backend:", e);
    logMessage(
      "ai",
      "Erro ao falar com o servidor de IA. Verifique se o backend está rodando."
    );
  }
}

// -------- 7) UI: botões, textarea, ocultar IA --------

function initUI() {
  const btns = document.querySelectorAll("#ai-controls button");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      logMessage("user", `[Botão] ${btn.textContent}`);
      sendToAI({ mode, message: "" });
    });
  });

  const sendBtn = document.getElementById("send-message");
  const textarea = document.getElementById("user-message");

  sendBtn.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (!text) return;
    logMessage("user", text);
    textarea.value = "";
    sendToAI({ mode: "chat", message: text });
  });
}

// -------- 8) Start --------

window.addEventListener("load", () => {
  initGGB();
  initUI();
});
