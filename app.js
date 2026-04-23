import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const notes = [500,200,100,50,20,10,5];
const coins = [2,1,0.5,0.2,0.1,0.05,0.02,0.01];
const state = {
  page: "dashboard",
  closures: [],
  settings: { defaultStore: "Brinka", defaultExpected: "", theme: "dark" },
  db: null,
  firebase: false
};

const $ = id => document.getElementById(id);
const eur = n => new Intl.NumberFormat("pt-PT", { style:"currency", currency:"EUR" }).format(Number(n || 0));
const uid = () => crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"), 2200);
}

function load(){
  state.closures = JSON.parse(localStorage.getItem("brinka_web_closures") || "[]");
  state.settings = { ...state.settings, ...JSON.parse(localStorage.getItem("brinka_web_settings") || "{}") };
}
function persist(){
  localStorage.setItem("brinka_web_closures", JSON.stringify(state.closures));
  localStorage.setItem("brinka_web_settings", JSON.stringify(state.settings));
}

async function initFirebase(){
  if(!window.BRINKA_FIREBASE_ENABLED) return;
  try{
    const app = initializeApp(window.BRINKA_FIREBASE_CONFIG);
    state.db = getFirestore(app);
    state.firebase = true;
    $("storageStatus").textContent = "Firebase ativo";
    const q = query(collection(state.db, "brinka_fechos"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    state.closures = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    persist();
  }catch(e){
    console.error(e);
    $("storageStatus").textContent = "Firebase erro · modo local";
  }
}

function buildMoneyRows(target, values){
  $(target).innerHTML = values.map(v => `
    <div class="money-row" data-value="${v}">
      <div class="money-value">${String(v).replace(".", ",")}€</div>
      <input type="number" min="0" step="1" value="0" inputmode="numeric">
      <div class="money-sub">0,00 €</div>
    </div>
  `).join("");
  document.querySelectorAll(`#${target} input`).forEach(i => i.addEventListener("input", calculate));
}

function collect(selector){
  return [...document.querySelectorAll(selector)].map(row => {
    const value = Number(row.dataset.value);
    const qty = Number(row.querySelector("input").value || 0);
    const subtotal = value * qty;
    row.querySelector(".money-sub").textContent = eur(subtotal);
    return { value, qty, subtotal };
  });
}

function calculate(){
  const noteRows = collect("#notesRows .money-row");
  const coinRows = collect("#coinsRows .money-row");
  const notesTotal = noteRows.reduce((s,r)=>s+r.subtotal,0);
  const coinsTotal = coinRows.reduce((s,r)=>s+r.subtotal,0);
  const total = notesTotal + coinsTotal;
  const expected = Number($("expected").value || 0);
  const diff = total - expected;

  $("notesTotal").textContent = eur(notesTotal);
  $("coinsTotal").textContent = eur(coinsTotal);
  $("sumNotes").textContent = eur(notesTotal);
  $("sumCoins").textContent = eur(coinsTotal);
  $("grandTotal").textContent = eur(total);
  $("sumExpected").textContent = eur(expected);
  $("sumDiff").textContent = eur(diff);

  let label = "Sem esperado";
  if(expected){
    if(Math.abs(diff) < 0.005) label = "Certo";
    else if(diff > 0) label = `Sobra ${eur(diff)}`;
    else label = `Falta ${eur(Math.abs(diff))}`;
  }
  $("diffBadge").textContent = label;

  return { noteRows, coinRows, notesTotal, coinsTotal, total, expected, diff };
}

function setDateNow(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $("closeDate").value = d.toISOString().slice(0,16);
}

async function saveClosure(){
  const c = calculate();
  if(c.total <= 0){ toast("Mete valores antes de guardar"); return; }

  const dateIso = $("closeDate").value ? new Date($("closeDate").value).toISOString() : new Date().toISOString();
  const item = {
    localId: uid(),
    dateIso,
    dateLabel: new Date(dateIso).toLocaleString("pt-PT", { dateStyle:"short", timeStyle:"short" }),
    store: $("store").value.trim() || state.settings.defaultStore || "Brinka",
    operator: $("operator").value.trim() || "Sem utilizador",
    expected: c.expected,
    diff: c.diff,
    total: c.total,
    notesTotal: c.notesTotal,
    coinsTotal: c.coinsTotal,
    notes: c.noteRows,
    coins: c.coinRows,
    observation: $("obs").value.trim()
  };

  try{
    if(state.firebase){
      const ref = await addDoc(collection(state.db, "brinka_fechos"), { ...item, createdAt: serverTimestamp() });
      item.id = ref.id;
    }
  }catch(e){ console.error(e); toast("Firebase falhou, guardado local"); }

  state.closures.unshift(item);
  persist();
  clearForm(false);
  renderAll();
  toast("Fecho guardado");
}

function clearForm(show=true){
  document.querySelectorAll(".money-row input").forEach(i => i.value = 0);
  $("expected").value = state.settings.defaultExpected || "";
  $("store").value = state.settings.defaultStore || "Brinka";
  $("obs").value = "";
  setDateNow();
  calculate();
  if(show) toast("Formulário limpo");
}

async function deleteItem(id){
  state.closures = state.closures.filter(x => (x.id || x.localId) !== id);
  persist();
  try{ if(state.firebase) await deleteDoc(doc(state.db, "brinka_fechos", id)); }catch(e){}
  renderAll();
  toast("Fecho apagado");
}

function statusOf(diff){
  if(Math.abs(diff) < 0.005) return "certo";
  return diff > 0 ? "sobra" : "falta";
}

function renderDashboard(){
  const today = new Date().toLocaleDateString("pt-PT");
  const todayItems = state.closures.filter(x => new Date(x.dateIso).toLocaleDateString("pt-PT") === today);
  const todayTotal = todayItems.reduce((s,x)=>s+Number(x.total||0),0);
  const todayDiff = todayItems.reduce((s,x)=>s+Number(x.diff||0),0);
  const allTotal = state.closures.reduce((s,x)=>s+Number(x.total||0),0);
  const best = Math.max(0, ...state.closures.map(x=>Number(x.total||0)));
  const avg = state.closures.length ? allTotal / state.closures.length : 0;

  $("todayTotal").textContent = eur(todayTotal);
  $("todayDiff").textContent = eur(todayDiff);
  $("todaySubtitle").textContent = todayItems.length ? `${todayItems.length} fecho(s) hoje` : "Sem fechos hoje";
  $("totalClosures").textContent = state.closures.length;
  $("lastClosure").textContent = state.closures[0]?.dateLabel || "—";
  $("bestClosure").textContent = eur(best);
  $("allTimeTotal").textContent = eur(allTotal);
  $("avgClosure").textContent = eur(avg);

  $("recentClosures").innerHTML = state.closures.slice(0,6).map(item => `
    <div class="list-item">
      <div><strong>${eur(item.total)}</strong><br><span class="muted">${item.dateLabel} · ${item.store}</span></div>
      <div><b>${statusOf(item.diff)}</b><br><span class="muted">${eur(item.diff)}</span></div>
    </div>
  `).join("") || `<p class="muted">Ainda não existem fechos.</p>`;
}

function renderHistory(){
  const q = $("search").value.toLowerCase().trim();
  const filter = $("statusFilter").value;
  const rows = state.closures.filter(item => {
    const txt = `${item.dateLabel} ${item.store} ${item.operator} ${item.total}`.toLowerCase();
    return (!q || txt.includes(q)) && (!filter || statusOf(item.diff) === filter);
  });

  $("historyTable").innerHTML = rows.map(item => {
    const id = item.id || item.localId;
    return `<tr>
      <td>${item.dateLabel}</td>
      <td>${item.store || "—"}</td>
      <td>${item.operator || "—"}</td>
      <td><b>${eur(item.total)}</b></td>
      <td>${eur(item.expected)}</td>
      <td>${eur(item.diff)}</td>
      <td><button class="icon-delete" data-delete="${id}">Apagar</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="muted">Sem resultados.</td></tr>`;

  document.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => deleteItem(b.dataset.delete)));
}

function renderReports(){
  const total = state.closures.reduce((s,x)=>s+Number(x.total||0),0);
  const diff = state.closures.reduce((s,x)=>s+Number(x.diff||0),0);
  $("reportTotal").textContent = eur(total);
  $("reportDiff").textContent = eur(diff);
  $("reportMissing").textContent = state.closures.filter(x=>x.diff < -0.005).length;
  $("reportOver").textContent = state.closures.filter(x=>x.diff > 0.005).length;
  $("reportList").innerHTML = state.closures.slice(0,10).map(x => `
    <div class="list-item">
      <div><strong>${x.store}</strong><br><span class="muted">${x.dateLabel}</span></div>
      <div><b>${eur(x.total)}</b><br><span class="muted">${eur(x.diff)}</span></div>
    </div>
  `).join("") || `<p class="muted">Sem dados para relatório.</p>`;
}

function renderSettings(){
  $("defaultStore").value = state.settings.defaultStore || "";
  $("defaultExpected").value = state.settings.defaultExpected || "";
  document.body.classList.toggle("light", state.settings.theme === "light");
}

function renderAll(){ renderDashboard(); renderHistory(); renderReports(); renderSettings(); }

function go(page){
  state.page = page;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = {
    dashboard:["Dashboard","Resumo da Caixa"],
    fecho:["Fecho de Caixa","Novo Fecho"],
    historico:["Histórico","Registos Guardados"],
    relatorios:["Relatórios","Análise de Fechos"],
    config:["Configurações","Preferências"]
  };
  $("pageKicker").textContent = titles[page][0];
  $("pageTitle").textContent = titles[page][1];
  $("sidebar").classList.remove("open");
  window.scrollTo({top:0, behavior:"smooth"});
}

function saveSettings(){
  state.settings.defaultStore = $("defaultStore").value.trim() || "Brinka";
  state.settings.defaultExpected = $("defaultExpected").value;
  persist();
  $("store").value = state.settings.defaultStore;
  $("expected").value = state.settings.defaultExpected;
  renderAll();
  calculate();
  toast("Configurações guardadas");
}

function exportCsv(){
  const header = ["Data","Loja","Utilizador","Total","Esperado","Diferenca","Observacoes"];
  const lines = state.closures.map(x => [x.dateLabel,x.store,x.operator,x.total,x.expected,x.diff,x.observation || ""]
    .map(v => `"${String(v).replaceAll('"','""')}"`).join(";"));
  const blob = new Blob([[header.join(";"), ...lines].join("\n")], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "brinka-historico.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function bind(){
  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
  $("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("expected").addEventListener("input", calculate);
  $("saveClosure").addEventListener("click", saveClosure);
  $("clearForm").addEventListener("click", () => clearForm(true));
  $("search").addEventListener("input", renderHistory);
  $("statusFilter").addEventListener("change", renderHistory);
  $("saveSettings").addEventListener("click", saveSettings);
  $("clearHistory").addEventListener("click", () => {
    if(confirm("Apagar todo o histórico local?")){
      state.closures = [];
      persist();
      renderAll();
      toast("Histórico limpo");
    }
  });
  $("exportCsv").addEventListener("click", exportCsv);
  $("themeBtn").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    persist(); renderSettings();
  });
}

async function init(){
  load();
  buildMoneyRows("notesRows", notes);
  buildMoneyRows("coinsRows", coins);
  bind();
  $("operator").value = localStorage.getItem("brinka_operator") || "";
  $("operator").addEventListener("input", e => localStorage.setItem("brinka_operator", e.target.value));
  $("store").value = state.settings.defaultStore;
  $("expected").value = state.settings.defaultExpected;
  setDateNow();
  calculate();
  await initFirebase();
  renderAll();
}

init();
