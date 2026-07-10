// ─────────────────────────────────────────────────────────────
// ReceiptVault. App logic (Firebase Auth + Firestore, Cloudinary for images).
// No build step: Firebase pulled from CDN as ES modules.
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, query, where,
  orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, cloudinaryConfig } from "./firebase-config.js";

// ---------- init ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// upload a Blob to Cloudinary (unsigned preset, free tier, no card needed)
async function uploadToCloudinary(blob){
  const { cloudName, uploadPreset } = cloudinaryConfig;
  const form = new FormData();
  form.append("file", blob);
  form.append("upload_preset", uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST", body: form
  });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ---------- category list ----------
const CATEGORIES = ["Groceries","Restaurants","Gas & Fuel","Retail & Clothing",
  "Pharmacy & Health","Electronics","Home & Hardware","Entertainment",
  "Travel","Services","Other"];

// small brand to category guesser (grows: unknown falls back to "Other")
const BRAND_CATEGORY = {
  walmart:"Groceries", costco:"Groceries", target:"Retail & Clothing", kroger:"Groceries",
  "whole foods":"Groceries", safeway:"Groceries", aldi:"Groceries", "trader joe":"Groceries",
  publix:"Groceries", loblaws:"Groceries", "no frills":"Groceries", metro:"Groceries",
  sobeys:"Groceries", "food basics":"Groceries",
  starbucks:"Restaurants", mcdonald:"Restaurants", "tim horton":"Restaurants",
  subway:"Restaurants", "burger king":"Restaurants", wendy:"Restaurants", kfc:"Restaurants",
  chevron:"Gas & Fuel", shell:"Gas & Fuel", esso:"Gas & Fuel", petro:"Gas & Fuel",
  bp:"Gas & Fuel", "7-eleven":"Gas & Fuel",
  "best buy":"Electronics", apple:"Electronics",
  "home depot":"Home & Hardware", lowe:"Home & Hardware", ikea:"Home & Hardware",
  "canadian tire":"Home & Hardware",
  cvs:"Pharmacy & Health", walgreens:"Pharmacy & Health", "shoppers drug":"Pharmacy & Health",
  rexall:"Pharmacy & Health",
  "h&m":"Retail & Clothing", zara:"Retail & Clothing", nike:"Retail & Clothing",
  netflix:"Entertainment", spotify:"Entertainment"
};

function guessCategory(brand){
  const b = (brand||"").toLowerCase();
  for (const key in BRAND_CATEGORY){ if (b.includes(key)) return BRAND_CATEGORY[key]; }
  return "Other";
}

// ---------- DOM ----------
const $ = (id)=>document.getElementById(id);
const loginView=$("loginView"), appView=$("appView");
let currentUser=null, unsub=null, receipts=[], pendingBlob=null;

// ---------- auth ----------
$("googleBtn").onclick = async ()=>{
  try { await signInWithPopup(auth, provider); }
  catch(e){ toast("Sign-in failed: "+e.message); }
};
$("logoutBtn").onclick = ()=> signOut(auth);

onAuthStateChanged(auth, (user)=>{
  const splash = $("authSplash");
  if (splash) splash.classList.add("hidden");
  currentUser = user;
  if (user){
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    $("userName").textContent = user.displayName || user.email;
    if (user.photoURL) $("userPhoto").src = user.photoURL;
    watchReceipts();
  } else {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
    if (unsub) unsub();
    receipts=[];
  }
});

// ---------- tabs / sidebar ----------
document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.onclick = ()=>{
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active");
    $("tab-"+btn.dataset.tab).classList.add("active");
    $("sidebar").classList.remove("open");
  };
});
$("menuBtn").onclick = ()=> $("sidebar").classList.toggle("open");

// ---------- populate category selects ----------
function fillCategorySelects(){
  const opts = CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join("");
  $("fCategory").innerHTML = opts;
  $("filterCat").innerHTML = `<option value="">All categories</option>`+opts;
}
fillCategorySelects();

// ─────────────────────────────────────────────────────────────
// CAMERA + OCR
// ─────────────────────────────────────────────────────────────
$("fileInput").onchange = async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const compressed = await compressImage(file);   // shrink before storing
  pendingBlob = compressed;
  const url = URL.createObjectURL(compressed);
  const img = $("previewImg");
  img.src = url; img.classList.remove("hidden");
  $("dropInner").classList.add("hidden");

  $("ocrStatus").classList.remove("hidden");
  $("receiptForm").classList.add("hidden");
  try {
    const { data } = await Tesseract.recognize(compressed, "eng");
    const parsed = parseReceipt(data.text);
    showForm(parsed);
  } catch(err){
    toast("Could not read the receipt. Please fill the fields in yourself.");
    showForm({brand:"",amount:"",date:todayStr()});
  } finally {
    $("ocrStatus").classList.add("hidden");
  }
};

// shrink image: max 1200px wide, JPEG ~0.7 keeps storage tiny
function compressImage(file){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>{
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(b=>resolve(b),"image/jpeg",0.7);
    };
    img.src = URL.createObjectURL(file);
  });
}

// parse OCR text into brand (top line), amount (near TOTAL), date (regex)
function parseReceipt(text){
  const rawLines = text.split("\n").map(l=>l.trim());
  const lines = rawLines.filter(l=>l.length>1);

  // BRAND: first meaningful line at top (skip pure numbers/symbols)
  let brand = "";
  for (const l of lines){
    const letters = l.replace(/[^a-zA-Z]/g,"");
    if (letters.length >= 3){ brand = titleCase(l.replace(/[^a-zA-Z0-9&' ]/g,"").trim()); break; }
  }

  // AMOUNT: prefer the real total. Match total-style lines but skip "subtotal",
  // and take the LAST such line, since a grand total sits below subtotal/tax.
  const hasMoney = (l)=>/\d+[.,]\d{2}/.test(l);
  const isTotal  = (l)=>/(grand\s*total|amount\s*due|balance\s*due|\btotal\b)/i.test(l);
  const isSubtotal = (l)=>/sub[\s-]*total/i.test(l);
  let amount = "";
  const totalLines = lines.filter(l=> isTotal(l) && !isSubtotal(l) && hasMoney(l));
  if (totalLines.length){
    const m = totalLines[totalLines.length-1].match(/(\d+[.,]\d{2})/g);
    if (m) amount = m[m.length-1].replace(",",".");
  }
  if (!amount){
    let max = 0;
    for (const l of lines){
      const m = l.match(/(\d+[.,]\d{2})/g);
      if (m) m.forEach(v=>{ const n=parseFloat(v.replace(",",".")); if(n>max) max=n; });
    }
    if (max>0) amount = max.toFixed(2);
  }

  // DATE: common formats
  let date = todayStr();
  const dm = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)   // YYYY-MM-DD
        || text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);  // MM/DD/YYYY
  if (dm){
    const iso = normalizeDate(dm);
    if (iso) date = iso;
  }
  return { brand, amount, date };
}

function normalizeDate(m){
  try{
    let y,mo,d;
    if (m[1].length===4){ y=+m[1]; mo=+m[2]; d=+m[3]; }        // YYYY-MM-DD
    else { mo=+m[1]; d=+m[2]; y=+m[3]; if (y<100) y+=2000; }   // MM/DD/YY(YY)
    if (mo<1||mo>12||d<1||d>31) return null;
    const dt = new Date(y,mo-1,d);
    if (dt>new Date()) return null; // future date = misread
    return dt.toISOString().slice(0,10);
  }catch{ return null; }
}

function showForm(p){
  $("fBrand").value = p.brand || "";
  $("fAmount").value = p.amount || "";
  $("fDate").value = p.date || todayStr();
  $("fCategory").value = guessCategory(p.brand);
  $("receiptForm").classList.remove("hidden");
}

// ---------- save receipt ----------
$("receiptForm").onsubmit = async (e)=>{
  e.preventDefault();
  if (!pendingBlob){ toast("Add a photo first."); return; }
  const saveBtn = $("saveBtn");
  saveBtn.disabled = true; saveBtn.textContent = "Saving…";
  try {
    // 1. upload image to Cloudinary (free, no card needed)
    const imgUrl = await uploadToCloudinary(pendingBlob);
    // 2. write record to Firestore
    await addDoc(collection(db,"receipts"), {
      uid: currentUser.uid,
      brand: $("fBrand").value.trim(),
      category: $("fCategory").value,
      amount: parseFloat($("fAmount").value)||0,
      date: $("fDate").value,
      imgUrl,
      createdAt: serverTimestamp()
    });
    toast("Receipt saved.");
    resetCapture();
    document.querySelector('.nav-item[data-tab="receipts"]').click();
  } catch(err){
    console.error("Save failed:", err);
    toast("Save failed: "+err.message);
  } finally {
    saveBtn.disabled=false; saveBtn.textContent="Save receipt";
  }
};

$("cancelBtn").onclick = resetCapture;
function resetCapture(){
  pendingBlob=null;
  $("fileInput").value="";
  $("previewImg").classList.add("hidden");
  $("dropInner").classList.remove("hidden");
  $("receiptForm").classList.add("hidden");
}

// ─────────────────────────────────────────────────────────────
// LIVE RECEIPTS (Firestore realtime)
// ─────────────────────────────────────────────────────────────
function watchReceipts(){
  // Filter by owner only (a single-field query needs no composite index),
  // then sort newest-first in the browser. Keeps setup zero-config.
  const q = query(collection(db,"receipts"), where("uid","==",currentUser.uid));
  unsub = onSnapshot(q, (snap)=>{
    receipts = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    receipts.sort((a,b)=> String(b.date||"").localeCompare(String(a.date||"")));
    renderAll();
  }, (err)=>{
    console.error("Firestore load error:", err);
    toast("Could not load receipts: "+err.message);
  });
}

// filters
$("searchInput").oninput = renderList;
$("filterCat").onchange = renderList;

function renderAll(){ renderStats(); renderList(); renderCharts(); renderExportCount(); }

function renderStats(){
  const now = new Date();
  const ym = now.toISOString().slice(0,7);
  const y = String(now.getFullYear());
  let mSum=0, ySum=0;
  receipts.forEach(r=>{
    if ((r.date||"").startsWith(ym)) mSum+=r.amount;
    if ((r.date||"").startsWith(y)) ySum+=r.amount;
  });
  $("statMonth").textContent = money(mSum);
  $("statYear").textContent = money(ySum);
  $("statCount").textContent = receipts.length;
}

// Only allow https Cloudinary image URLs. Anything else (javascript:, data:,
// attribute-breakout attempts, http, other hosts) is rejected so a malicious
// or corrupted imgUrl can never inject markup or run script. Returns "" when
// the value is not a safe URL.
function safeImageUrl(raw){
  const s = String(raw??"");
  let u;
  try { u = new URL(s); } catch { return ""; }
  if (u.protocol !== "https:") return "";
  // Cloudinary serves delivered images from res.cloudinary.com (and regional
  // res-*.cloudinary.com hosts). Restrict to that so only our own uploads render.
  if (!/^res(-\w+)?\.cloudinary\.com$/.test(u.hostname)) return "";
  return u.href;
}

function renderList(){
  const term = $("searchInput").value.toLowerCase();
  const cat = $("filterCat").value;
  const filtered = receipts.filter(r=>
    (!term || (r.brand||"").toLowerCase().includes(term)) &&
    (!cat || r.category===cat));
  const list = $("receiptList");
  $("emptyState").classList.toggle("hidden", receipts.length>0);

  // Build the list with DOM APIs (textContent / setAttribute) instead of
  // innerHTML interpolation. This makes it impossible for any receipt field
  // to break out of an attribute or inject an element, regardless of content.
  list.textContent = "";
  const frag = document.createDocumentFragment();
  filtered.forEach(r=>{
    const card = document.createElement("div");
    card.className = "receipt-card";

    const img = document.createElement("img");
    const src = safeImageUrl(r.imgUrl);
    if (src){
      img.src = src;
      img.dataset.full = src;
      img.onclick = ()=>openModal(src);
    }
    img.alt = String(r.brand ?? "");
    card.appendChild(img);

    const body = document.createElement("div");
    body.className = "rc-body";

    const brand = document.createElement("div");
    brand.className = "rc-brand";
    brand.textContent = r.brand || "Unknown";
    body.appendChild(brand);

    const catEl = document.createElement("span");
    catEl.className = "rc-cat";
    catEl.textContent = r.category || "Other";
    body.appendChild(catEl);

    const foot = document.createElement("div");
    foot.className = "rc-foot";
    const amount = document.createElement("span");
    amount.className = "rc-amount";
    amount.textContent = money(r.amount);
    const date = document.createElement("span");
    date.className = "rc-date";
    date.textContent = r.date || "";
    foot.appendChild(amount);
    foot.appendChild(date);
    body.appendChild(foot);

    card.appendChild(body);

    const del = document.createElement("button");
    del.className = "rc-del";
    del.textContent = "Delete";
    del.onclick = ()=>removeReceipt(r.id);
    card.appendChild(del);

    frag.appendChild(card);
  });
  list.appendChild(frag);
}

// Note: only removes the Firestore record. The Cloudinary image (unsigned
// upload, no secret key in the browser) stays stored, which is fine at family scale
// on the 25GB free tier.
async function removeReceipt(id){
  if (!confirm("Delete this receipt permanently?")) return;
  try{
    await deleteDoc(doc(db,"receipts",id));
    toast("Deleted");
  }catch(err){ toast("Delete failed: "+err.message); }
}

// ---------- charts ----------
let monthlyChart, categoryChart;
function renderCharts(){
  // monthly: last 6 months
  const months=[], sums=[];
  const now=new Date();
  for (let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=d.toISOString().slice(0,7);
    months.push(d.toLocaleString("en",{month:"short"}));
    sums.push(receipts.filter(r=>(r.date||"").startsWith(key)).reduce((s,r)=>s+r.amount,0));
  }
  // category totals
  const catTotals={};
  receipts.forEach(r=>{ catTotals[r.category||"Other"]=(catTotals[r.category||"Other"]||0)+r.amount; });
  const catLabels=Object.keys(catTotals), catVals=Object.values(catTotals);

  const gridColor="#232329", tick="#7e7a72";
  // A restrained, gold-forward palette to match the app's visual system.
  const palette=["#c8a45c","#e0c690","#9c7d3f","#b7b3aa","#8a6f3a",
    "#d8c290","#6f5a2e","#cbb888","#7e7a72","#a88c4c","#5c4a26"];
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart($("monthlyChart"),{
    type:"bar",
    data:{labels:months,datasets:[{data:sums,backgroundColor:"#c8a45c",borderRadius:5}]},
    options:{plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{color:tick}},
        y:{grid:{color:gridColor},ticks:{color:tick}}}}
  });
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart($("categoryChart"),{
    type:"doughnut",
    data:{labels:catLabels,datasets:[{data:catVals,backgroundColor:palette,
      borderColor:"#111114",borderWidth:2}]},
    options:{cutout:"62%",plugins:{legend:{position:"bottom",labels:{color:tick,boxWidth:11,font:{size:11}}}}}
  });
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
function renderExportCount(){
  $("exportCount").textContent = `${receipts.length} receipt(s) ready to export.`;
}
$("exportCsvBtn").onclick = ()=>{
  if (!receipts.length){ toast("Nothing to export yet."); return; }
  const head = ["Date","Brand","Category","Amount","ImageURL"];
  const rows = receipts.map(r=>[r.date,r.brand,r.category,r.amount,r.imgUrl]
    .map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(","));
  download("receipts.csv", [head.join(","),...rows].join("\n"), "text/csv");
};
$("exportJsonBtn").onclick = ()=>{
  if (!receipts.length){ toast("Nothing to export yet."); return; }
  download("receipts-backup.json", JSON.stringify(receipts,null,2), "application/json");
};
function download(name, content, type){
  const blob=new Blob([content],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- image modal ----------
function openModal(url){ $("imgModalPic").src=url; $("imgModal").classList.remove("hidden"); }
$("imgModalClose").onclick = ()=> $("imgModal").classList.add("hidden");
$("imgModal").onclick = (e)=>{ if(e.target.id==="imgModal") $("imgModal").classList.add("hidden"); };

// ---------- helpers ----------
function money(n){ return "$"+(Number(n)||0).toFixed(2); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function titleCase(s){ return s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
let toastTimer;
function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.add("hidden"),3000);
}

// ─────────────────────────────────────────────────────────────
// COOKIE / CONSENT BANNER
// Essential cookies (Firebase auth/session) always run. The banner records
// whether the visitor also allows non-essential cookies, and remembers the
// choice so we ask once. No third-party analytics load without "Accept all".
// ─────────────────────────────────────────────────────────────
const CONSENT_KEY = "rv_consent";
function initConsent(){
  const banner = $("consent");
  if (!banner) return;
  let saved = null;
  try { saved = localStorage.getItem(CONSENT_KEY); } catch { /* storage blocked */ }
  if (saved === "all" || saved === "essential") return; // already answered
  banner.classList.remove("hidden");
  const decide = (choice)=>{
    try { localStorage.setItem(CONSENT_KEY, choice); } catch { /* ignore */ }
    banner.classList.add("hidden");
  };
  $("consentAccept").onclick    = ()=> decide("all");
  $("consentEssential").onclick = ()=> decide("essential");
}
initConsent();
