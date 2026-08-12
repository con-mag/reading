const DATA = window.KAWN_DATA;
const STORAGE_KEY = "kawn-reading-v1";
const PASSWORD_SCHEMA_KEY = "kawn-password-schema-v3";
const LEVEL_PASSWORDS = Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,String(2000+i)]).concat([[11,"2030"]]));

// Load state BEFORE touching it. Preserve reading progress, but invalidate only
// old level-unlock flags so every level uses its own password in this build.
let state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"access":false,"unlocked":[],"done":[]}');
if(!Array.isArray(state.unlocked)) state.unlocked=[];
if(!Array.isArray(state.done)) state.done=[];
if(localStorage.getItem(PASSWORD_SCHEMA_KEY) !== "all-levels-passwords-v1"){
  state.unlocked=[];
  localStorage.setItem(PASSWORD_SCHEMA_KEY,"all-levels-passwords-v1");
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
const THEME_KEY="kawn-theme";
if(!Array.isArray(state.unlocked)) state.unlocked=[];
if(!Array.isArray(state.done)) state.done=[];
let currentLevel = null;
let pendingLevel = null;

const $ = s => document.querySelector(s);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const allBooks = () => DATA.levels.flatMap(l=>l.items.map((title,i)=>({id:`${l.id}-${i+1}`,title,level:l.id})));
const completedCount = () => state.done.length;
const total = DATA.total;
const pct = (n,d=total) => d ? Math.round(n/d*100) : 0;

function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove("show"),2600);
}
function isUnlocked(id){ return state.unlocked.includes(id); }
function unlock(id){ if(!isUnlocked(id)){state.unlocked.push(id);save();} }
function done(id){ return state.done.includes(id); }

function initTheme(){
  const saved=localStorage.getItem(THEME_KEY);
  if(saved==="light") document.body.classList.add("light");
  const btn=$("#themeToggle");
  if(btn) btn.textContent=document.body.classList.contains("light")?"☾":"☼";
  if(btn) btn.onclick=()=>{
    document.body.classList.toggle("light");
    const mode=document.body.classList.contains("light")?"light":"dark";
    localStorage.setItem(THEME_KEY,mode);
    btn.textContent=mode==="light"?"☾":"☼";
    toast(mode==="light"?"تم تفعيل الوضع النهاري الهادئ.":"عاد النظام إلى الوضع الليلي.");
  };
}
function showFarewell(){
  const f=$("#farewell");
  if(!f)return;
  f.classList.add("show"); f.setAttribute("aria-hidden","false");
  setTimeout(()=>{ f.classList.remove("show"); f.setAttribute("aria-hidden","true"); },2400);
}
function initGate(){
  // The access gate appears on every fresh page load; reading progress remains saved.
  state.access=false;
  $("#gate").classList.remove("hidden");
  $("#app").classList.add("hidden");
  $("#accessForm").addEventListener("submit",e=>{
    e.preventDefault();
    const val=$("#accessCode").value.trim();
    if(val==="CON2027"){
      state.access=true; save();
      $("#gate").classList.add("hidden");$("#app").classList.remove("hidden");
      $("#accessCode").value="";$("#accessError").textContent="";
      toast("تم فتح النظام. مرحبًا بك في Con.");
      boot();
    }else{
      $("#accessError").textContent="الرمز غير صحيح. جرّب رمز الدخول الممنوح لك.";
    }
  });
}
let booted=false;
function boot(){
  renderNav(); renderLevels(); updateStats();
  if(!booted){
    $("#searchInput").addEventListener("input", e=>search(e.target.value));
  }
  $("#continueBtn").onclick=()=>{
    const first = DATA.levels.find(l=>isUnlocked(l.id) && l.items.some((_,i)=>!done(`${l.id}-${i+1}`)));
    if(first) openLevel(first.id);
    else { const l=DATA.levels[0]; openLevel(l.id); }
  };
  $("#randomBtn").onclick=randomBook;
  $("#backBtn").onclick=()=>showMap();
  $("#mobileMenu").onclick=()=>$("#sidebar").classList.toggle("open");
  $("#exitBtn").onclick=()=>openExitSummary();
  $("#passwordClose").onclick=()=>closePasswordWithFarewell();
  $("#exitClose").onclick=()=>$("#exitDialog").close();
  $("#confirmExit").onclick=()=>exitSystem();
  $("#authorClose").onclick=()=>$("#authorDialog").close();
  $("#levelPasswordForm").addEventListener("submit",e=>{
    e.preventDefault();
    if(LEVEL_PASSWORDS[pendingLevel] === $("#levelPassword").value.trim()){
      unlock(pendingLevel); $("#passwordDialog").close(); $("#levelPassword").value=""; $("#passError").textContent="";
      openLevel(pendingLevel); renderNav(); renderLevels(); toast(`تم فتح المستوى ${pendingLevel}.`);
    }else $("#passError").textContent="كلمة السر غير صحيحة.";
  });
}
function closePasswordWithFarewell(){
  const dlg=$("#passwordDialog");
  if(dlg.open) dlg.close();
  showFarewell();
}
function openExitSummary(){
  updateExitSummary();
  $("#exitDialog").showModal();
}
function updateExitSummary(){
  const p=pct(completedCount());
  const active=DATA.levels.find(l=>l.items.some((_,i)=>!done(`${l.id}-${i+1}`)))||DATA.levels.at(-1);
  $("#exitDone").textContent=completedCount();
  $("#exitPercent").textContent=p+"%";
  $("#exitLevel").textContent=String(active.id).padStart(2,"0");
  $("#exitProgressLabel").textContent=p+"%";
  $("#exitBar").style.width=p+"%";
}
function exitSystem(){
  $("#exitDialog").close();
  state.access=false;
  save();
  $("#app").classList.add("hidden");
  $("#gate").classList.remove("hidden");
  $("#accessCode").focus();
  showFarewell();
}
function renderNav(){
  $("#levelNav").innerHTML=DATA.levels.map(l=>`
    <button class="level-link ${currentLevel===l.id?'active':''}" data-level="${l.id}">
      <span class="level-num">${String(l.id).padStart(2,"0")}</span>
      <div><strong>${l.id===11?'مُستوى خاص بكتَّاب Con':esc(l.name)}</strong><small>${l.count} مدخلًا</small></div>
    </button>`).join("");
  document.querySelectorAll(".level-link").forEach(b=>b.onclick=()=>requestLevel(+b.dataset.level));
}
function renderLevels(filter=""){
  const q=filter.trim().toLowerCase();
  $("#levelsGrid").innerHTML=DATA.levels.map(l=>{
    const items=l.items.filter(x=>x.toLowerCase().includes(q)).length;
    const doneCount=l.items.reduce((n,_,i)=>n+done(`${l.id}-${i+1}`),0);
    const p=pct(doneCount,l.items.length);
    return `<article class="level-card" data-num="${String(l.id).padStart(2,"0")}">
      <div class="card-top"><span class="chip">${l.id===11?"CON / CRAFT":"LEVEL "+String(l.id).padStart(2,"0")}</span><span class="lock">${isUnlocked(l.id)?"◉":"◌"}</span></div>
      <h4>${l.id===11?'مُستوى خاص بكتَّاب Con':esc(l.name)}</h4><p>${esc(l.subtitle)}</p>
      <div class="card-foot"><div class="card-progress"><span>${p}%</span><div class="card-track"><i style="width:${p}%"></i></div></div>
      <button class="open-link">${isUnlocked(l.id)?"دخول ←":"فتح ↗"}</button></div>
      <div style="font-size:8px;color:#506c83;margin-top:8px">${items===l.items.length?l.items.length:items+" نتائج"} مدخلًا · ${doneCount} مكتمل</div>
    </article>`;
  }).join("");
  document.querySelectorAll(".level-card").forEach(card=>card.onclick=()=>requestLevel(Number(card.dataset.num)));
}
function requestLevel(id){
  // No level bypasses the password gate, including levels 1–6 and 9–11.
  if(isUnlocked(id)) return openLevel(id);
  pendingLevel=id;
  const l=DATA.levels.find(x=>x.id===id);
  const displayName=id===11?'مُستوى خاص بكتَّاب Con':l.name;
  $("#passTitle").textContent=`فتح المستوى ${String(id).padStart(2,"0")} · ${displayName}`;
  $("#levelPassword").value="";$("#passError").textContent="";
  const dlg=$("#passwordDialog");
  dlg.showModal();
  requestAnimationFrame(()=>$("#levelPassword").focus());
}
function openLevel(id){
  currentLevel=id; renderNav();
  const l=DATA.levels.find(x=>x.id===id);
  $("#levelsGrid").classList.add("hidden");$("#levelView").classList.remove("hidden");
  $(".section-head").classList.add("hidden");
  $("#lvChip").textContent=`LEVEL ${String(id).padStart(2,"0")}${id===11?" / CON":""}`;
  $("#lvTitle").textContent=id===11?'مُستوى خاص بكتَّاب Con':l.name;
  $("#lvSubtitle").textContent=l.subtitle;
  renderBooks(l);
  window.scrollTo({top:0,behavior:"smooth"});
}
function renderBooks(l, filter=""){
  const q=filter.trim().toLowerCase();
  const books=l.items.map((title,i)=>({title,i,id:`${l.id}-${i+1}`})).filter(x=>x.title.toLowerCase().includes(q));
  const dc=books.filter(x=>done(x.id)).length, p=pct(dc,books.length);
  $("#lvPercent").textContent=p+"%";$("#lvBar").style.width=p+"%";
  $("#lvMeta").textContent=`${dc} من ${books.length} ظاهر الآن · إجمالي المستوى ${l.items.length}`;
  $("#booksGrid").innerHTML=books.map(x=>{
    const author=extractAuthor(x.title);
    return `<article class="book-card ${done(x.id)?"done":""}">
      <span class="book-num">ENTRY ${String(x.i+1).padStart(3,"0")}</span>
      <div class="book-title">${esc(extractTitle(x.title))}</div>
      ${author?`<button class="author-btn" data-author="${escAttr(author)}">المؤلف: ${esc(author)} ↗</button>`:`<span class="author-btn" style="color:#587489">بيانات المؤلف غير محددة في المصدر</span>`}
      <div class="book-actions"><span style="font-size:8px;color:${done(x.id)?"#55efc1":"#506b82"}">${done(x.id)?"✓ مكتمل":"قيد القراءة"}</span>
      <button class="done-btn" data-done="${x.id}">${done(x.id)?"✓ أتممت القراءة":"وضع علامة إتمام"}</button></div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-done]").forEach(b=>b.onclick=()=>toggleDone(b.dataset.done,l.id));
  document.querySelectorAll(".author-btn[data-author]").forEach(b=>b.onclick=()=>openAuthor(b.dataset.author,l));
  if(l.units?.length){
    $("#unitsBox").classList.remove("hidden");
    $("#unitsBox").innerHTML=`<h4>وحدات تدريبية داخل «كتاب كون»</h4>${l.units.map(u=>`<div class="unit">${esc(u.title)}</div>`).join("")}`;
  }else $("#unitsBox").classList.add("hidden");
}
function toggleDone(id,levelId){
  if(done(id)) state.done=state.done.filter(x=>x!==id); else state.done.push(id);
  save(); updateStats(); renderBooks(DATA.levels.find(l=>l.id===levelId)); renderLevels($("#searchInput").value);
  toast(done(id)?"تم تسجيل القراءة.":"تمت إزالة علامة الإتمام.");
}
function updateStats(){
  const p=pct(completedCount());
  $("#topPercent").textContent=p+"%";$("#topBar").style.width=p+"%";
  $("#statBooks").textContent=total;$("#statDone").textContent=completedCount();$("#statPercent").textContent=p+"%";
  const active=DATA.levels.find(l=>l.items.some((_,i)=>!done(`${l.id}-${i+1}`)))||DATA.levels.at(-1);
  $("#statLevel").textContent=String(active.id).padStart(2,"0");$("#statLevelName").textContent=active.id===11?'مُستوى خاص بكتَّاب Con':active.name;
}
function search(q){
  if(currentLevel){
    renderBooks(DATA.levels.find(l=>l.id===currentLevel),q);
  }else renderLevels(q);
}
function showMap(){
  currentLevel=null;$("#levelView").classList.add("hidden");$("#levelsGrid").classList.remove("hidden");$(".section-head").classList.remove("hidden");renderNav();renderLevels($("#searchInput").value);
}
function randomBook(){
  const pool=allBooks().filter(b=>isUnlocked(b.level)&&!done(b.id));
  const pick=(pool.length?pool:allBooks())[Math.floor(Math.random()*(pool.length?pool:allBooks()).length)];
  const l=DATA.levels.find(x=>x.id===pick.level);
  if(!isUnlocked(pick.level)) return requestLevel(pick.level);
  openLevel(pick.level);
  setTimeout(()=>{const el=document.querySelector(`[data-done="${pick.id}"]`);el?.scrollIntoView({behavior:"smooth",block:"center"});el?.animate([{transform:"scale(1)"},{transform:"scale(1.04)"},{transform:"scale(1)"}],{duration:600});},250);
}
function extractTitle(s){return s.split(" — ")[0].replace(/\s+\([^)]*\)$/,"").trim()}
function extractAuthor(s){
  const parts=s.split(" — ");
  if(parts.length<2) return "";
  return parts.slice(1).join(" — ").replace(/\s*\([^)]*\)\s*$/,"").trim();
}
function openAuthor(author,l){
  const works=l.items.filter(x=>extractAuthor(x)===author).length;
  $("#authorName").textContent=author;
  $("#authorWorks").textContent=`ظهر في هذا المستوى في ${works} مدخل${works===1?"":"ات"}.`;
  $("#authorBio").textContent="لا يحتوي الملف المرفق على سيرة موثقة للمؤلف؛ لذلك لم تُختلق معلومات من خارج المنهج. يمكن إضافة السيرة هنا لاحقًا.";
  $("#authorTips").textContent="تُضاف نصائح القراءة الخاصة بالمؤلف عندما تُزوَّد بها بيانات المشروع، مع الحفاظ على صياغة كَوْن وهوية النظام.";
  $("#authorNote").textContent="المصدر الحالي يزوّد النظام باسم المؤلف وعناوين الأعمال فقط في هذا الموضع؛ أما العرض التعريفي المفصل فهو حقل جاهز للإضافة.";
  $("#authorDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escAttr(s){return esc(s).replace(/`/g,"&#96;")}
initTheme(); initGate();