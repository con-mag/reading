const DATA = window.KAWN_DATA;

const STORAGE_KEY = "con-reading-v2";
const LEGACY_STORAGE_KEY = "kawn-reading-v1";
const THEME_KEY = "con-theme";
const PASSWORD_SCHEMA_KEY = "con-level-passwords-v5";
const LEVEL_PASSWORDS = {1:"2000",2:"1912",3:"1917",4:"1850",5:"1870",6:"2025",7:"2037",8:"2066",9:"2055",10:"2088",11:"2030"};
const LEVEL_COLORS = ["#a85b38","#8c6a42","#7d5f50","#5f7769","#8a6b50","#9b5f43","#65765d","#7b655c","#6b7280","#98684d","#6f6a5b"];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const refs = {};

function loadState(){
  let raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  let parsed = {};
  try{ parsed = raw ? JSON.parse(raw) : {}; }catch{ parsed = {}; }
  const reading = parsed.reading && typeof parsed.reading === "object" ? parsed.reading : {};
  return {
    access:false,
    unlocked:Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
    done:Array.isArray(parsed.done) ? parsed.done : [],
    reading,
  };
}

let state = loadState();
if(localStorage.getItem(PASSWORD_SCHEMA_KEY) !== "exact-level-passwords-v4") {
  state.unlocked = [];
  localStorage.setItem(PASSWORD_SCHEMA_KEY, "exact-level-passwords-v4");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
let currentLevel = null;
let pendingLevel = null;
let currentBookId = null;
let searchFrame = 0;
let booted = false;

const total = DATA.total;
const DATA_BOOK_COUNT = DATA.levels.reduce((sum, level) => sum + (Array.isArray(level.items) ? level.items.length : 0), 0);
if(DATA_BOOK_COUNT !== 799) throw new Error(`CON data integrity error: expected 799 books, found ${DATA_BOOK_COUNT}.`);
const completedCount = () => state.done.length;
const pct = (n,d=total) => d ? Math.round(n / d * 100) : 0;
const isUnlocked = id => state.unlocked.includes(id);
const isDone = id => state.done.includes(id);
const bookRecord = id => {
  if(!state.reading[id]) state.reading[id] = {page:"", time:0};
  return state.reading[id];
};
const allBooks = () => DATA.levels.flatMap(level => level.items.map((title,index) => ({id:`${level.id}-${index+1}`, title, level:level.id})));

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(message){
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => refs.toast.classList.remove("show"), 2400);
}

function initRefs(){
  ["gate","app","accessForm","accessCode","accessError","themeToggle","resetBtn","levelNav","levelsGrid","levelView","sectionHead","searchInput","continueBtn","randomBtn","backBtn","mobileMenu","sidebar","exitBtn","passwordDialog","passwordClose","levelPasswordForm","levelPassword","passTitle","passError","exitDialog","exitClose","confirmExit","authorClose","authorDialog","authorName","authorWorks","authorBio","authorTips","authorNote","booksGrid","unitsBox","lvChip","lvTitle","lvSubtitle","lvPercent","lvBar","lvMeta","topPercent","topBar","statBooks","statDone","statLevel","statLevelName","statPages","exitDone","exitPercent","exitPages","exitProgressLabel","exitBar","readerDialog","readerClose","readerForm","readerTitle","readerMeta","readerPage","saveReader","toast","farewell","levelCount"]
    .forEach(id => refs[id] = document.getElementById(id));
  if(!refs.sectionHead) refs.sectionHead = document.querySelector(".section-head");
}

function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "dark" ? "dark" : "light", false);
  refs.themeToggle.addEventListener("click", () => {
    applyTheme(document.body.classList.contains("dark") ? "light" : "dark", true);
  });
  refs.resetBtn.addEventListener("click", resetData);
}

function applyTheme(mode, announce){
  document.body.classList.toggle("dark", mode === "dark");
  localStorage.setItem(THEME_KEY, mode);
  refs.themeToggle.textContent = mode === "dark" ? "☾" : "☼";
  refs.themeToggle.setAttribute("aria-label", mode === "dark" ? "الانتقال إلى الوضع النهاري" : "الانتقال إلى الوضع الليلي");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#10151b" : "#f4eee2");
  if(announce) toast(mode === "dark" ? "ليل هادئ للقراءة." : "عاد الضوء الدافئ.");
}

function initGate(){
  refs.gate.classList.remove("hidden");
  refs.app.classList.add("hidden");
  refs.accessForm.addEventListener("submit", event => {
    event.preventDefault();
    if(refs.accessCode.value.trim() === "CON2027"){
      state.access = true;
      save();
      refs.gate.classList.add("hidden");
      refs.app.classList.remove("hidden");
      refs.accessCode.value = "";
      refs.accessError.textContent = "";
      boot();
      toast("أهلًا بك في CON.");
    }else{
      refs.accessError.textContent = "رمز الدخول غير صحيح.";
    }
  });
}

function boot(){
  if(!booted){
    bindEvents();
    booted = true;
  }
  renderNav();
  renderLevels();
  updateStats();
}

function bindEvents(){
  refs.searchInput.addEventListener("input", event => {
    cancelAnimationFrame(searchFrame);
    const value = event.target.value;
    searchFrame = requestAnimationFrame(() => search(value));
  });
  refs.continueBtn.addEventListener("click", continueReading);
  refs.randomBtn.addEventListener("click", randomBook);
  refs.backBtn.addEventListener("click", showMap);
  refs.mobileMenu.addEventListener("click", () => refs.sidebar.classList.toggle("open"));
  refs.exitBtn.addEventListener("click", openExitSummary);
  refs.passwordClose.addEventListener("click", closePasswordWithFarewell);
  refs.exitClose.addEventListener("click", () => refs.exitDialog.close());
  refs.confirmExit.addEventListener("click", exitSystem);
  refs.authorClose.addEventListener("click", () => refs.authorDialog.close());
  refs.levelPasswordForm.addEventListener("submit", handlePassword);
  refs.levelNav.addEventListener("click", event => {
    const button = event.target.closest("[data-level]");
    if(!button) return;
    requestLevel(Number(button.dataset.level));
    refs.sidebar.classList.remove("open");
  });
  refs.levelsGrid.addEventListener("click", event => {
    const card = event.target.closest("[data-level]");
    if(card) requestLevel(Number(card.dataset.level));
  });
  refs.booksGrid.addEventListener("click", handleBookGridClick);
  refs.readerClose.addEventListener("click", closeReader);
  refs.saveReader.addEventListener("click", saveReaderNote);
}

function resetData(){
  const confirmed = window.confirm("هل أنت متأكد؟ سيتم تصفير رحلتك القرائية والكتب والمواضع المحفوظة، وسيعود الموقع كأنه جديد.");
  if(!confirmed) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(PASSWORD_SCHEMA_KEY);
  window.location.reload();
}

function continueReading(){
  const first = DATA.levels.find(level => isUnlocked(level.id) && level.items.some((_,index) => !isDone(`${level.id}-${index+1}`)));
  if(first) return openLevel(first.id);
  const bookmarked = allBooks().find(book => bookRecord(book.id).page !== "");
  if(bookmarked) return openLevel(bookmarked.level);
  requestLevel(1);
}

function handlePassword(event){
  event.preventDefault();
  if(LEVEL_PASSWORDS[pendingLevel] === refs.levelPassword.value.trim()){
    if(!isUnlocked(pendingLevel)) state.unlocked.push(pendingLevel);
    save();
    refs.passwordDialog.close();
    refs.levelPassword.value = "";
    refs.passError.textContent = "";
    openLevel(pendingLevel);
    renderNav();
    renderLevels(refs.searchInput.value);
    toast(`فُتح المسار ${String(pendingLevel).padStart(2,"0")}.`);
  }else refs.passError.textContent = "الكلمة غير صحيحة.";
}

function closePasswordWithFarewell(){
  if(refs.passwordDialog.open) refs.passwordDialog.close();
  showFarewell();
}

function showFarewell(){
  refs.farewell.classList.add("show");
  refs.farewell.setAttribute("aria-hidden","false");
  setTimeout(() => {
    refs.farewell.classList.remove("show");
    refs.farewell.setAttribute("aria-hidden","true");
  }, 1700);
}

function renderNav(){
  refs.levelCount.textContent = `${DATA.levels.length} مستويات`;
  refs.levelNav.innerHTML = DATA.levels.map((level,index) => {
    const color = LEVEL_COLORS[index % LEVEL_COLORS.length];
    const label = level.id === 11 ? "CON Team" : `المستوى ${String(level.id).padStart(2,"0")}`;
    return `<button class="level-link ${currentLevel === level.id ? "active" : ""}" data-level="${level.id}" style="--level:${color}">
      <span class="level-num">${String(level.id).padStart(2,"0")}</span>
      <div><strong>${esc(level.id === 11 ? "مستوى فريق CON" : level.name)}</strong><small>${label} · ${level.count} مدخلًا</small></div>
      <span class="level-secret">${isUnlocked(level.id) ? "مفتوح" : "••••"}</span>
    </button>`;
  }).join("");
}

function renderLevels(filter=""){
  const q = filter.trim().toLowerCase();
  refs.levelsGrid.innerHTML = DATA.levels.map((level,index) => {
    const color = LEVEL_COLORS[index % LEVEL_COLORS.length];
    const matches = q ? level.items.filter(item => item.toLowerCase().includes(q)).length : level.items.length;
    const doneCount = level.items.reduce((count,_,i) => count + Number(isDone(`${level.id}-${i+1}`)),0);
    const progress = pct(doneCount, level.items.length);
    return `<article class="level-card" data-level="${level.id}" style="--level:${color}">
      <div class="card-top"><span class="chip">${level.id === 11 ? "CON / CRAFT" : `LEVEL ${String(level.id).padStart(2,"0")}`}</span><span class="lock">${isUnlocked(level.id) ? "●" : "○"}</span></div>
      <h4>${esc(level.id === 11 ? "مستوى خاص بفريق CON" : level.name)}</h4>
      <p>${esc(level.subtitle)}</p>
      <div class="level-preview" aria-label="نماذج من كتب المستوى">${(q ? level.items.filter(item => item.toLowerCase().includes(q)) : level.items).slice(0,3).map(item => `<span>${esc(extractTitle(item))}</span>`).join("")}</div>
      <div class="card-foot"><div class="card-progress"><span>${progress}%</span><div class="card-track"><i style="width:${progress}%"></i></div></div><button class="open-link" tabindex="-1">${isUnlocked(level.id) ? "دخول ←" : "فتح ↗"}</button></div>
      <div class="result-meta">${matches === level.items.length ? level.items.length : `${matches} نتائج`} مدخلًا · ${doneCount} مكتمل</div>
    </article>`;
  }).join("");
}

function requestLevel(id){
  if(isUnlocked(id)) return openLevel(id);
  pendingLevel = id;
  const level = DATA.levels.find(item => item.id === id);
  refs.passTitle.textContent = `فتح المستوى ${String(id).padStart(2,"0")} · ${id === 11 ? "فريق CON" : level.name}`;
  refs.levelPassword.value = "";
  refs.passError.textContent = "";
  refs.passwordDialog.showModal();
  requestAnimationFrame(() => refs.levelPassword.focus());
}

function openLevel(id){
  const level = DATA.levels.find(item => Number(item.id) === Number(id));
  if(!level || !Array.isArray(level.items)) return;
  currentLevel = Number(id);

  // Switch views first, then render the actual source items.
  refs.levelsGrid.classList.add("hidden");
  refs.levelView.classList.remove("hidden");
  refs.sectionHead.classList.add("hidden");
  refs.booksGrid.classList.remove("hidden");
  refs.booksGrid.hidden = false;
  refs.booksGrid.style.display = "grid";
  refs.booksGrid.style.visibility = "visible";

  refs.lvChip.textContent = `LEVEL ${String(id).padStart(2,"0")}${id === 11 ? " / CON" : ""}`;
  refs.lvTitle.textContent = id === 11 ? "مستوى خاص بفريق CON" : level.name;
  refs.lvSubtitle.textContent = level.subtitle || "";

  renderBooks(level, "");
  renderNav();
  window.scrollTo({top:0,behavior:"auto"});
}

function renderBooks(level, filter=""){
  if(!level || !Array.isArray(level.items)) return;

  const q = String(filter || "").trim().toLocaleLowerCase("ar");
  const books = level.items.map((title,index) => ({
    title: String(title),
    index,
    id: `${level.id}-${index+1}`
  })).filter(book => {
    if(!q) return true;
    const author = extractAuthor(book.title);
    return book.title.toLocaleLowerCase("ar").includes(q) || author.toLocaleLowerCase("ar").includes(q);
  });

  // The level page must always show the source books. Never rely on a CSS
  // state, stale search result, or an innerHTML parser to create the cards.
  refs.booksGrid.classList.remove("hidden");
  refs.booksGrid.hidden = false;
  refs.booksGrid.removeAttribute("hidden");
  refs.booksGrid.style.display = "grid";
  refs.booksGrid.style.visibility = "visible";

  const doneCount = books.reduce((count,book) => count + Number(isDone(book.id)),0);
  const progress = pct(doneCount, level.items.length);
  refs.lvPercent.textContent = `${progress}%`;
  refs.lvBar.style.width = `${progress}%`;
  refs.lvMeta.textContent = q
    ? `${books.length} نتيجة من أصل ${level.items.length} كتابًا`
    : `${level.items.length} كتابًا في هذا المستوى`;

  const fragment = document.createDocumentFragment();

  books.forEach(book => {
    const author = extractAuthor(book.title);
    const record = bookRecord(book.id);
    const marked = record.page !== "";
    const completed = isDone(book.id);

    const card = document.createElement("article");
    card.className = `book-card${completed ? " done" : ""}`;
    card.dataset.book = book.id;

    const num = document.createElement("span");
    num.className = "book-num";
    num.textContent = `ENTRY ${String(book.index+1).padStart(3,"0")}`;

    const title = document.createElement("div");
    title.className = "book-title";
    title.textContent = extractTitle(book.title);

    card.append(num, title);

    if(author){
      const authorButton = document.createElement("button");
      authorButton.className = "author-btn";
      authorButton.dataset.author = author;
      authorButton.textContent = `المؤلف: ${author} ↗`;
      card.append(authorButton);
    }else{
      const muted = document.createElement("span");
      muted.className = "author-btn muted";
      muted.textContent = "بيانات المؤلف غير محددة في المصدر";
      card.append(muted);
    }

    const actions = document.createElement("div");
    actions.className = "book-actions";

    const status = document.createElement("span");
    status.className = `book-status${completed ? " done-status" : ""}`;
    status.textContent = completed ? "✓ مكتمل" : marked ? `ص ${record.page}` : "قيد القراءة";

    const group = document.createElement("div");
    group.className = "book-action-group";

    const readerButton = document.createElement("button");
    readerButton.className = `reader-btn${marked ? " marked" : ""}`;
    readerButton.dataset.reader = book.id;
    readerButton.setAttribute("aria-label", "موضع القراءة");
    readerButton.textContent = "▯";

    const doneButton = document.createElement("button");
    doneButton.className = "done-btn";
    doneButton.dataset.done = book.id;
    doneButton.textContent = completed ? "✓ أتممت" : "أتممت القراءة";

    group.append(readerButton, doneButton);
    actions.append(status, group);
    card.append(actions);
    fragment.append(card);
  });

  // Replace the entire grid atomically. This guarantees that all source
  // items are present in the DOM before the browser paints the level page.
  refs.booksGrid.replaceChildren(fragment);

  if(level.units?.length){
    refs.unitsBox.classList.remove("hidden");
    refs.unitsBox.innerHTML = `<h4>وحدات تدريبية داخل «كتاب كون»</h4>${level.units.map(unit => `<div class="unit">${esc(unit.title)}</div>`).join("")}`;
  }else{
    refs.unitsBox.classList.add("hidden");
    refs.unitsBox.replaceChildren();
  }

  // Defensive integrity check: an unfiltered level must render exactly its
  // source count, never zero and never a fabricated count.
  if(!q && refs.booksGrid.children.length !== level.items.length){
    console.error("CON level render mismatch", {level: level.id, expected: level.items.length, actual: refs.booksGrid.children.length});
  }
}

function handleBookGridClick(event){
  const authorButton = event.target.closest("[data-author]");
  if(authorButton){
    event.stopPropagation();
    openAuthor(authorButton.dataset.author, currentLevel);
    return;
  }
  const readerButton = event.target.closest("[data-reader]");
  if(readerButton){
    event.stopPropagation();
    openReader(readerButton.dataset.reader);
    return;
  }
  const doneButton = event.target.closest("[data-done]");
  if(doneButton){
    event.stopPropagation();
    toggleDone(doneButton.dataset.done);
  }
}

function toggleDone(id){
  if(isDone(id)) state.done = state.done.filter(item => item !== id);
  else state.done.push(id);
  save();
  updateStats();
  const level = DATA.levels.find(item => id.startsWith(`${item.id}-`));
  if(level) renderBooks(level, refs.searchInput.value);
  renderLevels(refs.searchInput.value);
  toast(isDone(id) ? "تم تسجيل القراءة." : "أزيلت علامة الإتمام.");
}

function updateStats(){
  const progress = pct(completedCount());
  refs.topPercent.textContent = `${progress}%`;
  refs.topBar.style.width = `${progress}%`;
  refs.statBooks.textContent = total;
  refs.statDone.textContent = completedCount();
  const active = DATA.levels.find(level => level.items.some((_,i) => !isDone(`${level.id}-${i+1}`))) || DATA.levels.at(-1);
  refs.statLevel.textContent = String(active.id).padStart(2,"0");
  refs.statLevelName.textContent = active.id === 11 ? "فريق CON" : active.name;
  refs.statPages.textContent = totalPagesRead();
}

function search(query){
  if(currentLevel){
    const level = DATA.levels.find(item => item.id === currentLevel);
    if(level) renderBooks(level, query);
  }else renderLevels(query);
}

function showMap(){
  currentLevel = null;
  refs.levelView.classList.add("hidden");
  refs.levelsGrid.classList.remove("hidden");
  refs.sectionHead.classList.remove("hidden");
  renderNav();
  renderLevels(refs.searchInput.value);
  window.scrollTo({top:0,behavior:"smooth"});
}

function randomBook(){
  const available = allBooks().filter(book => isUnlocked(book.level) && !isDone(book.id));
  const pool = available.length ? available : allBooks().filter(book => isUnlocked(book.level));
  if(!pool.length) return requestLevel(1);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  openLevel(pick.level);
  requestAnimationFrame(() => {
    document.querySelectorAll(".random-picked").forEach(card => card.classList.remove("random-picked"));
    const card = document.querySelector(`[data-book="${CSS.escape(pick.id)}"]`);
    if(!card) return;
    card.scrollIntoView({behavior:"smooth",block:"center"});
    card.classList.add("random-picked");
    setTimeout(() => card.classList.remove("random-picked"), 2200);
    toast(`اختار لك: ${extractTitle(pick.title)}`);
  });
}

function openReader(id){
  currentBookId = id;
  const found = findBook(id);
  if(!found) return;
  const record = bookRecord(id);
  refs.readerTitle.textContent = extractTitle(found.title);
  refs.readerMeta.textContent = `${extractAuthor(found.title) || "مؤلف غير محدد"} · ${levelName(found.level)}`;
  refs.readerPage.value = record.page || "";
  refs.readerDialog.showModal();
}

function closeReader(){
  if(refs.readerDialog.open) refs.readerDialog.close();
}

function saveReaderNote(){
  if(!currentBookId) return;
  const record = bookRecord(currentBookId);
  record.page = refs.readerPage.value.trim();
  save();
  const found = findBook(currentBookId);
  refs.readerDialog.close();
  if(found) renderBooks(DATA.levels.find(level => level.id === found.level), refs.searchInput.value);
  updateStats();
  toast(record.page ? `حُفظ موضع القراءة: صفحة ${record.page}.` : "حُفظ موضع القراءة.");
}

function findBook(id){
  const [levelId] = String(id).split("-").map(Number);
  const level = DATA.levels.find(item => item.id === levelId);
  if(!level) return null;
  const index = Number(String(id).split("-")[1]) - 1;
  const title = level.items[index];
  return title == null ? null : {id,title,index,level:levelId};
}

function totalPagesRead(){
  return Object.values(state.reading).reduce((sum,item) => sum + (Number(item.page) || 0),0);
}

function openExitSummary(){
  const progress = pct(completedCount());
  refs.exitDone.textContent = completedCount();
  refs.exitPercent.textContent = `${progress}%`;
  refs.exitPages.textContent = totalPagesRead();
  refs.exitProgressLabel.textContent = `${progress}%`;
  refs.exitBar.style.width = `${progress}%`;
  refs.exitDialog.showModal();
}

function exitSystem(){
  refs.exitDialog.close();
  state.access = false;
  save();
  refs.app.classList.add("hidden");
  refs.gate.classList.remove("hidden");
  refs.accessCode.focus();
  showFarewell();
}

function openAuthor(author, levelId){
  const level = DATA.levels.find(item => item.id === levelId);
  const works = level ? level.items.filter(item => extractAuthor(item) === author).length : 0;
  refs.authorName.textContent = author;
  refs.authorWorks.textContent = `ظهر في هذا المستوى في ${works} ${works === 1 ? "مدخل" : "مداخل"}.`;
  refs.authorBio.textContent = "لا يحتوي الملف المرفق على سيرة موثقة للمؤلف؛ لذلك لم تُختلق معلومات من خارج المنهج.";
  refs.authorTips.textContent = "يمكن إضافة ملاحظات قراءة موثقة للمؤلف لاحقًا من بيانات المشروع، من دون تحويل الواجهة إلى موسوعة معلوماتية.";
  refs.authorNote.textContent = "العرض الحالي يلتزم بما يقدمه المصدر: اسم المؤلف وعناوين الأعمال فقط.";
  refs.authorDialog.showModal();
}

function levelName(id){
  const level = DATA.levels.find(item => item.id === id);
  return level ? (id === 11 ? "فريق CON" : level.name) : "";
}

function extractTitle(value){return value.split(" — ")[0].replace(/\s+\([^)]*\)$/," ").trim();}
function extractAuthor(value){const parts=value.split(" — ");return parts.length < 2 ? "" : parts.slice(1).join(" — ").replace(/\s*\([^)]*\)\s*$/," ").trim();}
function esc(value){return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));}
function escAttr(value){return esc(value).replace(/`/g,"&#96;");}

initRefs();
initTheme();
initGate();
