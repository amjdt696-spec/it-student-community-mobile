// شغّل من بيئة موثوقة تملك صلاحية Admin SDK للمشروع.
// الاستخدام: FIREBASE_PROJECT_ID=your-project-id node scripts/set-admin.mjs EMAIL
// يجب توفير Application Default Credentials مسبقًا، مثلًا عبر gcloud auth application-default login.
// لا ترفع أي ملف service-account إلى GitHub ولا ترسله في المحادثة.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!email) throw new Error("استخدم: node scripts/set-admin.mjs your-email@example.com");
if (!projectId) throw new Error("عيّن FIREBASE_PROJECT_ID بمعرّف مشروع Firebase.");
initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { admin: true });
await getFirestore().collection("users").doc(user.uid).set({
  displayName: user.displayName || email.split("@")[0],
  status: "approved",
  role: "student",
  approvedAt: FieldValue.serverTimestamp()
}, { merge: true });
console.log(`تم تعيين صلاحية الإدارة واعتماد الحساب: ${email}`);
console.log("سجّل الخروج ثم الدخول مجددًا لتحديث رمز الدخول.");
