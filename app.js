import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

console.log("[Brinka] app.js limpo carregado");

const noteValues = [500, 200, 100, 50, 20, 10, 5];
const coinValues = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

const defaultStoreProfiles = [
  { id: "loja_1", name: "Loja 1" },
  { id: "loja_2", name: "Loja 2" },
  { id: "loja_3", name: "Loja 3" },
  { id: "loja_4", name: "Loja 4" }
];

let storeProfiles = [...defaultStoreProfiles];

const SUPER_ADMIN_EMAILS = ["admin-brinka@gmail.com", "pica.fern@gmail.com"];

const state = {
  closures: [],
  settings: { activeStoreId: "loja_1", defaultExpected: "", theme: "dark" },
  db: null,
  auth: null,
  firebase: false,
  unsubscribe: null,
  usersUnsubscribe: null,
  activityRefreshTimer: null,
  presenceTimer: null,
  user: null,
  profile: null
};

const $ = (id) => document.getElementById(id);

function eur(value) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function makeId() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function toast(text) {
  const el = $("toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2300);
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

function showLogin(show) {
  if ($("loginScreen")) $("loginScreen").classList.toggle("hidden", !show);
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

function canCreateFechos() {
  return ["admin", "gerente", "user"].includes(state.profile?.role) || isAdmin();
}

function canDeleteFechos() {
  return ["admin", "gerente", "user"].includes(state.profile?.role) || isAdmin();
}

function getActiveStoreId() {
  if (isAdmin()) return state.settings.activeStoreId || state.profile?.lojaId || "loja_1";
  return state.profile?.lojaId || "loja_1";
}

function getActiveStoreName() {
  return storeProfiles.find(s => s.id === getActiveStoreId())?.name || "Loja 1";
}

function fechosCollection() {
  return collection(state.db, "brinka_lojas", getActiveStoreId(), "fechos");
}

function backupDocRef(key) {
  return doc(state.db, "brinka_lojas", getActiveStoreId(), "backups_diarios", key);
}

function usersCollection() {
  return collection(state.db, "users");
}

function lojasConfigDocRef() {
  return doc(state.db, "brinka_config", "lojas");
}

function loadLocal() {
  try {
    const savedStores = JSON.parse(localStorage.getItem("brinka_store_profiles") || "null");
    if (Array.isArray(savedStores)) {
      storeProfiles = defaultStoreProfiles.map(def => {
        const found = savedStores.find(s => s.id === def.id);
        return found ? { ...def, name: found.name || def.name } : def;
      });
    }
    state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem("brinka_settings") || "{}") };
  } catch {}
}

function saveLocal() {
  localStorage.setItem("brinka_settings", JSON.stringify(state.settings));
  localStorage.setItem("brinka_store_profiles", JSON.stringify(storeProfiles));
}

async function initFirebaseCore() {
  if (!hasValidFirebaseConfig()) {
    setStatus("error", "Firebase sem config", "Verifica firebase-config.js");
    if ($("loginError")) $("loginError").textContent = "Firebase não está configurado.";
    return false;
  }

  try {
    const app = initializeApp(window.BRINKA_FIREBASE_CONFIG);
    state.db = getFirestore(app);
    state.auth = getAuth(app);
    await setPersistence(state.auth, browserSessionPersistence);
    try { await enableIndexedDbPersistence(state.db); } catch {}
    state.firebase = true;
    return true;
  } catch (error) {
    console.error("[Brinka] Firebase init:", error);
    setStatus("error", "Erro Firebase", "Verifica configuração");
    if ($("loginError")) $("loginError").textContent = "Erro a iniciar Firebase.";
    return false;
  }
}

function loadRememberedEmail() {
  const saved = localStorage.getItem("brinka_remember_email") || "";
  if ($("loginEmail") && saved) $("loginEmail").value = saved;
  if ($("rememberEmail")) $("rememberEmail").checked = Boolean(saved);
}

async function doLogin() {
  const email = $("loginEmail")?.value.trim() || "";
  const password = $("loginPassword")?.value || "";
  const err = $("loginError");

  if (!email || !password) {
    if (err) err.textContent = "Mete email e password.";
    return;
  }

  if ($("rememberEmail")) {
    if ($("rememberEmail").checked) localStorage.setItem("brinka_remember_email", email);
    else localStorage.removeItem("brinka_remember_email");
  }

  if (err) err.textContent = "A entrar...";

  try {
    if (!state.auth) {
      if (err) err.textContent = "Firebase ainda não carregou. Recarrega a página.";
      return;
    }
    await signInWithEmailAndPassword(state.auth, email, password);
  } catch (error) {
    console.error("[Brinka] Erro login:", error);
    if (!err) return;
    if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error.code)) {
      err.textContent = "Email ou password inválidos.";
    } else if (error.code === "auth/too-many-requests") {
      err.textContent = "Demasiadas tentativas. Tenta mais tarde.";
    } else {
      err.textContent = "Erro no login: " + (error.code || "Firebase");
    }
  }
}

async function readUserProfile(user) {
  const ref = doc(state.db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (SUPER_ADMIN_EMAILS.includes(user.email || "")) {
      const bootstrapProfile = {
        nome: "Admin",
        email: user.email,
        role: "admin",
        lojaId: "loja_1",
        updatedAt: Date.now()
      };
      await setDoc(ref, bootstrapProfile, { merge: true });
      return bootstrapProfile;
    }
    await signOut(state.auth);
    throw new Error("Este utilizador não tem perfil criado na coleção users.");
  }

  const profile = snap.data();
  return {
    nome: profile.nome || user.email,
    email: profile.email || user.email,
    role: profile.role || "user",
    lojaId: profile.lojaId || "loja_1",
    ...profile
  };
}

async function afterLogin(user) {
  state.user = user;
  try {
    state.profile = await readUserProfile(user);

    if (!isAdmin()) state.settings.activeStoreId = state.profile.lojaId || "loja_1";
    else state.settings.activeStoreId = state.settings.activeStoreId || state.profile.lojaId || "loja_1";

    saveLocal();
    if ($("operator")) $("operator").value = state.profile.nome || user.email;
    showLogin(false);
    if ($("loginError")) $("loginError").textContent = "";

    await loadStoreNamesRemote();
    renderAll();
    await startStoreListener();
    startPresenceSystem();
    if (isAdmin()) {
      startUsersOnlineListener();
      startActivityRefresh();
    }

    toast(`Bem-vindo, ${state.profile.nome || user.email}`);
  } catch (error) {
    console.error("[Brinka] afterLogin:", error);
    if ($("loginError")) $("loginError").textContent = error.message || "Perfil não encontrado.";
    showLogin(true);
  }
}

async function doLogout() {
  try {
    await updateMyPresence(false);
    if (state.unsubscribe) state.unsubscribe();
    if (state.usersUnsubscribe) state.usersUnsubscribe();
    if (state.presenceTimer) clearInterval(state.presenceTimer);

    state.unsubscribe = null;
    state.usersUnsubscribe = null;
    state.presenceTimer = null;
    state.user = null;
    state.profile = null;
    state.closures = [];

    await signOut(state.auth);
    showLogin(true);
    renderAll();
    setStatus("local", "Sem login", "Entra para sincronizar");
  } catch (error) {
    console.error(error);
  }
}

function isUserOnline(user) {
  return Boolean(user?.lastSeenMs) && (Date.now() - Number(user.lastSeenMs)) < (2 * 60 * 1000);
}

function lastSeenText(user) {
  if (!user?.lastSeenMs) return "Nunca online";

  const diff = Math.max(0, Date.now() - Number(user.lastSeenMs));
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);

  if (sec < 20) return "Online agora";
  if (min < 2) return "Ativo agora";
  if (min < 10) return `Ausente há ${min} min`;
  if (min < 60) return `Visto há ${min} min`;
  if (hours < 24) return `Visto há ${hours}h`;
  return `Visto há ${days}d`;
}

function presenceClass(user) {
  if (!user?.lastSeenMs) return "offline";

  const diff = Date.now() - Number(user.lastSeenMs);

  if (diff < 20 * 1000) return "online";
  if (diff < 2 * 60 * 1000) return "active";
  if (diff < 10 * 60 * 1000) return "away";
  return "offline";
}

async function updateMyPresence(isOnline = true) {
  if (!state.db || !state.user) return;

  const activePage = document.querySelector(".page.active")?.id?.replace("page-", "") || "dashboard";
  const device = /iPhone|iPad|Android/i.test(navigator.userAgent)
    ? "mobile"
    : "desktop/web";

  try {
    await setDoc(doc(state.db, "users", state.user.uid), {
      online: isOnline,
      lastSeenMs: Date.now(),
      updatedAt: Date.now(),
      currentLojaId: getActiveStoreId(),
      currentLojaName: getActiveStoreName(),
      currentPage: activePage,
      device
    }, { merge: true });
  } catch (error) {
    console.warn("[Brinka] Presence erro:", error);
  }
}

function startPresenceSystem() {
  updateMyPresence(true);
  if (state.presenceTimer) clearInterval(state.presenceTimer);
  state.presenceTimer = setInterval(() => updateMyPresence(true), 5000);
  window.addEventListener("beforeunload", () => updateMyPresence(false), { once: true });
}

async function loadStoreNamesRemote() {
  if (!state.db) return;
  try {
    const snap = await getDoc(lojasConfigDocRef());
    if (snap.exists() && Array.isArray(snap.data().lojas)) {
      const remote = snap.data().lojas;
      storeProfiles = defaultStoreProfiles.map(def => {
        const found = remote.find(s => s.id === def.id);
        return found ? { ...def, name: found.name || def.name } : def;
      });
      saveLocal();
    }
  } catch (error) {
    console.warn("[Brinka] lojas config:", error);
  }
}

async function saveStoreNames() {
  if (!isAdmin()) {
    toast("Só admin pode editar lojas");
    return;
  }

  storeProfiles = defaultStoreProfiles.map(s => ({
    ...s,
    name: $(`storeName_${s.id}`)?.value.trim() || s.name
  }));

  saveLocal();

  try {
    await setDoc(lojasConfigDocRef(), {
      lojas: storeProfiles,
      updatedAt: Date.now(),
      updatedBy: state.user?.email || ""
    }, { merge: true });
    populateStoreSelects();
    populateUserStoreSelect();
    renderAll();
    toast("Nomes das lojas guardados");
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar lojas");
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

async function createDailyBackup(reason = "auto") {
  if (!state.db) return;
  try {
    const key = todayKey();
    const total = state.closures.reduce((sum, i) => sum + Number(i.total || 0), 0);
    const diff = state.closures.reduce((sum, i) => sum + Number(i.diff || 0), 0);
    await setDoc(backupDocRef(key), {
      date: key,
      reason,
      lojaId: getActiveStoreId(),
      lojaNome: getActiveStoreName(),
      updatedAt: Date.now(),
      totalFechos: state.closures.length,
      totalGeral: total,
      totalDiferencas: diff,
      closures: state.closures
    }, { merge: true });
  } catch (error) {
    console.warn("[Brinka] backup:", error);
  }
}

async function startStoreListener() {
  if (state.unsubscribe) state.unsubscribe();
  if (!state.db || !state.user) return;

  setStatus("online", "Firebase ativo", `A carregar ${getActiveStoreName()}...`);

  const q = query(fechosCollection(), orderBy("createdAt", "desc"));
  state.unsubscribe = onSnapshot(q, (snap) => {
    state.closures = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    setStatus("online", "Firebase ativo", `Dados sincronizados · ${getActiveStoreName()}`);
    createDailyBackup("auto").catch(console.warn);
  }, (error) => {
    console.error("[Brinka] listener:", error);
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

  target.querySelectorAll("input").forEach(i => i.addEventListener("input", calculate));
}

function collectRows(selector) {
  return [...document.querySelectorAll(selector)].map(row => {
    const value = Number(row.dataset.value);
    const qty = Number(row.querySelector("input").value || 0);
    const subtotal = value * qty;
    row.querySelector(".money-sub").textContent = eur(subtotal);
    return { value, qty, subtotal };
  });
}

function calculate() {
  const notes = collectRows("#notesRows .money-row");
  const coins = collectRows("#coinsRows .money-row");
  const notesTotal = notes.reduce((sum, r) => sum + r.subtotal, 0);
  const coinsTotal = coins.reduce((sum, r) => sum + r.subtotal, 0);
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
    const level = getDiffLevel(diff);
    badge.textContent = expected ? getDiffLabel(diff) : "Sem esperado";
    badge.style.background = level === "danger" ? "rgba(255,92,114,.16)" : level === "warning" ? "rgba(255,149,0,.15)" : "rgba(49,210,124,.16)";
    badge.style.color = level === "danger" ? "#ffd0d7" : level === "warning" ? "#ffd7a0" : "#9ff2c5";
  }

  return { notes, coins, notesTotal, coinsTotal, total, expected, diff };
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
    toast("Tens diferença de caixa. Mete uma observação.");
    $("obs")?.focus();
    return false;
  }

  if (diffAbs > 20 && !confirm(`Diferença grave de ${eur(diffAbs)}. Queres guardar?`)) return false;
  return true;
}

async function saveClosure() {
  if (!state.user) return toast("Tens de fazer login");
  if (!canCreateFechos()) return toast("Sem permissão para criar fechos");

  const calc = calculate();
  if (calc.total <= 0) return toast("Mete valores antes de guardar");
  if (!validateDiffBeforeSave(calc)) return;

  const dateIso = $("closeDate")?.value ? new Date($("closeDate").value).toISOString() : new Date().toISOString();

  const item = {
    localId: makeId(),
    dateIso,
    dateLabel: new Date(dateIso).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }),
    lojaId: getActiveStoreId(),
    store: getActiveStoreName(),
    operator: state.profile?.nome || state.user.email,
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
    observation: $("obs")?.value.trim() || "",
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(fechosCollection(), item);
    clearForm(false);
    toast("Fecho guardado");
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar");
  }
}

function clearForm(show = true) {
  document.querySelectorAll(".money-row input").forEach(i => i.value = "");
  if ($("store")) $("store").value = getActiveStoreId();
  if ($("expected")) $("expected").value = state.settings.defaultExpected || "";
  if ($("obs")) $("obs").value = "";
  setNowDate();
  calculate();
  if (show) toast("Formulário limpo");
}

async function deleteClosure(id) {
  if (!canDeleteFechos()) return toast("Sem permissão");
  try {
    await deleteDoc(doc(state.db, "brinka_lojas", getActiveStoreId(), "fechos", id));
    toast("Fecho apagado");
  } catch (error) {
    console.error(error);
    toast("Erro ao apagar");
  }
}

function renderDashboard() {
  const today = new Date().toLocaleDateString("pt-PT");
  const todayItems = state.closures.filter(i => i.dateIso && new Date(i.dateIso).toLocaleDateString("pt-PT") === today);
  const todayTotal = todayItems.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const todayDiff = todayItems.reduce((sum, i) => sum + Number(i.diff || 0), 0);
  const allTotal = state.closures.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const best = Math.max(0, ...state.closures.map(i => Number(i.total || 0)));
  const avg = state.closures.length ? allTotal / state.closures.length : 0;

  if ($("todayTotal")) $("todayTotal").textContent = eur(todayTotal);
  if ($("todayDiff")) $("todayDiff").textContent = eur(todayDiff);
  if ($("todaySubtitle")) $("todaySubtitle").textContent = `${todayItems.length ? `${todayItems.length} fecho(s) hoje` : "Sem fechos hoje"} · ${getActiveStoreName()}`;
  if ($("totalClosures")) $("totalClosures").textContent = state.closures.length;
  if ($("lastClosure")) $("lastClosure").textContent = state.closures[0]?.dateLabel || "—";
  if ($("bestClosure")) $("bestClosure").textContent = eur(best);
  if ($("allTimeTotal")) $("allTimeTotal").textContent = eur(allTotal);
  if ($("avgClosure")) $("avgClosure").textContent = eur(avg);

  if ($("recentClosures")) {
    $("recentClosures").innerHTML = state.closures.slice(0, 6).map(i => `
      <div class="list-item">
        <div><strong>${eur(i.total)}</strong><br><span class="muted">${i.dateLabel} · ${i.operator || "Sem utilizador"}</span></div>
        <div style="text-align:right"><b>${getDiffLabel(i.diff)}</b><br><span class="muted">${eur(i.diff)}</span></div>
      </div>
    `).join("") || `<p class="muted">Ainda não existem fechos guardados nesta loja.</p>`;
  }

  renderSmartDashboard();
  renderMultiLojaResumo();
}

function dateKeyFromDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function renderSmartDashboard() {
  if (!$("dashboardInteligente")) return;
  const items = state.closures || [];
  const total = items.reduce((sum, i) => sum + Number(i.total || 0), 0);
  const avg = items.length ? total / items.length : 0;
  const okCount = items.filter(i => Math.abs(Number(i.diff || 0)) < 0.005 && Number(i.expected || 0) > 0).length;
  const okRate = items.length ? Math.round((okCount / items.length) * 100) : 0;
  const worstDiff = items.reduce((max, i) => Math.max(max, Math.abs(Number(i.diff || 0))), 0);

  if ($("smartAvg")) $("smartAvg").textContent = eur(avg);
  if ($("smartWorstDiff")) $("smartWorstDiff").textContent = eur(worstDiff);
  if ($("smartOkRate")) $("smartOkRate").textContent = `${okRate}%`;
  if ($("smartTodayVsAvg")) $("smartTodayVsAvg").textContent = "0%";
  if ($("dashHealth")) $("dashHealth").textContent = items.length ? "Ativo" : "Sem dados";

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dateKeyFromDate(d);
    const dayTotal = items.filter(x => x.dateIso && dateKeyFromDate(x.dateIso) === key).reduce((s, x) => s + Number(x.total || 0), 0);
    days.push({ label: d.toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", ""), total: dayTotal });
  }

  const maxDay = Math.max(1, ...days.map(d => d.total));
  const total7 = days.reduce((s, d) => s + d.total, 0);
  if ($("chartTotal7")) $("chartTotal7").textContent = eur(total7);
  if ($("weekChart")) {
    $("weekChart").innerHTML = days.map(day => `<div class="bar-day"><div class="bar-track"><div class="bar-fill" style="height:${Math.max(4, Math.round((day.total / maxDay) * 100))}%"></div></div><div class="bar-label">${day.label}</div></div>`).join("");
  }
  if ($("smartInsights")) {
    $("smartInsights").innerHTML = `<div class="insight-item"><div class="emoji">📌</div><p>${items.length ? `Tens ${items.length} fecho(s) nesta loja.` : "Ainda não existem dados suficientes."}</p></div>`;
  }
}

async function renderMultiLojaResumo() {
  if (!$("multiStoreGrid") || !isAdmin() || !state.db) return;
  try {
    const cards = [];
    for (const store of storeProfiles) {
      const snap = await getDocs(collection(state.db, "brinka_lojas", store.id, "fechos"));
      const items = snap.docs.map(d => d.data());
      const today = new Date().toLocaleDateString("pt-PT");
      const todayItems = items.filter(i => i.dateIso && new Date(i.dateIso).toLocaleDateString("pt-PT") === today);
      const totalHoje = todayItems.reduce((s, i) => s + Number(i.total || 0), 0);
      const diffHoje = todayItems.reduce((s, i) => s + Number(i.diff || 0), 0);
      cards.push(`<div class="store-summary-card"><h4>${store.name}</h4><strong>${eur(totalHoje)}</strong><div class="store-summary-line"><span>Fechos hoje</span><b>${todayItems.length}</b></div><div class="store-summary-line"><span>Diferença hoje</span><b>${eur(diffHoje)}</b></div></div>`);
    }
    $("multiStoreGrid").innerHTML = cards.join("");
  } catch (error) {
    $("multiStoreGrid").innerHTML = `<p class="muted">Erro no resumo multi-loja.</p>`;
  }
}

function renderHistory() {
  if (!$("historyTable")) return;
  const term = $("search")?.value.trim().toLowerCase() || "";
  const filter = $("statusFilter")?.value || "";

  const items = state.closures.filter(i => {
    const text = `${i.dateLabel} ${i.store} ${i.operator} ${i.total}`.toLowerCase();
    const status = getDiffLevel(i.diff) === "ok" ? "certo" : Number(i.diff) > 0 ? "sobra" : "falta";
    return (!term || text.includes(term)) && (!filter || status === filter);
  });

  $("historyTable").innerHTML = items.map(i => `
    <tr>
      <td>${i.dateLabel || "—"}</td>
      <td>${i.store || getActiveStoreName()}</td>
      <td>${i.operator || "—"}</td>
      <td><b>${eur(i.total)}</b></td>
      <td>${eur(i.expected)}</td>
      <td><span class="diff-badge ${getDiffLevel(i.diff)}">${eur(i.diff)} · ${getDiffLabel(i.diff)}</span></td>
      <td><button class="delete-row" data-delete="${i.id || i.localId}">Apagar</button></td>
    </tr>
  `).join("") || `<tr><td colspan="7" class="muted">Sem resultados.</td></tr>`;

  document.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteClosure(b.dataset.delete)));
}

function renderReports() {
  const total = state.closures.reduce((s, i) => s + Number(i.total || 0), 0);
  const diff = state.closures.reduce((s, i) => s + Number(i.diff || 0), 0);
  if ($("reportTotal")) $("reportTotal").textContent = eur(total);
  if ($("reportDiff")) $("reportDiff").textContent = eur(diff);
  if ($("reportMissing")) $("reportMissing").textContent = state.closures.filter(i => Number(i.diff) < -0.005).length;
  if ($("reportOver")) $("reportOver").textContent = state.closures.filter(i => Number(i.diff) > 0.005).length;
  if ($("reportList")) $("reportList").innerHTML = state.closures.slice(0,10).map(i => `<div class="list-item"><div><strong>${getActiveStoreName()}</strong><br><span class="muted">${i.dateLabel} · ${i.operator || "—"}</span></div><div><b>${eur(i.total)}</b><br><span class="muted">${eur(i.diff)}</span></div></div>`).join("") || `<p class="muted">Sem dados.</p>`;
}

function populateStoreSelects() {
  const options = storeProfiles.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  if ($("store")) {
    $("store").innerHTML = options;
    $("store").value = getActiveStoreId();
    $("store").disabled = !isAdmin();
  }
  if ($("activeStore")) {
    $("activeStore").innerHTML = options;
    $("activeStore").value = getActiveStoreId();
    $("activeStore").disabled = !isAdmin();
  }
}

function populateUserStoreSelect() {
  if (!$("userStore")) return;
  $("userStore").innerHTML = storeProfiles.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
}

function renderStoreNameInputs() {
  defaultStoreProfiles.forEach(s => {
    const input = $(`storeName_${s.id}`);
    if (input) {
      input.value = storeProfiles.find(x => x.id === s.id)?.name || s.name;
      input.disabled = !isAdmin();
    }
  });
  if ($("storeNamesPanel")) $("storeNamesPanel").style.display = isAdmin() ? "" : "none";
}

function renderUserBadge() {
  const name = state.profile?.nome || state.user?.email || "—";
  if ($("userBadge")) $("userBadge").innerHTML = `${name} · ${getActiveStoreName()}`;
  if ($("roleInfo")) $("roleInfo").textContent = `Role: ${state.profile?.role || "—"} · Loja: ${getActiveStoreName()}`;
}

function renderAdminVisibility() {
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden-admin", !isAdmin()));
  document.querySelectorAll(".admin-page").forEach(el => el.classList.toggle("hidden-admin", !isAdmin()));
  if (!isAdmin() && document.querySelector("#page-config.active")) switchPage("dashboard");
  if (!isAdmin() && document.querySelector("#page-users.active")) switchPage("dashboard");
}

function renderSettings() {
  populateStoreSelects();
  renderStoreNameInputs();
  if ($("defaultStore")) {
    $("defaultStore").value = getActiveStoreName();
    $("defaultStore").disabled = true;
  }
  if ($("defaultExpected")) $("defaultExpected").value = state.settings.defaultExpected || "";
  document.body.classList.toggle("light", state.settings.theme === "light");
  renderUserBadge();
}

function renderAll() {
  renderDashboard();
  renderHistory();
  renderReports();
  renderSettings();
  renderAdminVisibility();
  populateUserStoreSelect();
}

function switchPage(page) {
  if (page === "config" && !isAdmin()) return toast("Só admin pode abrir configurações");
  if (page === "users" && !isAdmin()) return toast("Só admin pode abrir utilizadores");

  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  $(`page-${page}`)?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));

  const titles = {
    dashboard: ["Dashboard", "Resumo da Caixa"],
    fecho: ["Fecho de Caixa", "Novo Fecho"],
    historico: ["Histórico", "Registos Guardados"],
    relatorios: ["Relatórios", "Análise de Fechos"],
    config: ["Configurações", "Preferências"],
    users: ["Utilizadores", "Gestão de Acessos"]
  };
  if ($("pageKicker")) $("pageKicker").textContent = titles[page]?.[0] || "Brinka";
  if ($("pageTitle")) $("pageTitle").textContent = titles[page]?.[1] || "Brinka";
  updateMyPresence(true).catch(() => {});
  $("sidebar")?.classList.remove("open");
  $("overlay")?.classList.remove("show");
}

async function changeActiveStore(storeId) {
  if (!isAdmin()) return toast("Só admin pode trocar loja");
  state.settings.activeStoreId = storeId || "loja_1";
  saveLocal();
  renderAll();
  await startStoreListener();
  toast(`Loja ativa: ${getActiveStoreName()}`);
}

function saveSettings() {
  state.settings.defaultExpected = $("defaultExpected")?.value || "";
  saveLocal();
  if ($("expected")) $("expected").value = state.settings.defaultExpected;
  calculate();
  toast("Configurações guardadas");
}

function exportCsv() {
  const header = ["Data","Loja","Utilizador","Total","Esperado","Diferenca","Observacoes"];
  const rows = state.closures.map(i => [i.dateLabel,i.store,i.operator,i.total,i.expected,i.diff,i.observation || ""].map(v => `"${String(v).replaceAll('"','""')}"`).join(";"));
  const blob = new Blob([[header.join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `brinka-${getActiveStoreId()}-historico.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}


function startActivityRefresh() {
  if (state.activityRefreshTimer) clearInterval(state.activityRefreshTimer);
  state.activityRefreshTimer = setInterval(() => {
    if (isAdmin() && document.querySelector("#page-users.active")) {
      loadUsers();
    }
  }, 10000);
}

function startUsersOnlineListener() {
  if (!isAdmin() || !state.db) return;
  if (state.usersUnsubscribe) state.usersUnsubscribe();
  state.usersUnsubscribe = onSnapshot(usersCollection(), snap => {
    renderUsersList(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  }, error => {
    console.error(error);
    if ($("usersList")) $("usersList").innerHTML = `<p class="muted">Erro ao carregar utilizadores.</p>`;
  });
}

async function loadUsers() {
  if (!isAdmin() || !state.db) return;
  try {
    const snap = await getDocs(usersCollection());
    renderUsersList(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  } catch (error) {
    console.error(error);
  }
}

function renderUsersList(users) {
  const onlineCount = users.filter(isUserOnline).length;
  if ($("onlineSummary")) $("onlineSummary").textContent = `Online agora: ${onlineCount}`;
  if (!$("usersList")) return;

  $("usersList").innerHTML = users.map(u => {
    const lojaName = storeProfiles.find(s => s.id === u.lojaId)?.name || u.lojaId || "—";
    const pClass = presenceClass(u);
    return `
      <div class="user-card">
        <div class="user-card-top">
          <div>
            <strong>${u.nome || "Sem nome"}</strong><br>
            <small>${u.email || "Sem email"}</small><br>
            <small>UID: ${u.uid}</small>
          </div>
          <span class="pill">${u.role || "user"}</span>
        </div>
        <div class="user-chip-row">
          <span class="user-chip ${pClass}"><span class="${pClass}-dot"></span>${lastSeenText(u)}</span>
          <span class="user-chip">Loja: ${u.currentLojaName || lojaName}</span>
          <span class="user-chip">Página: ${u.currentPage || "—"}</span>
          <span class="user-chip">Dispositivo: ${u.device || "—"}</span>
          <span class="user-chip">${u.ativo === false ? "Bloqueado" : "Ativo"}</span>
        </div>
        <div class="user-actions">
          <button class="mini-btn" data-edit-user="${u.uid}">Editar</button>
          <button class="mini-btn" data-reset-user="${u.email || ""}">Reset password</button>
          <button class="mini-btn danger" data-delete-user="${u.uid}">Apagar perfil</button>
        </div>
      </div>
    `;
  }).join("") || `<p class="muted">Ainda não existem perfis.</p>`;

  document.querySelectorAll("[data-edit-user]").forEach(btn => btn.addEventListener("click", () => {
    const u = users.find(x => x.uid === btn.dataset.editUser);
    if (!u) return;
    $("userUid").value = u.uid || "";
    $("userName").value = u.nome || "";
    $("userEmail").value = u.email || "";
    $("userRole").value = u.role || "user";
    $("userStore").value = u.lojaId || "loja_1";
  }));

  document.querySelectorAll("[data-reset-user]").forEach(btn => btn.addEventListener("click", async () => {
    if (!btn.dataset.resetUser) return;
    try {
      await sendPasswordResetEmail(state.auth, btn.dataset.resetUser);
      toast("Email de reset enviado");
    } catch {
      toast("Erro ao enviar reset");
    }
  }));

  document.querySelectorAll("[data-delete-user]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Apagar este perfil?")) return;
    try {
      await deleteDoc(doc(state.db, "users", btn.dataset.deleteUser));
      toast("Perfil apagado");
    } catch {
      toast("Erro ao apagar perfil");
    }
  }));
}

function clearUserForm() {
  if ($("userUid")) $("userUid").value = "";
  if ($("userName")) $("userName").value = "";
  if ($("userEmail")) $("userEmail").value = "";
  if ($("userRole")) $("userRole").value = "user";
  if ($("userStore")) $("userStore").value = "loja_1";
}

async function createAuthUserAndFillUid() {
  if (!isAdmin()) return toast("Só admin pode criar users");
  const email = $("newAuthEmail")?.value.trim();
  const password = $("newAuthPassword")?.value;
  if (!email || !password || password.length < 6) return toast("Email/password inválidos");

  let secondaryApp = null;
  try {
    secondaryApp = initializeApp(window.BRINKA_FIREBASE_CONFIG, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    $("userUid").value = cred.user.uid;
    $("userEmail").value = email;
    $("userName").value = email.split("@")[0];
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    toast("Login criado. Agora guarda perfil.");
  } catch (error) {
    console.error(error);
    try { if (secondaryApp) await deleteApp(secondaryApp); } catch {}
    toast(error.code === "auth/email-already-in-use" ? "Email já existe" : "Erro ao criar login");
  }
}

async function saveUserProfile() {
  if (!isAdmin()) return toast("Só admin");
  const uid = $("userUid")?.value.trim();
  const nome = $("userName")?.value.trim();
  const email = $("userEmail")?.value.trim();
  const role = $("userRole")?.value || "user";
  const lojaId = $("userStore")?.value || "loja_1";
  if (!uid || !nome || !email) return toast("Preenche UID, nome e email");

  try {
    await setDoc(doc(state.db, "users", uid), { nome, email, role, lojaId, ativo: true, updatedAt: Date.now() }, { merge: true });
    clearUserForm();
    toast("Perfil guardado");
  } catch (error) {
    console.error(error);
    toast("Erro ao guardar perfil");
  }
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => switchPage(b.dataset.page)));

  $("menuBtn")?.addEventListener("click", () => {
    $("sidebar")?.classList.add("open");
    $("overlay")?.classList.add("show");
  });

  $("overlay")?.addEventListener("click", () => {
    $("sidebar")?.classList.remove("open");
    $("overlay")?.classList.remove("show");
  });

  $("loginBtn")?.addEventListener("click", doLogin);
  $("loginPassword")?.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  $("logoutBtn")?.addEventListener("click", doLogout);
  $("themeBtn")?.addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    saveLocal();
    renderSettings();
  });

  $("expected")?.addEventListener("input", calculate);
  $("saveClosure")?.addEventListener("click", saveClosure);
  $("clearForm")?.addEventListener("click", () => clearForm(true));
  $("search")?.addEventListener("input", renderHistory);
  $("statusFilter")?.addEventListener("change", renderHistory);
  $("exportCsv")?.addEventListener("click", exportCsv);
  $("saveSettings")?.addEventListener("click", saveSettings);
  $("saveStoreNames")?.addEventListener("click", saveStoreNames);
  $("store")?.addEventListener("change", () => changeActiveStore($("store").value));
  $("activeStore")?.addEventListener("change", () => changeActiveStore($("activeStore").value));
  $("saveUserProfile")?.addEventListener("click", saveUserProfile);
  $("clearUserForm")?.addEventListener("click", clearUserForm);
  $("refreshUsers")?.addEventListener("click", loadUsers);
  $("createAuthUserBtn")?.addEventListener("click", createAuthUserAndFillUid);
}

document.addEventListener("click", event => {
  if (event.target.closest?.("#loginBtn")) {
    event.preventDefault();
    doLogin();
  }
});

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

  onAuthStateChanged(state.auth, async user => {
    if (user) await afterLogin(user);
    else {
      showLogin(true);
      setStatus("local", "Sem login", "Entra para sincronizar");
    }
  });
}

init();
