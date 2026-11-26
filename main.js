import "./style.css";
import { auth, db, storage, functions } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "firebase/auth";
import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp,
  doc, getDoc, setDoc, where, getDocs
} from "firebase/firestore";
import { ref, uploadBytes, getBlob } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

const app = document.querySelector("#app");
let currentUser = null;
let profile = null;
let stopMessages = null;
let stopAnnouncements = null;

const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp = value => value?.toDate ? value.toDate().toLocaleString("ar") : "الآن";
const initials = name => (name || "ط").trim().slice(0,1);

function shell(content, active="chat") {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand-mark">IT</div>
      <div class="brand-copy"><strong>مجتمع طلاب تقنية المعلومات</strong><small>مساحة تعليمية تجمعنا</small></div>
      <button class="icon-btn" id="logout" aria-label="تسجيل الخروج">↪</button>
    </header>
    <main class="main">${content}</main>
    <nav class="bottom-nav">
      <button data-page="chat" class="${active==="chat"?"active":""}"><span>▤</span>المجموعة</button>
      <button data-page="resources" class="${active==="resources"?"active":""}"><span>▣</span>الموارد</button>
      <button data-page="profile" class="${active==="profile"?"active":""}"><span>◉</span>حسابي</button>
      ${profile?.role==="admin" ? `<button data-page="admin" class="${active==="admin"?"active":""}"><span>⚙</span>الإدارة</button>` : ""}
    </nav>`;
  document.querySelector("#logout")?.addEventListener("click", () => signOut(auth));
  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => navigate(b.dataset.page)));
}

function authScreen() {
  app.innerHTML = `
    <section class="auth-wrap">
      <div class="hero">
        <div class="hero-logo">IT</div><p class="eyebrow">IT STUDENT COMMUNITY</p>
        <h1>مجتمع طلاب<br>تقنية المعلومات</h1>
        <p>تعلّم، شارك المعرفة، وتواصل مع زملائك في مساحة واحدة.</p>
      </div>
      <div class="auth-card">
        <div class="tabs"><button class="selected" id="loginTab">تسجيل الدخول</button><button id="registerTab">إنشاء حساب</button></div>
        <form id="authForm">
          <label>الاسم الظاهر <input id="displayName" autocomplete="name" placeholder="اسمك كما سيظهر للطلاب" /></label>
          <label>البريد الإلكتروني <input id="email" type="email" required autocomplete="email" placeholder="name@example.com" /></label>
          <label>كلمة المرور <input id="password" type="password" minlength="6" required autocomplete="current-password" placeholder="6 أحرف على الأقل" /></label>
          <button class="primary full" type="submit" id="authSubmit">دخول إلى المجتمع</button>
          <p class="notice" id="authNotice">الحسابات الجديدة تحتاج موافقة الإدارة قبل دخول المجموعة.</p>
          <p class="error" id="authError"></p>
        </form>
      </div>
      <footer>منصة طلابية مستقلة • لا نعرض أرقام الهواتف للأعضاء</footer>
    </section>`;
  let mode = "login";
  const display = document.querySelector("#displayName");
  const loginTab = document.querySelector("#loginTab");
  const registerTab = document.querySelector("#registerTab");
  function setMode(next) {
    mode = next;
    display.closest("label").hidden = mode === "login";
    display.required = mode === "register";
    loginTab.classList.toggle("selected", mode === "login");
    registerTab.classList.toggle("selected", mode === "register");
    document.querySelector("#authSubmit").textContent = mode === "login" ? "دخول إلى المجتمع" : "إرسال طلب الانضمام";
    document.querySelector("#authNotice").textContent = mode === "login" ? "إذا كان حسابك جديدًا، أنشئ حسابًا وانتظر موافقة الإدارة." : "لن تتمكن من دخول المجموعة حتى تعتمد الإدارة طلبك.";
  }
  setMode("login");
  loginTab.onclick = () => setMode("login");
  registerTab.onclick = () => setMode("register");
  document.querySelector("#authForm").onsubmit = async e => {
    e.preventDefault();
    const error = document.querySelector("#authError");
    const button = document.querySelector("#authSubmit");
    error.textContent = ""; button.disabled = true; button.textContent = "يرجى الانتظار…";
    try {
      const email = document.querySelector("#email").value.trim();
      const password = document.querySelector("#password").value;
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const name = display.value.trim();
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(db, "users", cred.user.uid), {
          displayName: name, status: "pending", role: "student",
          createdAt: serverTimestamp()
        });
        showPending();
      }
    } catch (err) {
      error.textContent = friendlyError(err);
    } finally {
      button.disabled = false;
      button.textContent = mode === "login" ? "دخول إلى المجتمع" : "إرسال طلب الانضمام";
    }
  };
}

function friendlyError(err) {
  const map = {
    "auth/invalid-credential":"بيانات الدخول غير صحيحة.",
    "auth/email-already-in-use":"هذا البريد مسجل مسبقًا.",
    "auth/weak-password":"كلمة المرور قصيرة؛ استخدم 6 أحرف على الأقل.",
    "auth/invalid-email":"صيغة البريد الإلكتروني غير صحيحة.",
    "permission-denied":"ليست لديك صلاحية لتنفيذ هذا الإجراء."
  };
  return map[err.code] || "تعذر إكمال العملية. تحقق من الاتصال وإعدادات Firebase ثم حاول مجددًا.";
}
function showPending() {
  app.innerHTML = `<section class="status-screen"><div class="status-icon">✓</div><h1>تم إرسال طلبك</h1><p>حسابك الآن قيد مراجعة الإدارة. ستتمكن من دخول المجتمع بعد الموافقة.</p><button class="secondary" id="pendingLogout">تسجيل الخروج</button></section>`;
  document.querySelector("#pendingLogout").onclick = () => signOut(auth);
}
function showRejected() {
  app.innerHTML = `<section class="status-screen"><div class="status-icon muted">!</div><h1>لا يمكنك الدخول حاليًا</h1><p>حسابك غير معتمد أو موقوف. يرجى التواصل مع إدارة المجتمع.</p><button class="secondary" id="pendingLogout">تسجيل الخروج</button></section>`;
  document.querySelector("#pendingLogout").onclick = () => signOut(auth);
}

async function loadProfile(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data() : null;
}
async function navigate(page) {
  if (page === "chat") return renderChat();
  if (page === "resources") return renderResources();
  if (page === "profile") return renderProfile();
  if (page === "admin") return renderAdmin();
}

function renderChat() {
  shell(`
    <section class="page-heading"><div><p class="eyebrow">المساحة المشتركة</p><h1>المجموعة العامة</h1></div><span class="live-pill"><i></i> غرفة واحدة</span></section>
    <div id="announcements"></div>
    <section class="chat-card">
      <div class="chat-head"><div class="avatar">IT</div><div><strong>طلاب تقنية المعلومات</strong><small>المجموعة الرسمية لجميع الأعضاء المعتمدين</small></div></div>
      <div class="messages" id="messages"><div class="empty">جارٍ تحميل الرسائل…</div></div>
      <form class="composer" id="messageForm">
        <label class="attach-btn" for="attachment" title="إرفاق ملف">＋</label><input id="attachment" type="file" hidden accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" />
        <input id="messageText" maxlength="3000" placeholder="اكتب رسالة للمجموعة…" autocomplete="off" />
        <button class="send-btn" type="submit" aria-label="إرسال">➤</button>
      </form>
      <p class="composer-hint">المراسلة داخل المجموعة المشتركة فقط. لا توجد رسائل خاصة.</p>
    </section>`, "chat");
  subscribeMessages();
  subscribeAnnouncements();
  document.querySelector("#messageForm").onsubmit = sendMessage;
  document.querySelector("#attachment").onchange = uploadAttachment;
}
function subscribeMessages() {
  if (stopMessages) stopMessages();
  const q = query(collection(db, "groups", "main", "messages"), orderBy("createdAt", "asc"), limit(100));
  stopMessages = onSnapshot(q, snap => {
    const box = document.querySelector("#messages"); if (!box) return;
    if (snap.empty) { box.innerHTML = `<div class="empty">لا توجد رسائل بعد. ابدأوا الحوار العلمي باحترام.</div>`; return; }
    box.innerHTML = snap.docs.map(d => {
      const m = d.data(), mine = m.senderId === currentUser.uid;
      let attachment = "";
      if (m.storagePath) attachment = `<button class="file-chip" type="button" data-file="${esc(m.storagePath)}" data-name="${esc(m.fileName || "ملف مرفق")}">📎 ${esc(m.fileName || "ملف مرفق")}</button>`;
      return `<article class="message ${mine?"mine":""}"><div class="message-meta"><b>${esc(m.senderName || "طالب")}</b><time>${stamp(m.createdAt)}</time></div>${m.text?`<p>${esc(m.text)}</p>`:""}${attachment}</article>`;
    }).join("");
    box.querySelectorAll("[data-file]").forEach(btn => btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "جارٍ تنزيل الملف…";
      try {
        const blob = await getBlob(ref(storage, btn.dataset.file), 15 * 1024 * 1024);
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = objectUrl; a.download = btn.dataset.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      } catch (err) { alert(friendlyError(err)); }
      finally { btn.disabled = false; btn.textContent = "📎 " + btn.dataset.name; }
    });
    box.scrollTop = box.scrollHeight;
  }, err => { const box=document.querySelector("#messages"); if(box) box.innerHTML=`<div class="empty">${esc(friendlyError(err))}</div>`; });
}
async function sendMessage(e) {
  e.preventDefault();
  const input = document.querySelector("#messageText"), text = input.value.trim();
  if (!text) return;
  try {
    await addDoc(collection(db, "groups", "main", "messages"), {
      text, senderId: currentUser.uid, senderName: profile.displayName,
      createdAt: serverTimestamp()
    });
    input.value = "";
  } catch (err) { alert(friendlyError(err)); }
}
async function uploadAttachment(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const allowed = /^(image\/|video\/|audio\/|application\/pdf|text\/plain|application\/vnd\.|application\/msword)/;
  if (!allowed.test(file.type) && !/\.(pdf|docx?|pptx?|xlsx?|txt)$/i.test(file.name)) { alert("نوع الملف غير مدعوم."); e.target.value=""; return; }
  if (file.size > 15 * 1024 * 1024) { alert("الحد الأقصى لحجم الملف 15 ميجابايت."); e.target.value=""; return; }
  try {
    const safeName = file.name.replace(/[^\w.\-أ-ي]/g, "_");
    const path = `group/main/${currentUser.uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    await addDoc(collection(db, "groups", "main", "messages"), {
      text: "", fileUrl: url, fileName: file.name, storagePath: path,
      senderId: currentUser.uid, senderName: profile.displayName,
      createdAt: serverTimestamp()
    });
  } catch (err) { alert(friendlyError(err)); }
  e.target.value = "";
}
function subscribeAnnouncements() {
  if (stopAnnouncements) stopAnnouncements();
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3));
  stopAnnouncements = onSnapshot(q, snap => {
    const el = document.querySelector("#announcements"); if (!el) return;
    el.innerHTML = snap.docs.map(d => `<article class="announcement"><span>إعلان</span><strong>${esc(d.data().title)}</strong><p>${esc(d.data().body)}</p></article>`).join("");
  });
}
async function renderResources() {
  shell(`<section class="page-heading"><div><p class="eyebrow">مكتبة المجتمع</p><h1>الملفات التعليمية</h1></div></section><div class="resource-intro">مكان موحد للمراجع والملفات التي تنفع طلاب تقنية المعلومات.</div><div id="resourceList" class="resource-list"><div class="empty">جارٍ تحميل الموارد…</div></div>`, "resources");
  const q = query(collection(db, "resources"), orderBy("createdAt", "desc"), limit(50));
  try {
    const snap = await getDocs(q);
    const el = document.querySelector("#resourceList"); if (!el) return;
    el.innerHTML = snap.empty ? `<div class="empty">لم تُنشر ملفات تعليمية بعد.</div>` : snap.docs.map(d => {
      const r=d.data(); return `<a class="resource-item" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="resource-icon">PDF</span><span><b>${esc(r.title)}</b><small>${esc(r.description || "ملف تعليمي")}</small></span><span class="arrow">←</span></a>`;
    }).join("");
  } catch(err) { document.querySelector("#resourceList").textContent = friendlyError(err); }
}
function renderProfile() {
  shell(`<section class="page-heading"><div><p class="eyebrow">ملفك الشخصي</p><h1>حسابي</h1></div></section>
    <div class="profile-card"><div class="profile-avatar">${esc(initials(profile.displayName))}</div><h2>${esc(profile.displayName)}</h2><p>${esc(currentUser.email || "")}</p><span class="status-tag">عضو معتمد</span></div>
    <div class="privacy-note"><b>خصوصيتك مهمة</b><p>لا تظهر أرقام الهواتف أو البريد الإلكتروني لبقية الطلاب. بريدك يظهر لك أنت فقط في هذه الصفحة.</p></div>`, "profile");
}
async function renderAdmin() {
  if (profile.role !== "admin") return renderChat();
  shell(`<section class="page-heading"><div><p class="eyebrow">إدارة المجتمع</p><h1>طلبات الانضمام</h1></div></section>
    <div class="admin-note">اعتمد فقط الأشخاص الذين تعرف أنهم من طلاب المجتمع.</div><div id="pendingList" class="pending-list">جارٍ تحميل الطلبات…</div>
    <section class="admin-publish"><h2>نشر إعلان</h2><form id="announcementForm"><input id="announcementTitle" placeholder="عنوان الإعلان" required maxlength="100"><textarea id="announcementBody" placeholder="نص الإعلان" required maxlength="1000"></textarea><button class="primary full">نشر الإعلان</button></form></section>`, "admin");
  const q = query(collection(db, "users"), where("status", "==", "pending"), limit(50));
  const snap = await getDocs(q);
  const list = document.querySelector("#pendingList");
  list.innerHTML = snap.empty ? `<div class="empty">لا توجد طلبات جديدة.</div>` : snap.docs.map(d => `<div class="pending-item"><div><b>${esc(d.data().displayName || "طالب")}</b><small>طلب انضمام جديد</small></div><button class="approve" data-uid="${d.id}">موافقة</button></div>`).join("");
  list.querySelectorAll("[data-uid]").forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try { await httpsCallable(functions, "approveMember")({ uid: btn.dataset.uid }); await renderAdmin(); }
    catch(err) { alert(friendlyError(err)); btn.disabled = false; }
  });
  document.querySelector("#announcementForm").onsubmit = async e => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "announcements"), {
        title: document.querySelector("#announcementTitle").value.trim(),
        body: document.querySelector("#announcementBody").value.trim(),
        createdAt: serverTimestamp(), createdBy: currentUser.uid
      });
      e.target.reset(); alert("تم نشر الإعلان.");
    } catch(err) { alert(friendlyError(err)); }
  };
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (stopMessages) { stopMessages(); stopMessages = null; }
  if (stopAnnouncements) { stopAnnouncements(); stopAnnouncements = null; }
  if (!user) { profile = null; authScreen(); return; }
  try {
    profile = await loadProfile(user);
    if (!profile) { showPending(); return; }
    if (profile.status === "pending") { showPending(); return; }
    if (profile.status !== "approved") { showRejected(); return; }
    // الدور الإداري يُقرأ من custom claims في الخادم، لا من اختيار المستخدم.
    const token = await user.getIdTokenResult(true);
    profile.role = token.claims.admin === true ? "admin" : "student";
    renderChat();
  } catch (err) {
    app.innerHTML = `<section class="status-screen"><h1>تعذر تحميل الحساب</h1><p>${esc(friendlyError(err))}</p><button class="secondary" onclick="location.reload()">إعادة المحاولة</button></section>`;
  }
});