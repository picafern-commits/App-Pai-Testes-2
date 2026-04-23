import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const noteValues = [500, 200, 100, 50, 20, 10, 5];
const coinValues = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const state = {
  closures: [],
  settings: {
    storeName: "Brinka",
    defaultExpected: "",
    theme: "dark"
  },
  firebaseReady: false,
  db: null
};

const $ = (id) => document.getElementById(id);

function eur(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function nowLabel() {
  return new Date().toLocaleString("pt-PT", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function uid() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function loadLocal() {
  state.closures = JSON.parse(localStorage.getItem("brinka_closures") || "[]");
  state.settings = {
    ...state.settings,
    ...(JSON.parse(localStorage.getItem("brinka_settings") || "{}"))
  };
}

function saveLocal() {
  localStorage.setItem("brinka_closures", JSON.stringify(state.closures));
  localStorage.setItem("brinka_settings", JSON.stringify(state.settings));
}

async function initFirebase() {
  if (!window.BRINKA_FIREBASE_ENABLED) return;

  try {
    const app = initializeApp(window.BRINKA_FIREBASE_CONFIG);
    state.db = getFirestore(app);
    state.firebaseReady = true;
    $("firebaseState").textContent = "Estado: Firebase ativo";
    await syncFromFirebase();
  } catch (err) {
    console.error(err);
    $("firebaseState").textContent = "Estado: erro Firebase, modo local ativo";
  }
}

async function syncFromFirebase() {
  if (!state.firebaseReady) return;
  const q = query(collection(state.db, "brinka_fechos"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  state.closures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  saveLocal();
}

async function saveClosureRemote(data) {
  if (!state.firebaseReady) return null;
  const ref = await addDoc(collection(state.db, "brinka_fechos"), {
    ...data,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

async function deleteClosureRemote(id) {
  if (!state.firebaseReady || !id) return;
  await deleteDoc(doc(state.db, "brinka_fechos", id));
}

function buildRows(containerId, values) {
  const container = $(containerId);
  container.innerHTML = "";

  values.forEach((value) => {
    const row = document.createElement("div");
    row.className = "money-row";
    row.dataset.value = value;

    row.innerHTML = `
      <div class="money-value">${value.toString().replace(".", ",")}€</div>
      <input type="number" min="0" step="1" value="0" inputmode="numeric" aria-label="Quantidade de ${value} euros" />
      <div class="money-subtotal">0,00 €</div>
    `;

    row.querySelector("input").addEventListener("input", calculate);
    container.appendChild(row);
  });
}

function collectRows(selector) {
  return [...document.querySelectorAll(selector)].map(row => {
    const value = Number(row.dataset.value);
    const qty = Number(row.querySelector("input").value || 0);
    return { value, qty, subtotal: value * qty };
  });
}

function calculate() {
  const notes = collectRows("#notesRows .money-row");
  const coins = collectRows("#coinsRows .money-row");

  [...document.querySelectorAll(".money-row")].forEach(row => {
    const value = Number(row.dataset.value);
    const qty = Number(row.querySelector("input").value || 0);
    row.querySelector(".money-subtotal").textContent = eur(value * qty);
  });

  const notesTotal = notes.reduce((sum, r) => sum + r.subtotal, 0);
  const coinsTotal = coins.reduce((sum, r) => sum + r.subtotal, 0);
  const total = notesTotal + coinsTotal;
  const expected = Number($("expectedValue").value || 0);
  const diff = total - expected;

  $("notesTotal").textContent = eur(notesTotal);
  $("coinsTotal").textContent = eur(coinsTotal);
  $("grandTotal").textContent = eur(total);

  const pill = $("diffPill");
  if (!expected) {
    pill.textContent = "Sem esperado";
    pill.style.background = "rgba(148,163,184,.16)";
    pill.style.color = "var(--muted)";
  } else if (Math.abs(diff) < 0.005) {
    pill.textContent = "Certo";
    pill.style.background = "rgba(34,197,94,.14)";
    pill.style.color = "var(--primary)";
  } else if (diff > 0) {
    pill.textContent = `Sobra ${eur(diff)}`;
    pill.style.background = "rgba(34,197,94,.14)";
    pill.style.color = "var(--primary)";
  } else {
    pill.textContent = `Falta ${eur(Math.abs(diff))}`;
    pill.style.background = "rgba(239,68,68,.16)";
    pill.style.color = "#fecaca";
  }

  return { notes, coins, notesTotal, coinsTotal, total, expected, diff };
}

async function saveClosure() {
  const calc = calculate();
  const operator = $("operatorName").value.trim() || "Sem utilizador";

  if (calc.total <= 0) {
    toast("Mete valores antes de guardar");
    return;
  }

  const data = {
    localId: uid(),
    storeName: state.settings.storeName || "Brinka",
    operator,
    dateLabel: nowLabel(),
    isoDate: new Date().toISOString(),
    notes: calc.notes,
    coins: calc.coins,
    notesTotal: calc.notesTotal,
    coinsTotal: calc.coinsTotal,
    total: calc.total,
    expected: calc.expected,
    diff: calc.diff,
    observation: $("notes").value.trim()
  };

  try {
    const remoteId = await saveClosureRemote(data);
    state.closures.unshift({ ...data, id: remoteId || data.localId });
  } catch (err) {
    console.error(err);
    state.closures.unshift({ ...data, id: data.localId });
    toast("Guardado localmente");
  }

  saveLocal();
  renderAll();
  clearForm(false);
  toast("Fecho guardado");
}

function clearForm(showToast = true) {
  document.querySelectorAll(".money-row input").forEach(input => input.value = 0);
  $("expectedValue").value = state.settings.defaultExpected || "";
  $("notes").value = "";
  calculate();
  if (showToast) toast("Fecho limpo");
}

async function deleteClosure(id) {
  state.closures = state.closures.filter(item => (item.id || item.localId) !== id);
  saveLocal();
  try { await deleteClosureRemote(id); } catch {}
  renderAll();
  toast("Fecho apagado");
}

function deleteAll() {
  if (!confirm("Queres mesmo apagar o histórico local?")) return;
  state.closures = [];
  saveLocal();
  renderAll();
  toast("Histórico limpo");
}

function renderDashboard() {
  const today = new Date().toLocaleDateString("pt-PT");
  const todayItems = state.closures.filter(c =>
    new Date(c.isoDate).toLocaleDateString("pt-PT") === today
  );

  const todayTotal = todayItems.reduce((s, c) => s + Number(c.total || 0), 0);
  const todayDiff = todayItems.reduce((s, c) => s + Number(c.diff || 0), 0);

  $("dashTodayTotal").textContent = eur(todayTotal);
  $("dashDiff").textContent = eur(todayDiff);
  $("dashCount").textContent = state.closures.length;
  $("dashLast").textContent = state.closures[0]?.dateLabel || "—";
  $("dashTodayStatus").textContent = todayItems.length
    ? `${todayItems.length} fecho(s) registado(s) hoje`
    : "Sem fechos registados hoje";

  const latest = state.closures.slice(0, 4);
  $("latestList").innerHTML = latest.length ? latest.map(item => `
    <div class="history-item">
      <div class="history-top">
        <strong>${eur(item.total)}</strong>
        <span>${item.diff > 0 ? "Sobra" : item.diff < 0 ? "Falta" : "Certo"}</span>
      </div>
      <div class="history-meta">${item.dateLabel} · ${item.operator || "Sem utilizador"}</div>
    </div>
  `).join("") : `<p class="muted">Ainda não tens fechos guardados.</p>`;
}

function renderHistory() {
  const term = $("searchHistory").value.trim().toLowerCase();
  const items = state.closures.filter(item => {
    const text = `${item.dateLabel} ${item.operator} ${item.total} ${item.observation}`.toLowerCase();
    return text.includes(term);
  });

  $("historyList").innerHTML = items.length ? items.map(item => {
    const id = item.id || item.localId;
    const status = item.diff > 0 ? `Sobra ${eur(item.diff)}` : item.diff < 0 ? `Falta ${eur(Math.abs(item.diff))}` : "Certo";
    return `
      <div class="history-item">
        <div class="history-top">
          <strong>${eur(item.total)}</strong>
          <span>${status}</span>
        </div>
        <div class="history-meta">${item.dateLabel} · ${item.operator || "Sem utilizador"}</div>
        <div class="history-bottom">
          <span class="muted">Esperado: ${eur(item.expected || 0)}</span>
          <button class="delete-one" data-delete="${id}" type="button">Apagar</button>
        </div>
        ${item.observation ? `<p class="muted">${item.observation}</p>` : ""}
      </div>
    `;
  }).join("") : `<p class="muted">Nenhum fecho encontrado.</p>`;

  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => deleteClosure(btn.dataset.delete));
  });
}

function renderSettings() {
  $("storeName").value = state.settings.storeName || "";
  $("defaultExpected").value = state.settings.defaultExpected || "";
  document.body.classList.toggle("light", state.settings.theme === "light");
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderSettings();
}

function saveSettings() {
  state.settings.storeName = $("storeName").value.trim() || "Brinka";
  state.settings.defaultExpected = $("defaultExpected").value;
  $("expectedValue").value = state.settings.defaultExpected || "";
  saveLocal();
  renderAll();
  toast("Configurações guardadas");
}

function switchPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(`page-${page}`).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.nav === page);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindEvents() {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.nav));
  });

  $("expectedValue").addEventListener("input", calculate);
  $("saveBtn").addEventListener("click", saveClosure);
  $("clearBtn").addEventListener("click", () => clearForm(true));
  $("saveSettingsBtn").addEventListener("click", saveSettings);
  $("searchHistory").addEventListener("input", renderHistory);
  $("deleteAllBtn").addEventListener("click", deleteAll);

  $("themeBtn").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    saveLocal();
    renderSettings();
  });
}

async function init() {
  loadLocal();
  buildRows("notesRows", noteValues);
  buildRows("coinsRows", coinValues);
  bindEvents();
  renderAll();
  $("operatorName").value = localStorage.getItem("brinka_last_operator") || "";
  $("operatorName").addEventListener("input", e => localStorage.setItem("brinka_last_operator", e.target.value));
  $("expectedValue").value = state.settings.defaultExpected || "";
  calculate();
  await initFirebase();
  renderAll();
}

init();
