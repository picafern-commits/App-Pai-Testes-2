console.log("[Brinka] login fix loaded");
function loadRememberedEmail() {
  const saved = localStorage.getItem("brinka_remember_email") || "";
  if ($("loginEmail") && saved) $("loginEmail").value = saved;
  if ($("rememberEmail")) $("rememberEmail").checked = Boolean(saved);
}


// ===== ONLINE NÍVEL EMPRESA =====
function getPresenceState(user) {
  if (!user.lastSeenMs) return "offline";
  const diff = Date.now() - user.lastSeenMs;

  if (diff < 15000) return "online";       // ativo agora
  if (diff < 2 * 60 * 1000) return "active"; // ativo recente
  if (diff < 10 * 60 * 1000) return "away";  // ausente
  return "offline";
}

function lastSeenText(user) {
  if (!user.lastSeenMs) return "Nunca online";

  const diff = Date.now() - user.lastSeenMs;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const h = Math.floor(min / 60);

  if (sec < 10) return "Online agora";
  if (sec < 60) return "Ativo há segundos";
  if (min < 60) return `Visto há ${min} min`;
  if (h < 24) return `Visto há ${h}h`;

  return "Offline";
}

async function updateMyPresence(isOnline = true) {
  if (!state.db || !state.user) return;

  try {
    await setDoc(doc(state.db, "users", state.user.uid), {
      lastSeenMs: Date.now(),
      active: isOnline,
      loja: getActiveStoreName(),
      device: navigator.userAgent.includes("Electron") ? "desktop" : "web"
    }, { merge: true });

  } catch (e) {
    console.warn("Presence erro:", e);
  }
}

function startPresenceSystem() {
  updateMyPresence(true);

  if (state.presenceTimer) clearInterval(state.presenceTimer);

  state.presenceTimer = setInterval(() => {
    updateMyPresence(true);
  }, 4000);

  document.addEventListener("visibilitychange", () => {
    updateMyPresence(document.visibilityState === "visible");
  });

  window.addEventListener("beforeunload", () => {
    updateMyPresence(false);
  });
}


// ===== ONLINE DEFINITIVO =====
function isUserOnline(user) {
  if (!user.lastSeenMs) return false;
  const diff = Date.now() - user.lastSeenMs;
  return diff < (5 * 60 * 1000);
}

function lastSeenText(user) {
  if (!user.lastSeenMs) return "Nunca online";
  const diff = Date.now() - user.lastSeenMs;
  const min = Math.floor(diff / 60000);
  if (diff < 10000) return "Online agora";
  if (min < 1) return "Online há segundos";
  if (min < 60) return `Visto há ${min} min`;
  const h = Math.floor(min / 60);
  return `Visto há ${h}h`;
}

async function updateMyPresence(isOnline = true) {
  if (!state.db || !state.user) return;

  try {
    await setDoc(doc(state.db, "users", state.user.uid), {
      online: isOnline,
      lastSeenMs: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });

  } catch (error) {
    console.warn("Erro presence:", error);
  }
}

function startPresenceSystem() {
  updateMyPresence(true);

  if (state.presenceTimer) clearInterval(state.presenceTimer);

  state.presenceTimer = setInterval(() => {
    updateMyPresence(true);
  }, 5000);

  window.addEventListener("beforeunload", () => {
    updateMyPresence(false);
  });
}

console.log("[Brinka] app.js carregado - fix scroll/login");
/* iPhone app total: bloquear zoom/double tap e manter só scroll vertical */
let brinkaLastTouchEnd = 0;

document.addEventListener("touchend", function (event) {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const now = Date.now();
  if (now - brinkaLastTouchEnd <= 300) event.preventDefault();
  brinkaLastTouchEnd = now;
}, { passive: false });

document.addEventListener("gesturestart", event => { if (window.matchMedia("(max-width: 900px)").matches) event.preventDefault(); }, { passive: false });
document.addEventListener("gesturechange", event => { if (window.matchMedia("(max-width: 900px)").matches) event.preventDefault(); }, { passive: false });
document.addEventListener("gestureend", event => { if (window.matchMedia("(max-width: 900px)").matches) event.preventDefault(); }, { passive: false });
document.addEventListener("touchmove", function (event) {
  if (window.matchMedia("(max-width: 900px)").matches && event.touches && event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, setDoc, getDoc, getDocs, serverTimestamp, query, orderBy, onSnapshot, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const noteValues = [500, 200, 100, 50, 20, 10, 5];
const coinValues = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const defaultStoreProfiles = [
  { id: "loja_1", name: "Loja 1" },
  { id: "loja_2", name: "Loja 2" },
  { id: "loja_3", name: "Loja 3" },
  { id: "loja_4", name: "Loja 4" }
];

let storeProfiles = [
  { id: "loja_1", name: "Loja 1" },
  { id: "loja_2", name: "Loja 2" },
  { id: "loja_3", name: "Loja 3" },
  { id: "loja_4", name: "Loja 4" }
];

const SUPER_ADMIN_EMAILS = ["admin-brinka@gmail.com", "pica.fern@gmail.com"];

const state = {
  closures: [],
  settings: { activeStoreId: "loja_1", defaultStore: "Loja 1", defaultExpected: "", theme: "dark" },
  db: null,
  auth: null,
  firebase: false,
  unsubscribe: null,
  user: null,
  profile: null,
  appStarted: false,
  presenceTimer: null,
  usersUnsubscribe: null
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

function isAdmin() {
  return state.profile?.role === "admin" || SUPER_ADMIN_EMAILS.includes(state.user?.email || "");
}

function canManageUsers() {
  return isAdmin();
}

function canDeleteFechos() {
  return ["admin", "gerente", "user"].includes(state.profile?.role) || isAdmin();
}

function canCreateFechos() {
  return ["admin", "gerente", "user"].includes(state.profile?.role) || isAdmin();
}

function getActiveStoreId() {
  if (isAdmin()) return state.settings.activeStoreId || "loja_1";
  return state.profile?.lojaId || "loja_1";
}

function getActiveStoreName() {
  return storeProfiles.find(store => store.id === getActiveStoreId())?.name || "Loja 1";
}

function fechosCollection(db = state.db) {
  return collection(db, "brinka_lojas", getActiveStoreId(), "fechos");
}

function backupDocRef(key) {
  return doc(state.db, "brinka_lojas", getActiveStoreId(), "backups_diarios", key);
}


function lojasConfigDocRef() {
  return doc(state.db, "brinka_config", "lojas");
}

function loadStoreNamesLocal() {
  const saved = JSON.parse(localStorage.getItem("brinka_store_profiles") || "null");
  if (Array.isArray(saved) && saved.length) {
    storeProfiles = defaultStoreProfiles.map(def => {
      const found = saved.find(s => s.id === def.id);
      return found ? { ...def, name: found.name || def.name } : def;
    });
  }
}

function saveStoreNamesLocal() {
  localStorage.setItem("brinka_store_profiles", JSON.stringify(storeProfiles));
}

async function loadStoreNamesRemote() {
  if (!state.db || !state.user) return;
  try {
    const snap = await getDoc(lojasConfigDocRef());
    if (snap.exists() && Array.isArray(snap.data().lojas)) {
      const remote = snap.data().lojas;
      storeProfiles = defaultStoreProfiles.map(def => {
        const found = remote.find(s => s.id === def.id);
        return found ? { ...def, name: found.name || def.name } : def;
      });
      saveStoreNamesLocal();
      renderAll();
    }
  } catch (error) {
    console.warn("Não foi possível carregar nomes das lojas:", error);
  }
}

async function saveStoreNames() {
  if (!isAdmin()) {
    toast("Só admin pode editar nomes das lojas");
    return;
  }

  storeProfiles = defaultStoreProfiles.map(store => ({
    ...store,
    name: $(`storeName_${store.id}`)?.value.trim() || store.name
  }));

  saveStoreNamesLocal();

  try {
    await setDoc(lojasConfigDocRef(), {
      lojas: storeProfiles,
      updatedAt: serverTimestamp(),
      updatedBy: state.user?.email || ""
    }, { merge: true });

    state.settings.defaultStore = getActiveStoreName();
    saveLocal();
    populateStoreSelects();
    populateUserStoreSelect();
    renderAll();
    toast("Nomes das lojas guardados");
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar nomes no Firebase");
  }
}

function renderStoreNameInputs() {
  defaultStoreProfiles.forEach(store => {
    const input = $(`storeName_${store.id}`);
    if (input) {
      input.value = storeProfiles.find(s => s.id === store.id)?.name || store.name;
      input.disabled = !isAdmin();
    }
  });

  const panel = $("storeNamesPanel");
  if (panel) panel.style.display = isAdmin() ? "" : "none";
}

function usersCollection() {
  return collection(state.db, "users");
}

function loadLocal() {
  loadStoreNamesLocal();
  state.settings = {
    ...state.settings,
    ...JSON.parse(localStorage.getItem("brinka_roles_settings") || "{}")
  };
  state.closures = JSON.parse(localStorage.getItem(`brinka_roles_closures_${getActiveStoreId()}`) || "[]");
}

function saveLocal() {
  localStorage.setItem(`brinka_roles_closures_${getActiveStoreId()}`, JSON.stringify(state.closures));
  localStorage.setItem("brinka_roles_settings", JSON.stringify(state.settings));
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

  await setDoc(backupDocRef(key), {
    date: key,
    lojaId: getActiveStoreId(),
    lojaNome: getActiveStoreName(),
    reason,
    updatedAt: serverTimestamp(),
    totalFechos: state.closures.length,
    totalGeral: total,
    totalDiferencas: diff,
    closures: state.closures
  }, { merge: true });

  localStorage.setItem(`brinka_last_backup_day_${getActiveStoreId()}`, key);
}

async function ensureDailyBackup() {
  if (!state.firebase) return;
  const key = todayKey();
  const last = localStorage.getItem(`brinka_last_backup_day_${getActiveStoreId()}`);
  if (last !== key) await createDailyBackup("daily_auto");
}

async function initFirebaseCore() {
  if (!hasValidFirebaseConfig()) {
    setStatus("error", "Firebase sem config", "Login precisa de Firebase");
    if ($("loginError")) $("loginError").textContent = "Firebase não está configurado.";
    return false;
  }

  try {
    const app = initializeApp(window.BRINKA_FIREBASE_CONFIG);
    state.db = getFirestore(app);
    state.auth = getAuth(app);

    try {
      await enableIndexedDbPersistence(state.db);
    } catch (error) {
      console.warn("Persistência offline não ativada:", error.code);
    }

    state.firebase = true;
    return true;
  } catch (error) {
    console.error(error);
    setStatus("error", "Erro Firebase", "Verifica firebase-config.js");
    if ($("loginError")) $("loginError").textContent = "Erro a iniciar Firebase.";
    return false;
  }
}

async function readUserProfile(user) {
  const ref = doc(state.db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (SUPER_ADMIN_EMAILS.includes(user.email || "")) {
      const bootstrapProfile = {
        nome: user.email,
        email: user.email,
        role: "admin",
        lojaId: "loja_1",
        bootstrap: true,
        updatedAt: serverTimestamp()
      };
      await setDoc(ref, bootstrapProfile, { merge: true });
      return bootstrapProfile;
    }

    await signOut(state.auth);
    throw new Error("Este utilizador não tem perfil criado na coleção users.");
  }

  const profile = snap.data();
  if (!profile.role) profile.role = "user";
  if (!profile.lojaId) profile.lojaId = "loja_1";
  return profile;
}

function showLogin(show) {
  if ($("loginScreen")) $("loginScreen").classList.toggle("hidden", !show);
}

function renderUserBadge() {
  const name = state.profile?.nome || state.user?.email || "Utilizador";
  const role = state.profile?.role || "user";
  const loja = isAdmin() ? `Admin · ${getActiveStoreName()}` : getActiveStoreName();

  if ($("userBadge")) {
    $("userBadge").innerHTML = `<span class="role-${role}">${name}</span>&nbsp;· ${loja}`;
  }

  if ($("roleInfo")) {
    $("roleInfo").textContent = `Role: ${role} · Loja: ${loja}`;
  }
}

async function startStoreListener() {
  if (state.unsubscribe) {
    state.unsubscribe();
    state.unsubscribe = null;
  }

  if (!state.firebase || !state.db || !state.user) return;

  setStatus("online", "Firebase ativo", `A carregar ${getActiveStoreName()}...`);

  const q = query(fechosCollection(), orderBy("createdAt", "desc"));
  state.unsubscribe = onSnapshot(q, async (snapshot) => {
    state.closures = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    saveLocal();
    renderAll();
    setStatus("online", "Firebase ativo", `Dados sincronizados · ${getActiveStoreName()}`);
    try { await ensureDailyBackup(); } catch (e) { console.warn("Backup diário falhou:", e); }
  }, (error) => {
    console.error(error);
    setStatus("error", "Erro Firebase", "Sem permissão ou regras incorretas");
  });
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
  if (!state.user) {
    toast("Tens de fazer login");
    return;
  }

  if (!canCreateFechos()) {
    toast("Sem permissão para criar fechos");
    return;
  }

  const calc = calculate();

  if (!validateDiffBeforeSave(calc)) return;

  if (calc.total <= 0) {
    toast("Mete valores antes de guardar");
    return;
  }

  const dateIso = $("closeDate")?.value ? new Date($("closeDate").value).toISOString() : new Date().toISOString();

  const item = {
    localId: makeId(),
    dateIso,
    dateLabel: new Date(dateIso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }),
    lojaId: getActiveStoreId(),
    storeId: getActiveStoreId(),
    store: getActiveStoreName(),
    operator: state.profile?.nome || state.user.email || "Sem utilizador",
    operatorUid: state.user.uid,
    operatorEmail: state.user.email,
    role: state.profile?.role || "user",
    expected: calc.expected,
    diff: calc.diff,
    diffLevel: getDiffLevel(calc.diff),
    diffLabel: getDiffLabel(calc.diff),
    total: calc.total,
    notesTotal: calc.notesTotal,
    coinsTotal: calc.coinsTotal,
    notes: calc.notes,
    coins: calc.coins,
    observation: $("obs")?.value.trim() || ""
  };

  try {
    await addDoc(fechosCollection(), { ...item, createdAt: serverTimestamp() });
    toast("Fecho guardado e sincronizado");
    setTimeout(() => createDailyBackup("after_save").catch(console.warn), 500);
    clearForm(false);
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar. Verifica regras Firebase.");
  }
}

function clearForm(show = true) {
  document.querySelectorAll(".money-row input").forEach(input => input.value = "");
  if ($("store")) $("store").value = getActiveStoreId();
  if ($("expected")) $("expected").value = state.settings.defaultExpected || "";
  if ($("obs")) $("obs").value = "";
  setNowDate();
  calculate();
  if (show) toast("Formulário limpo");
}

async function deleteClosure(id) {
  if (!state.user) return;
  if (!canDeleteFechos()) { toast("Sem permissão"); return; }

  try {
    await deleteDoc(doc(state.db, "brinka_lojas", getActiveStoreId(), "fechos", id));
    setTimeout(() => createDailyBackup("after_delete").catch(console.warn), 500);
    toast("Fecho apagado");
  } catch (error) {
    console.error(error);
    toast("Erro ao apagar. Verifica permissões.");
  }
}



function onlineLimitMs() {
  return 5 * 60 * 1000;
}

function readLastSeenMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}


async }

function startPresenceHeartbeat() {
  if (state.presenceTimer) clearInterval(state.presenceTimer);
    if (state.usersUnsubscribe) state.usersUnsubscribe();
    state.usersUnsubscribe = null;

  updateMyPresence(true);
  state.presenceTimer = setInterval(() => {
    updateMyPresence(true);
    if (isAdmin() && $("usersList")) loadUsers();
  }, 15000);

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") updateMyPresence(true);
    else updateMyPresence(false);
  });

  window.addEventListener("beforeunload", () => {
    updateMyPresence(false);
  });
}

function renderAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden-admin", !isAdmin());
  });

  document.querySelectorAll(".admin-page").forEach(el => {
    el.classList.toggle("hidden-admin", !isAdmin());
  });

  if (!isAdmin() && document.querySelector("#page-config.active")) {
    switchPage("dashboard");
  }
}

function populateUserStoreSelect() {
  const select = $("userStore");
  if (!select) return;
  select.innerHTML = storeProfiles.map(store => `<option value="${store.id}">${store.name}</option>`).join("");
}

function clearUserForm() {
  if ($("userUid")) $("userUid").value = "";
  if ($("userName")) $("userName").value = "";
  if ($("userEmail")) $("userEmail").value = "";
  if ($("userRole")) $("userRole").value = "user";
  if ($("userStore")) $("userStore").value = "loja_1";
}


function startUsersOnlineListener() {
  if (!isAdmin() || !state.db) return;

  if (state.usersUnsubscribe) {
    state.usersUnsubscribe();
    state.usersUnsubscribe = null;
  }

  state.usersUnsubscribe = onSnapshot(usersCollection(), (snap) => {
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderUsersList(users);
  }, (error) => {
    console.error("Erro realtime users:", error);
    if ($("usersList")) $("usersList").innerHTML = `<p class="muted">Erro ao carregar utilizadores. Verifica regras Firebase.</p>`;
  });
}

function renderUsersList(users) {
  const onlineCount = users.filter(isUserOnline).length;
  if ($("onlineSummary")) $("onlineSummary").textContent = `Online: ${onlineCount}`;

  if (!$("usersList")) return;

  $("usersList").innerHTML = users.map(user => {
    const lojaName = storeProfiles.find(s => s.id === user.lojaId)?.name || user.lojaId || "—";
    const statePresence = getPresenceState(user);
    const lastSeenLabel = readLastSeenMs(user.lastSeen)
      ? new Date(readLastSeenMs(user.lastSeen)).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })
      : "Nunca";

    return `
      <div class="user-card">
        <div class="user-card-top">
          <div>
            <strong>${user.nome || "Sem nome"}</strong><br>
            <small>${user.email || "Sem email"}</small><br>
            <small>UID: ${user.uid}</small>
          </div>
          <span class="pill">${user.role || "user"}</span>
        </div>

        <div class="user-chip-row">
          <span class="user-chip ${online ? "online" : "offline"}">${lastSeenText(user)}</span>
          <span class="user-chip">Loja: ${lojaName}</span>
          <span class="user-chip">${user.ativo === false ? "Bloqueado" : "Ativo"}</span>
          <span class="user-chip">Visto: ${lastSeenLabel}</span>
        </div>

        <div class="user-actions">
          <button class="mini-btn" data-edit-user="${user.uid}">Editar</button>
          <button class="mini-btn" data-reset-user="${user.email || ""}">Reset password</button>
          <button class="mini-btn danger" data-delete-user="${user.uid}">Apagar perfil</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="muted">Ainda não existem perfis.</p>`;

  document.querySelectorAll("[data-edit-user]").forEach(btn => {
    btn.addEventListener("click", () => {
      const user = users.find(u => u.uid === btn.dataset.editUser);
      if (!user) return;
      $("userUid").value = user.uid || "";
      $("userName").value = user.nome || "";
      $("userEmail").value = user.email || "";
      $("userRole").value = user.role || "user";
      $("userStore").value = user.lojaId || "loja_1";
      toast("Perfil carregado para edição");
    });
  });

  document.querySelectorAll("[data-reset-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.resetUser;
      if (!email) { toast("Este perfil não tem email"); return; }
      try {
        await sendPasswordResetEmail(state.auth, email);
        toast("Email de reset enviado");
      } catch (error) {
        console.error(error);
        toast("Erro ao enviar reset");
      }
    });
  });

  document.querySelectorAll("[data-delete-user]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Apagar este perfil? O login no Authentication continua a existir.")) return;
      try {
        await deleteDoc(doc(state.db, "users", btn.dataset.deleteUser));
        toast("Perfil apagado");
      } catch (error) {
        console.error(error);
        toast("Erro ao apagar perfil");
      }
    });
  });
}

async function loadUsers() {
  if (!isAdmin() || !state.db) {
    if ($("usersList")) $("usersList").innerHTML = `<p class="muted">Só admin pode gerir utilizadores.</p>`;
    return;
  }

  try {
    const snap = await getDocs(usersCollection());
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderUsersList(users);
  } catch (error) {
    console.error(error);
    if ($("usersList")) $("usersList").innerHTML = `<p class="muted">Erro ao carregar utilizadores. Verifica regras Firebase.</p>`;
  }
}


async function createAuthUserAndFillUid() {
  console.log("[Brinka] Criar login clicado");

  if (!canManageUsers()) {
    toast("Só admin pode criar logins");
    return;
  }

  const email = $("newAuthEmail")?.value.trim();
  const password = $("newAuthPassword")?.value;

  if (!email || !password || password.length < 6) {
    toast("Mete email e password com mínimo 6 caracteres");
    return;
  }

  let secondaryApp = null;

  try {
    const appName = `brinka-secondary-${Date.now()}`;
    secondaryApp = initializeApp(window.BRINKA_FIREBASE_CONFIG, appName);
    const secondaryAuth = getAuth(secondaryApp);

    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    if ($("userUid")) $("userUid").value = uid;
    if ($("userEmail")) $("userEmail").value = email;
    if ($("userName") && !$("userName").value) $("userName").value = email.split("@")[0];

    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);

    toast("Login criado. Agora guarda o perfil.");
    console.log("[Brinka] Login criado:", uid);
  } catch (error) {
    console.error("[Brinka] Erro ao criar login:", error);

    try {
      if (secondaryApp) await deleteApp(secondaryApp);
    } catch {}

    if (error.code === "auth/email-already-in-use") {
      toast("Email já existe no Authentication");
    } else if (error.code === "auth/weak-password") {
      toast("Password fraca: mínimo 6 caracteres");
    } else if (error.code === "auth/operation-not-allowed") {
      toast("Ativa Email/Password no Firebase Auth");
    } else {
      toast("Erro ao criar login: vê a consola");
    }
  }
}

async function saveUserProfile() {
  if (!canManageUsers()) {
    toast("Só admin pode guardar utilizadores");
    return;
  }

  const uid = $("userUid")?.value.trim();
  const nome = $("userName")?.value.trim();
  const email = $("userEmail")?.value.trim();
  const role = $("userRole")?.value || "user";
  const lojaId = $("userStore")?.value || "loja_1";

  if (!uid || !nome || !email) {
    toast("Preenche UID, nome e email");
    return;
  }

  try {
    await setDoc(doc(state.db, "users", uid), {
      nome,
      email,
      role,
      lojaId,
      ativo: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    toast("Perfil guardado");
    clearUserForm();
    await loadUsers();
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar perfil");
  }
}


function dateKeyFromDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function shortDayLabel(date) {
  return new Date(date).toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", "");
}

function renderSmartDashboard() {
  if (!$("dashboardInteligente")) return;

  const items = state.closures || [];
  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const avg = items.length ? total / items.length : 0;
  const okCount = items.filter(item => Math.abs(Number(item.diff || 0)) < 0.005 && Number(item.expected || 0) > 0).length;
  const okRate = items.length ? Math.round((okCount / items.length) * 100) : 0;
  const worstDiff = items.reduce((max, item) => Math.max(max, Math.abs(Number(item.diff || 0))), 0);

  const today = new Date().toLocaleDateString("pt-PT");
  const todayItems = items.filter(item => item.dateIso && new Date(item.dateIso).toLocaleDateString("pt-PT") === today);
  const todayTotal = todayItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const todayVsAvg = avg > 0 ? Math.round(((todayTotal - avg) / avg) * 100) : 0;

  $("smartAvg").textContent = eur(avg);
  $("smartWorstDiff").textContent = eur(worstDiff);
  $("smartOkRate").textContent = `${okRate}%`;
  $("smartTodayVsAvg").textContent = `${todayVsAvg > 0 ? "+" : ""}${todayVsAvg}%`;

  const health = $("dashHealth");
  if (health) {
    if (!items.length) {
      health.textContent = "Sem dados";
      health.style.background = "rgba(255,149,0,.15)";
      health.style.color = "#ffd7a0";
    } else if (okRate >= 85 && worstDiff <= 5) {
      health.textContent = "Saudável";
      health.style.background = "rgba(49,210,124,.16)";
      health.style.color = "#9ff2c5";
    } else if (worstDiff > 20) {
      health.textContent = "Atenção";
      health.style.background = "rgba(255,92,114,.16)";
      health.style.color = "#ffd0d7";
    } else {
      health.textContent = "Normal";
      health.style.background = "rgba(255,149,0,.15)";
      health.style.color = "#ffd7a0";
    }
  }

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKeyFromDate(d);
    const dayItems = items.filter(item => item.dateIso && dateKeyFromDate(item.dateIso) === key);
    const dayTotal = dayItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    days.push({ label: shortDayLabel(d), total: dayTotal });
  }

  const maxDay = Math.max(1, ...days.map(d => d.total));
  const total7 = days.reduce((sum, d) => sum + d.total, 0);
  if ($("chartTotal7")) $("chartTotal7").textContent = eur(total7);

  if ($("weekChart")) {
    $("weekChart").innerHTML = days.map(day => {
      const pct = Math.max(4, Math.round((day.total / maxDay) * 100));
      return `<div class="bar-day" title="${day.label}: ${eur(day.total)}"><div class="bar-track"><div class="bar-fill" style="height:${pct}%"></div></div><div class="bar-label">${day.label}</div></div>`;
    }).join("");
  }

  const insights = [];
  if (!items.length) {
    insights.push({ emoji: "ℹ️", text: "Ainda não existem dados suficientes para gerar análise inteligente." });
  } else {
    const diffItems = items.filter(item => Math.abs(Number(item.diff || 0)) >= 0.005);
    insights.push(diffItems.length
      ? { emoji: "⚠️", text: `${diffItems.length} fecho(s) tiveram diferença de caixa. Vale a pena rever o histórico.` }
      : { emoji: "✅", text: "Todos os fechos registados estão certos ou sem diferença relevante." }
    );
    insights.push(todayItems.length
      ? { emoji: "📌", text: `Hoje tens ${todayItems.length} fecho(s), com total de ${eur(todayTotal)}.` }
      : { emoji: "📌", text: "Ainda não existe fecho registado hoje nesta loja." }
    );
    if (worstDiff > 0) insights.push({ emoji: "🔎", text: `A maior diferença encontrada foi ${eur(worstDiff)}.` });
    if (total7 > 0) insights.push({ emoji: "📈", text: `Nos últimos 7 dias foram registados ${eur(total7)} nesta loja.` });
  }

  if ($("smartInsights")) {
    $("smartInsights").innerHTML = insights.slice(0, 4).map(item => `<div class="insight-item"><div class="emoji">${item.emoji}</div><p>${item.text}</p></div>`).join("");
  }
}


function getDiffLevel(diff) {
  const value = Math.abs(Number(diff || 0));
  if (value < 0.005) return "ok";
  if (value <= 5) return "warning";
  return "danger";
}

function getDiffLabel(diff) {
  const level = getDiffLevel(diff);
  if (level === "ok") return "Certo";
  if (level === "warning") return "Diferença pequena";
  return "Diferença grave";
}

function validateDiffBeforeSave(calc) {
  const diffAbs = Math.abs(Number(calc.diff || 0));
  const obs = $("obs")?.value.trim() || "";

  if (diffAbs >= 0.005 && obs.length < 3) {
    toast("Tens diferença de caixa. Mete uma observação antes de guardar.");
    if ($("obs")) {
      $("obs").focus();
      $("obs").style.borderColor = "rgba(255,92,114,.75)";
      $("obs").style.boxShadow = "0 0 0 4px rgba(255,92,114,.12)";
    }
    return false;
  }

  if ($("obs")) {
    $("obs").style.borderColor = "";
    $("obs").style.boxShadow = "";
  }

  if (diffAbs > 20 && !confirm(`Diferença grave de ${eur(diffAbs)}. Queres mesmo guardar este fecho?`)) {
    return false;
  }

  return true;
}

async function renderMultiLojaResumo() {
  if (!$("multiStoreGrid") || !isAdmin() || !state.db) return;

  try {
    const cards = [];

    for (const store of storeProfiles) {
      const snap = await getDocs(collection(state.db, "brinka_lojas", store.id, "fechos"));
      const items = snap.docs.map(d => d.data());

      const today = new Date().toLocaleDateString("pt-PT");
      const todayItems = items.filter(item => item.dateIso && new Date(item.dateIso).toLocaleDateString("pt-PT") === today);

      const totalHoje = todayItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
      const diffHoje = todayItems.reduce((sum, item) => sum + Number(item.diff || 0), 0);
      const erros = items.filter(item => Math.abs(Number(item.diff || 0)) >= 0.005).length;

      cards.push(`
        <div class="store-summary-card">
          <h4>${store.name}</h4>
          <strong>${eur(totalHoje)}</strong>
          <div class="store-summary-line"><span>Fechos hoje</span><b>${todayItems.length}</b></div>
          <div class="store-summary-line"><span>Diferença hoje</span><b class="${getDiffLevel(diffHoje) === "danger" ? "diff-danger" : getDiffLevel(diffHoje) === "warning" ? "diff-warning" : "diff-ok"}">${eur(diffHoje)}</b></div>
          <div class="store-summary-line"><span>Fechos com diferença</span><b>${erros}</b></div>
        </div>
      `);
    }

    $("multiStoreGrid").innerHTML = cards.join("");
  } catch (error) {
    console.error(error);
    $("multiStoreGrid").innerHTML = `<p class="muted">Não foi possível carregar o resumo multi-loja. Verifica permissões Firebase.</p>`;
  }
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
  if ($("todaySubtitle")) $("todaySubtitle").textContent = todayItems.length ? `${todayItems.length} fecho(s) hoje · ${getActiveStoreName()}` : `Sem fechos hoje · ${getActiveStoreName()}`;
  if ($("totalClosures")) $("totalClosures").textContent = state.closures.length;
  if ($("lastClosure")) $("lastClosure").textContent = state.closures[0]?.dateLabel || "—";
  if ($("bestClosure")) $("bestClosure").textContent = eur(best);
  if ($("allTimeTotal")) $("allTimeTotal").textContent = eur(allTotal);
  if ($("avgClosure")) $("avgClosure").textContent = eur(avg);

  if ($("recentClosures")) {
    $("recentClosures").innerHTML = state.closures.slice(0, 6).map(item => `
      <div class="list-item">
        <div><strong>${eur(item.total)}</strong><br><span class="muted">${item.dateLabel} · ${item.operator || "Sem utilizador"}</span></div>
        <div style="text-align:right"><b>${getDiffLabel(item.diff)}</b><br><span class="muted">${eur(item.diff)}</span></div>
      </div>
    `).join("") || `<p class="muted">Ainda não existem fechos guardados nesta loja.</p>`;
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
        <td>${item.store || getActiveStoreName()}</td>
        <td>${item.operator || "—"}</td>
        <td><b>${eur(item.total)}</b></td>
        <td>${eur(item.expected)}</td>
        <td><span class="diff-badge ${getDiffLevel(item.diff)}">${eur(item.diff)} · ${getDiffLabel(item.diff)}</span></td>
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
        <div><strong>${getActiveStoreName()}</strong><br><span class="muted">${item.dateLabel} · ${item.operator || "Sem utilizador"}</span></div>
        <div style="text-align:right"><b>${eur(item.total)}</b><br><span class="muted">${eur(item.diff)}</span></div>
      </div>
    `).join("") || `<p class="muted">Sem dados para relatório nesta loja.</p>`;
  }
}

function populateStoreSelects() {
  const activeSelect = $("activeStore");
  const storeSelect = $("store");
  const options = storeProfiles.map(store => `<option value="${store.id}">${store.name}</option>`).join("");

  if (activeSelect) {
    activeSelect.innerHTML = options;
    activeSelect.value = getActiveStoreId();
    activeSelect.disabled = !isAdmin();
  }

  if (storeSelect) {
    storeSelect.innerHTML = options;
    storeSelect.value = getActiveStoreId();
    storeSelect.disabled = !isAdmin();
  }
}

function renderSettings() {
  populateStoreSelects();
  if ($("defaultStore")) $("defaultStore").value = getActiveStoreName();
  if ($("defaultStore")) $("defaultStore").disabled = true;
  if ($("defaultExpected")) $("defaultExpected").value = state.settings.defaultExpected || "";
  document.body.classList.toggle("light", state.settings.theme === "light");
  renderUserBadge();
  renderStoreNameInputs();
}

function renderAll() {
  renderDashboard();
  renderMultiLojaResumo();
  renderSmartDashboard();
  renderHistory();
  renderReports();
  renderSettings();
  renderAdminVisibility();
  populateUserStoreSelect();
}

function switchPage(page) {
  if (page === "config" && !isAdmin()) {
    toast("Só admin pode abrir configurações");
    return;
  }

  if (page === "users" && !canManageUsers()) {
    toast("Só admin pode abrir gestão de utilizadores");
    return;
  }
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  if ($(`page-${page}`)) $(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === page));

  const titles = {
    dashboard: ["Dashboard", "Resumo da Caixa"],
    fecho: ["Fecho de Caixa", "Novo Fecho"],
    historico: ["Histórico", "Registos Guardados"],
    relatorios: ["Relatórios", "Análise de Fechos"],
    config: ["Configurações", "Preferências"],
    users: ["Utilizadores", "Gestão de Acessos"]
  };

  if ($("pageKicker")) $("pageKicker").textContent = titles[page]?.[0] || "Brinka";
  if ($("pageTitle")) $("pageTitle").textContent = titles[page]?.[1] || "Fecho de Caixa";
  if ($("sidebar")) $("sidebar").classList.remove("open");
  if ($("overlay")) $("overlay").classList.remove("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function changeActiveStore(storeId) {
  if (!isAdmin()) {
    toast("Só admin pode trocar de loja");
    populateStoreSelects();
    return;
  }

  state.settings.activeStoreId = storeId || "loja_1";
  state.settings.defaultStore = getActiveStoreName();
  saveLocal();
  state.closures = JSON.parse(localStorage.getItem(`brinka_roles_closures_${getActiveStoreId()}`) || "[]");
  renderAll();
  await startStoreListener();
    startPresenceSystem();
    if (isAdmin()) startUsersOnlineListener();
  toast(`Loja ativa: ${getActiveStoreName()}`);
}

function saveSettings() {
  state.settings.defaultExpected = $("defaultExpected")?.value || "";
  saveLocal();
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
  link.download = `brinka-${getActiveStoreId()}-historico.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function doLogin() {
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    if ($("loginError")) $("loginError").textContent = "Mete email e password.";
    return;
  }

  if ($("rememberEmail")) {
    if ($("rememberEmail").checked) localStorage.setItem("brinka_remember_email", email);
    else localStorage.removeItem("brinka_remember_email");
  }

  if ($("loginError")) $("loginError").textContent = "A entrar...";

  try {
    await signInWithEmailAndPassword(state.auth, email, password);
  } catch (error) {
    console.error("[Brinka] Erro login:", error);
    if ($("loginError")) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
        $("loginError").textContent = "Email ou password inválidos.";
      } else if (error.code === "auth/too-many-requests") {
        $("loginError").textContent = "Demasiadas tentativas. Tenta mais tarde.";
      } else {
        $("loginError").textContent = "Erro no login. Verifica Firebase/Auth.";
      }
    }
  }
}

async function doLogout() {
  try {
    await updateMyPresence(false);
    if (state.presenceTimer) clearInterval(state.presenceTimer);
    if (state.usersUnsubscribe) state.usersUnsubscribe();
    state.usersUnsubscribe = null;
    state.presenceTimer = null;
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = null;
    await signOut(state.auth);
    state.user = null;
    state.profile = null;
    state.closures = [];
    renderAll();
    showLogin(true);
    setStatus("local", "Sessão terminada", "Faz login para sincronizar");
  } catch (error) {
    console.error(error);
  }
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

  if ($("logoutBtn")) $("logoutBtn").addEventListener("click", doLogout);
  if ($("loginBtn")) $("loginBtn").addEventListener("click", doLogin);
  if ($("loginPassword")) $("loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });

  if ($("expected")) $("expected").addEventListener("input", calculate);
  if ($("saveClosure")) $("saveClosure").addEventListener("click", saveClosure);
  if ($("clearForm")) $("clearForm").addEventListener("click", () => clearForm(true));
  if ($("search")) $("search").addEventListener("input", renderHistory);
  if ($("statusFilter")) $("statusFilter").addEventListener("change", renderHistory);
  if ($("saveSettings")) $("saveSettings").addEventListener("click", saveSettings);
  if ($("saveStoreNames")) $("saveStoreNames").addEventListener("click", saveStoreNames);
  if ($("exportCsv")) $("exportCsv").addEventListener("click", exportCsv);

  if ($("saveUserProfile")) $("saveUserProfile").addEventListener("click", saveUserProfile);
  if ($("clearUserForm")) $("clearUserForm").addEventListener("click", clearUserForm);
  if ($("refreshUsers")) $("refreshUsers").addEventListener("click", loadUsers);
  const createAuthUserBtn = $("createAuthUserBtn");
  if (createAuthUserBtn) {
    createAuthUserBtn.addEventListener("click", createAuthUserAndFillUid);
  }
  if ($("createAuthUserBtn")) $("createAuthUserBtn").addEventListener("click", createAuthUserAndFillUid);


  if ($("store")) $("store").addEventListener("change", () => changeActiveStore($("store").value));
  if ($("activeStore")) $("activeStore").addEventListener("change", () => changeActiveStore($("activeStore").value));

  if ($("clearHistory")) $("clearHistory").addEventListener("click", () => {
    if (!confirm("Apagar apenas a cópia local? No Firebase os dados continuam.")) return;
    state.closures = [];
    saveLocal();
    renderAll();
    toast("Cópia local limpa");
  });
}

async function afterLogin(user) {
  state.user = user;
  try {
    state.profile = await readUserProfile(user);

    if (!isAdmin()) {
      state.settings.activeStoreId = state.profile.lojaId || "loja_1";
    } else {
      state.settings.activeStoreId = state.settings.activeStoreId || state.profile.lojaId || "loja_1";
    }

    state.settings.defaultStore = getActiveStoreName();
    saveLocal();

    if ($("operator")) $("operator").value = state.profile.nome || user.email || "";
    if ($("store")) $("store").value = getActiveStoreId();

    showLogin(false);
    await loadStoreNamesRemote();
    renderAll();
    await startStoreListener();
    if (canManageUsers()) await loadUsers();
    toast(`Bem-vindo, ${state.profile.nome || user.email}`);
  } catch (error) {
    console.error(error);
    if ($("loginError")) $("loginError").textContent = error.message || "Perfil não encontrado.";
    showLogin(true);
  }
}

async function init() {
  loadLocal();
  buildMoneyRows("notesRows", noteValues);
  buildMoneyRows("coinsRows", coinValues);
  bindEvents();
  loadRememberedEmail();

  setNowDate();
  calculate();
  renderAll();

  const ok = await initFirebaseCore();
  if (!ok) {
    showLogin(true);
    return;
  }

  onAuthStateChanged(state.auth, async (user) => {
    if (user) {
      await afterLogin(user);
    } else {
      showLogin(true);
      setStatus("local", "Sem login", "Entra para sincronizar por loja");
    }
  });
}

init();


document.addEventListener("click", (event) => {
  const btn = event.target.closest?.("#createAuthUserBtn");
  if (btn) {
    event.preventDefault();
    createAuthUserAndFillUid();
  }
});

