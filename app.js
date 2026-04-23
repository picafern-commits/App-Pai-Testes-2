
/* iPhone app total: bloquear zoom/double tap e manter só scroll vertical */
let brinkaLastTouchEnd = 0;

document.addEventListener("touchend", function (event) {
  const now = Date.now();
  if (now - brinkaLastTouchEnd <= 300) {
    event.preventDefault();
  }
  brinkaLastTouchEnd = now;
}, { passive: false });

document.addEventListener("gesturestart", function (event) {
  event.preventDefault();
}, { passive: false });

document.addEventListener("gesturechange", function (event) {
  event.preventDefault();
}, { passive: false });

document.addEventListener("gestureend", function (event) {
  event.preventDefault();
}, { passive: false });

document.addEventListener("touchmove", function (event) {
  if (event.touches && event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, setDoc,
  serverTimestamp, query, orderBy, onSnapshot, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const noteValues = [500, 200, 100, 50, 20, 10, 5];
const coinValues = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const state = {
  closures: [],
  settings: { defaultStore: "Brinka", defaultExpected: "", theme: "dark" },
  db: null,
  firebase: false,
  unsubscribe: null
};

const $ = (id) => document.getElementById(id);
const eur = (value) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const makeId = () => crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

function toast(text) {
  const el = $("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function setStatus(mode, text, sub) {
  if ($("storageStatus")) $("storageStatus").textContent = text;
  if ($("syncStatus")) $("syncStatus").textContent = sub;
  if ($("statusDot")) {
    $("statusDot").classList.remove("off", "err");
    if (mode === "local") $("statusDot").classList.add("off");
    if (mode === "error") $("statusDot").classList.add("err");
  }
  if ($("firebaseInfo")) $("firebaseInfo").textContent = `${text} — ${sub}`;
}

function hasValidFirebaseConfig() {
  const cfg = window.BRINKA_FIREBASE_CONFIG || {};
  return Boolean(
    window.BRINKA_FIREBASE_ENABLED &&
    cfg.apiKey &&
    cfg.projectId &&
    !String(cfg.apiKey).includes("COLOCA_AQUI") &&
    !String(cfg.projectId).includes("COLOCA_AQUI")
  );
}

function loadLocal() {
  state.closures = JSON.parse(localStorage.getItem("brinka_firebase_closures") || "[]");
  state.settings = {
    ...state.settings,
    ...JSON.parse(localStorage.getItem("brinka_firebase_settings") || "{}")
  };
}

function saveLocal() {
  localStorage.setItem("brinka_firebase_closures", JSON.stringify(state.closures));
  localStorage.setItem("brinka_firebase_settings", JSON.stringify(state.settings));
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function createDailyBackup(reason = "auto") {
  if (!state.firebase || !state.db) return;

  const key = todayKey();
  const total = state.closures.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const diff = state.closures.reduce((sum, item) => sum + Number(item.diff || 0), 0);

  await setDoc(doc(state.db, "brinka_backups_diarios", key), {
    date: key,
    reason,
    updatedAt: serverTimestamp(),
    totalFechos: state.closures.length,
    totalGeral: total,
    totalDiferencas: diff,
    closures: state.closures
  }, { merge: true });

  localStorage.setItem("brinka_last_backup_day", key);
}

async function ensureDailyBackup() {
  if (!state.firebase) return;
  const key = todayKey();
  const last = localStorage.getItem("brinka_last_backup_day");
  if (last !== key) {
    await createDailyBackup("daily_auto");
  }
}

async function initFirebase() {
  if (!hasValidFirebaseConfig()) {
    setStatus("local", "Modo local", "Firebase sem config válida");
    return;
  }

  try {
    const app = initializeApp(window.BRINKA_FIREBASE_CONFIG);
    state.db = getFirestore(app);

    try {
      await enableIndexedDbPersistence(state.db);
    } catch (error) {
      console.warn("Persistência offline não ativada:", error.code);
    }

    state.firebase = true;
    setStatus("online", "Firebase ativo", "Sincronização em tempo real");

    const q = query(collection(state.db, "brinka_fechos"), orderBy("createdAt", "desc"));
    state.unsubscribe = onSnapshot(q, async (snapshot) => {
      state.closures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      saveLocal();
      renderAll();
      setStatus("online", "Firebase ativo", "Dados sincronizados");
      try { await ensureDailyBackup(); } catch (e) { console.warn("Backup diário falhou:", e); }
    }, (error) => {
      console.error(error);
      setStatus("error", "Erro Firebase", "A usar cópia local");
    });

  } catch (error) {
    console.error(error);
    state.firebase = false;
    setStatus("error", "Erro Firebase", "Verifica firebase-config.js");
  }
}

function setNowDate() {
  if (!$("closeDate")) return;
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $("closeDate").value = d.toISOString().slice(0, 16);
}

function buildMoneyRows(targetId, values) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = values.map(value => `
    <div class="money-row" data-value="${value}">
      <div class="money-value">${String(value).replace(".", ",")}€</div>
      <input type="number" min="0" step="1" value="" placeholder="" inputmode="numeric" />
      <div class="money-sub">0,00 €</div>
    </div>
  `).join("");

  target.querySelectorAll("input").forEach(input => input.addEventListener("input", calculate));
}

function collectRows(selector) {
  return [...document.querySelectorAll(selector)].map(row => {
    const value = Number(row.dataset.value);
    const raw = row.querySelector("input").value;
    const qty = raw === "" ? 0 : Number(raw || 0);
    const subtotal = value * qty;
    row.querySelector(".money-sub").textContent = eur(subtotal);
    return { value, qty, subtotal };
  });
}

function calculate() {
  const notes = collectRows("#notesRows .money-row");
  const coins = collectRows("#coinsRows .money-row");
  const notesTotal = notes.reduce((sum, row) => sum + row.subtotal, 0);
  const coinsTotal = coins.reduce((sum, row) => sum + row.subtotal, 0);
  const total = notesTotal + coinsTotal;
  const expected = Number($("expected")?.value || 0);
  const diff = total - expected;

  if ($("notesTotal")) $("notesTotal").textContent = eur(notesTotal);
  if ($("coinsTotal")) $("coinsTotal").textContent = eur(coinsTotal);
  if ($("sumNotes")) $("sumNotes").textContent = eur(notesTotal);
  if ($("sumCoins")) $("sumCoins").textContent = eur(coinsTotal);
  if ($("sumExpected")) $("sumExpected").textContent = eur(expected);
  if ($("sumDiff")) $("sumDiff").textContent = eur(diff);
  if ($("grandTotal")) $("grandTotal").textContent = eur(total);

  const badge = $("diffBadge");
  if (badge) {
    badge.style.background = "rgba(255,149,0,.15)";
    badge.style.color = "#ffd7a0";

    if (!expected) {
      badge.textContent = "Sem esperado";
    } else if (Math.abs(diff) < 0.005) {
      badge.textContent = "Certo";
      badge.style.background = "rgba(49,210,124,.16)";
      badge.style.color = "#9ff2c5";
    } else if (diff > 0) {
      badge.textContent = `Sobra ${eur(diff)}`;
      badge.style.background = "rgba(49,210,124,.16)";
      badge.style.color = "#9ff2c5";
    } else {
      badge.textContent = `Falta ${eur(Math.abs(diff))}`;
      badge.style.background = "rgba(255,92,114,.16)";
      badge.style.color = "#ffd0d7";
    }
  }

  return { notes, coins, notesTotal, coinsTotal, total, expected, diff };
}

function getStatus(diff) {
  if (Math.abs(Number(diff || 0)) < 0.005) return "certo";
  return diff > 0 ? "sobra" : "falta";
}

async function saveClosure() {
  const calc = calculate();

  if (calc.total <= 0) {
    toast("Mete valores antes de guardar");
    return;
  }

  const dateIso = $("closeDate")?.value ? new Date($("closeDate").value).toISOString() : new Date().toISOString();

  const item = {
    localId: makeId(),
    dateIso,
    dateLabel: new Date(dateIso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }),
    store: $("store")?.value.trim() || state.settings.defaultStore || "Brinka",
    operator: $("operator")?.value.trim() || "Sem utilizador",
    expected: calc.expected,
    diff: calc.diff,
    total: calc.total,
    notesTotal: calc.notesTotal,
    coinsTotal: calc.coinsTotal,
    notes: calc.notes,
    coins: calc.coins,
    observation: $("obs")?.value.trim() || ""
  };

  try {
    if (state.firebase) {
      await addDoc(collection(state.db, "brinka_fechos"), { ...item, createdAt: serverTimestamp() });
      toast("Fecho guardado e sincronizado");
      setTimeout(() => createDailyBackup("after_save").catch(console.warn), 500);
    } else {
      state.closures.unshift(item);
      saveLocal();
      renderAll();
      toast("Fecho guardado localmente");
    }
    clearForm(false);
  } catch (error) {
    console.error(error);
    state.closures.unshift(item);
    saveLocal();
    renderAll();
    toast("Firebase falhou, guardado local");
  }
}

function clearForm(show = true) {
  document.querySelectorAll(".money-row input").forEach(input => input.value = "");
  if ($("store")) $("store").value = state.settings.defaultStore || "Brinka";
  if ($("expected")) $("expected").value = state.settings.defaultExpected || "";
  if ($("obs")) $("obs").value = "";
  setNowDate();
  calculate();
  if (show) toast("Formulário limpo");
}

async function deleteClosure(id) {
  try {
    if (state.firebase && id) {
      await deleteDoc(doc(state.db, "brinka_fechos", id));
      setTimeout(() => createDailyBackup("after_delete").catch(console.warn), 500);
      toast("Fecho apagado no Firebase");
      return;
    }
  } catch (error) {
    console.error(error);
    toast("Erro ao apagar no Firebase");
  }

  state.closures = state.closures.filter(item => (item.id || item.localId) !== id);
  saveLocal();
  renderAll();
  toast("Fecho apagado localmente");
}

function renderDashboard() {
  const today = new Date().toLocaleDateString("pt-PT");
  const todayItems = state.closures.filter(item => item.dateIso && new Date(item.dateIso).toLocaleDateString("pt-PT") === today);
  const todayTotal = todayItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const todayDiff = todayItems.reduce((sum, item) => sum + Number(item.diff || 0), 0);
  const allTotal = state.closures.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const best = Math.max(0, ...state.closures.map(item => Number(item.total || 0)));
  const avg = state.closures.length ? allTotal / state.closures.length : 0;

  if ($("todayTotal")) $("todayTotal").textContent = eur(todayTotal);
  if ($("todayDiff")) $("todayDiff").textContent = eur(todayDiff);
  if ($("todaySubtitle")) $("todaySubtitle").textContent = todayItems.length ? `${todayItems.length} fecho(s) hoje` : "Sem fechos hoje";
  if ($("totalClosures")) $("totalClosures").textContent = state.closures.length;
  if ($("lastClosure")) $("lastClosure").textContent = state.closures[0]?.dateLabel || "—";
  if ($("bestClosure")) $("bestClosure").textContent = eur(best);
  if ($("allTimeTotal")) $("allTimeTotal").textContent = eur(allTotal);
  if ($("avgClosure")) $("avgClosure").textContent = eur(avg);

  if ($("recentClosures")) {
    $("recentClosures").innerHTML = state.closures.slice(0, 6).map(item => `
      <div class="list-item">
        <div><strong>${eur(item.total)}</strong><br><span class="muted">${item.dateLabel} · ${item.store || "Brinka"}</span></div>
        <div style="text-align:right"><b>${getStatus(item.diff)}</b><br><span class="muted">${eur(item.diff)}</span></div>
      </div>
    `).join("") || `<p class="muted">Ainda não existem fechos guardados.</p>`;
  }
}

function renderHistory() {
  if (!$("historyTable")) return;

  const term = $("search")?.value.trim().toLowerCase() || "";
  const filter = $("statusFilter")?.value || "";

  const items = state.closures.filter(item => {
    const text = `${item.dateLabel} ${item.store} ${item.operator} ${item.total}`.toLowerCase();
    return (!term || text.includes(term)) && (!filter || getStatus(item.diff) === filter);
  });

  $("historyTable").innerHTML = items.map(item => {
    const id = item.id || item.localId;
    return `
      <tr>
        <td>${item.dateLabel || "—"}</td>
        <td>${item.store || "—"}</td>
        <td>${item.operator || "—"}</td>
        <td><b>${eur(item.total)}</b></td>
        <td>${eur(item.expected)}</td>
        <td>${eur(item.diff)}</td>
        <td><button class="delete-row" data-delete="${id}">Apagar</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="muted">Sem resultados.</td></tr>`;

  document.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => deleteClosure(button.dataset.delete));
  });
}

function renderReports() {
  const total = state.closures.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const diff = state.closures.reduce((sum, item) => sum + Number(item.diff || 0), 0);

  if ($("reportTotal")) $("reportTotal").textContent = eur(total);
  if ($("reportDiff")) $("reportDiff").textContent = eur(diff);
  if ($("reportMissing")) $("reportMissing").textContent = state.closures.filter(item => Number(item.diff) < -0.005).length;
  if ($("reportOver")) $("reportOver").textContent = state.closures.filter(item => Number(item.diff) > 0.005).length;

  if ($("reportList")) {
    $("reportList").innerHTML = state.closures.slice(0, 10).map(item => `
      <div class="list-item">
        <div><strong>${item.store || "Brinka"}</strong><br><span class="muted">${item.dateLabel} · ${item.operator || "Sem utilizador"}</span></div>
        <div style="text-align:right"><b>${eur(item.total)}</b><br><span class="muted">${eur(item.diff)}</span></div>
      </div>
    `).join("") || `<p class="muted">Sem dados para relatório.</p>`;
  }
}

function renderSettings() {
  if ($("defaultStore")) $("defaultStore").value = state.settings.defaultStore || "";
  if ($("defaultExpected")) $("defaultExpected").value = state.settings.defaultExpected || "";
  document.body.classList.toggle("light", state.settings.theme === "light");
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderReports();
  renderSettings();
}

function switchPage(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  if ($(`page-${page}`)) $(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === page));

  const titles = {
    dashboard: ["Dashboard", "Resumo da Caixa"],
    fecho: ["Fecho de Caixa", "Novo Fecho"],
    historico: ["Histórico", "Registos Guardados"],
    relatorios: ["Relatórios", "Análise de Fechos"],
    config: ["Configurações", "Preferências"]
  };

  if ($("pageKicker")) $("pageKicker").textContent = titles[page]?.[0] || "Brinka";
  if ($("pageTitle")) $("pageTitle").textContent = titles[page]?.[1] || "Fecho de Caixa";
  if ($("sidebar")) $("sidebar").classList.remove("open");
  if ($("overlay")) $("overlay").classList.remove("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveSettings() {
  state.settings.defaultStore = $("defaultStore")?.value.trim() || "Brinka";
  state.settings.defaultExpected = $("defaultExpected")?.value || "";
  saveLocal();
  if ($("store")) $("store").value = state.settings.defaultStore;
  if ($("expected")) $("expected").value = state.settings.defaultExpected;
  calculate();
  renderAll();
  toast("Configurações guardadas");
}

function exportCsv() {
  const header = ["Data", "Loja", "Utilizador", "Total", "Esperado", "Diferenca", "Observacoes"];
  const rows = state.closures.map(item =>
    [item.dateLabel, item.store, item.operator, item.total, item.expected, item.diff, item.observation || ""]
      .map(value => `"${String(value).replaceAll('"', '""')}"`).join(";")
  );

  const blob = new Blob([[header.join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "brinka-historico.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));

  if ($("menuBtn")) $("menuBtn").addEventListener("click", () => {
    $("sidebar").classList.add("open");
    $("overlay").classList.add("show");
  });

  if ($("overlay")) $("overlay").addEventListener("click", () => {
    $("sidebar").classList.remove("open");
    $("overlay").classList.remove("show");
  });

  if ($("themeBtn")) $("themeBtn").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    saveLocal();
    renderSettings();
  });

  if ($("expected")) $("expected").addEventListener("input", calculate);
  if ($("saveClosure")) $("saveClosure").addEventListener("click", saveClosure);
  if ($("clearForm")) $("clearForm").addEventListener("click", () => clearForm(true));
  if ($("search")) $("search").addEventListener("input", renderHistory);
  if ($("statusFilter")) $("statusFilter").addEventListener("change", renderHistory);
  if ($("saveSettings")) $("saveSettings").addEventListener("click", saveSettings);
  if ($("exportCsv")) $("exportCsv").addEventListener("click", exportCsv);

  if ($("clearHistory")) $("clearHistory").addEventListener("click", () => {
    if (!confirm("Apagar apenas a cópia local? No Firebase os dados continuam.")) return;
    state.closures = [];
    saveLocal();
    renderAll();
    toast("Cópia local limpa");
  });
}

async function init() {
  loadLocal();
  buildMoneyRows("notesRows", noteValues);
  buildMoneyRows("coinsRows", coinValues);
  bindEvents();

  if ($("operator")) {
    $("operator").value = localStorage.getItem("brinka_operator") || "";
    $("operator").addEventListener("input", e => localStorage.setItem("brinka_operator", e.target.value));
  }

  if ($("store")) $("store").value = state.settings.defaultStore;
  if ($("expected")) $("expected").value = state.settings.defaultExpected;
  setNowDate();
  calculate();

  renderAll();
  await initFirebase();
}

init();
