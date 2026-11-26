# مجتمع طلاب تقنية المعلومات — نسخة الويب للهاتف

هذه نسخة أولية قابلة للتشغيل محليًا ومهيأة للربط بمشروع Firebase جديد. التصميم Mobile-first ويعمل عبر المتصفح، وليس تطبيق Android.

## ما يتضمنه المشروع
- تسجيل دخول وإنشاء حساب بالبريد وكلمة المرور.
- طلبات التسجيل تبدأ بحالة `pending` ولا تدخل المجموعة قبل اعتماد الإدارة.
- غرفة جماعية واحدة ثابتة: `groups/main/messages`.
- رسائل نصية ورفع مرفقات حتى 15MB، مع تنزيل الملفات عبر Firebase SDK وقواعد الوصول بدل نشر روابط تنزيل عامة.
- صفحة موارد تعليمية وإعلانات.
- واجهة إدارة أولية لاعتماد الأعضاء ونشر الإعلانات.
- قواعد Firestore وStorage تمنع الوصول غير المصرح.
- Cloud Function لاعتماد العضو من مشرف موثوق.

## مهم قبل النشر
هذه ليست خدمة منشورة بعد، ولا يوجد رابط عام حتى تنشئ مشروع Firebase وتربطه وتنشره. لا تضع مفاتيح Admin SDK أو service-account داخل ملفات الواجهة. إعداد Firebase Web config فقط يوضع في `src/firebase.js`.

## إنشاء مشروع Firebase جديد
1. افتح https://console.firebase.google.com/ وأنشئ مشروعًا جديدًا باسم `it-student-community`.
2. أضف تطبيق Web (رمز `</>`)، وسجّل اسمًا مثل `IT Community Web`.
3. انسخ إعدادات Firebase Web App إلى `src/firebase.js` بدل القيم `PASTE_...` و`YOUR_PROJECT_ID`.
4. من Authentication > Sign-in method فعّل Email/Password.
5. من Firestore Database أنشئ قاعدة بيانات في وضع الإنتاج.
6. من Storage أنشئ bucket.
7. من Project settings > General تأكد من أن إعدادات Web App صحيحة.

## التشغيل والنشر من الكمبيوتر
يتطلب Node.js 20 أو أحدث.
```bash
npm install
npm run dev
```
افتح الرابط المحلي الذي يظهر في الطرفية. للنشر:
```bash
npx firebase-tools login
npx firebase-tools use --add
npm run build
npx firebase-tools deploy
```
اختر مشروع Firebase الجديد عند الربط. قد يتطلب نشر Cloud Functions تفعيل الفوترة حسب المنطقة والخدمات المتاحة.

## نشر القواعد والوظائف
```bash
cd functions
npm install
npm run build
cd ..
npx firebase-tools deploy --only firestore:rules,storage,functions
```
انشر Hosting بعد نجاح البناء:
```bash
npm run build
npx firebase-tools deploy --only hosting
```

## تعيين أول مشرف
1. أنشئ حسابك من صفحة الموقع.
2. من Firebase Console > Authentication انسخ UID الخاص بحسابك.
3. لا تجعل أي مستخدم مشرفًا من واجهة الموقع. يجب تعيين custom claim بواسطة Admin SDK من بيئة موثوقة.
4. شغّل `gcloud auth application-default login` من بيئة موثوقة بعد تثبيت Google Cloud CLI، ثم `npm install firebase-admin` في مجلد المشروع، وبعدها `FIREBASE_PROJECT_ID=معرف_مشروعك node scripts/set-admin.mjs بريدك`. لا ترفع service account إلى GitHub ولا ترسله في المحادثة.
5. السكربت يعيّن custom claim ويحوّل ملف المستخدم إلى `approved` باستخدام Admin SDK. يجب تشغيله من بيئة موثوقة بعد إعداد Application Default Credentials، وليس من المتصفح.

## حدود النسخة الحالية التي يجب إكمالها قبل الاستخدام الفعلي
- تعيين أول مشرف وملفه المعتمد يحتاجان خطوة إدارية آمنة من Admin SDK؛ لا يوجد زر عام يمنح صلاحية الإدارة.
- إضافة الموارد إلى مكتبة الملفات من لوحة الإدارة غير منفذة بعد؛ صفحة الموارد تعرض العناصر التي تضيفها الإدارة إلى Firestore.
- إشعارات الويب الفورية، البحث، تعديل الملف الشخصي، مراجعة البلاغات، ومكافحة الإساءة المتقدمة ليست ضمن هذه النسخة الأولية.
- اختبر القواعد باستخدام Firebase Emulator Suite وحساب طالب وحساب مشرف قبل مشاركة الرابط.
- قواعد التخزين تتحقق من النوع والحجم، لكن يجب إضافة فحص أمني للملفات ومراجعة امتدادات الأنواع قبل اعتمادها للإنتاج.
- لا تضع بيانات شخصية حساسة في الإعلانات أو الملفات العامة.

## بنية البيانات
- `users/{uid}`: اسم العرض والحالة فقط للقراءة الذاتية، والإدارة تستطيع مراجعة الطلبات.
- `groups/main/messages/{messageId}`: الرسائل في الغرفة الوحيدة.
- `announcements/{id}`: إعلانات الإدارة.
- `resources/{id}`: روابط وبيانات الموارد التعليمية.
- لا توجد بنية محادثات خاصة أو مجموعات فرعية.
