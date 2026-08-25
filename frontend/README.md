# sTealORs (Next.js)

Mockup เดิมถูกพอร์ตมาเป็น Next.js พร้อม login ตาม role — UI เดิมไม่ได้ redesign

## รันโปรเจกต์

```bash
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000) จะไปหน้า `/login` ก่อน

## Login / Role

ตอนนี้หน้า login มีแค่ **Continue with Google** (mock — ยังไม่ต่อ Google OAuth จริง)

| วิธีเข้า | ผลลัพธ์ |
|---|---|
| Continue with Google | เข้าเป็นผู้รับจ้าง (`contractor.demo@gmail.com`) — สลับ **ผู้รับจ้าง / เจ้าของโครงการ** ได้จากปุ่มใน sidebar |
| Gmail ใน `ADMIN_GMAILS` | เข้าหน้าผู้ดูแลระบบเท่านั้น (ตั้งใน `lib/auth.ts`) |

## โครงสร้างสำคัญ

- `app/login` — หน้า login (Google)
- `components/StealorsApp.tsx` — โหลด UI/logic จาก mockup เดิมหลัง auth
- `public/mockup-body.html` + `public/mockup-app.js` — UI + behavior จาก mockup.HTML
- `app/mockup.css` — สไตล์เดิม
