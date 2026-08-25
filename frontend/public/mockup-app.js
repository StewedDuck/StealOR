
/* ---------------- DATA ---------------- */
const TYPES = ["Web Application","Mobile Application","ERP / System Integration","Cloud Infrastructure","Cybersecurity","Data Analytics & AI","Network Infrastructure"];

const tors = [
  {id:"TOR-2569-0142", title:"จ้างพัฒนาระบบบริหารจัดการเอกสารอิเล็กทรอนิกส์ (e-Document)", agency:"กรุงเทพมหานคร (BMA)", type:"Web Application", status:"open", budget:[2500000,4200000], closing:"2026-09-02", posted:"2026-08-12", match:87,
    matchedQ:["ISO 29110 certified","Registered vendor, DGA","React / Node.js experience","API integration ≥ 3 systems"],
    unmatchedQ:["ISO 27001 certified"],
    desc:"พัฒนาระบบจัดเก็บและสืบค้นเอกสารอิเล็กทรอนิกส์แบบรวมศูนย์ รองรับการเชื่อมต่อกับระบบสารบรรณเดิม พร้อมระบบลงนามดิจิทัลและควบคุมสิทธิ์การเข้าถึงตามลำดับชั้นหน่วยงาน",
    contact:{name:"คุณสุนิสา ปิยะวงศ์", role:"เจ้าหน้าที่พัสดุ", email:"sunisa.p@bangkok.go.th", phone:"02-123-4567"}, saved:true},

  {id:"TOR-2569-0138", title:"จ้างเหมาพัฒนาแอปพลิเคชันมือถือสำหรับให้บริการประชาชน", agency:"สำนักงานเขตบางรัก", type:"Mobile Application", status:"closing", budget:[1800000,2600000], closing:"2026-08-19", posted:"2026-07-30", match:74,
    matchedQ:["React Native / Flutter","UX for public-facing services"],
    unmatchedQ:["Prior government mobile app delivery","Thai PDPA compliance certification"],
    desc:"พัฒนาแอปพลิเคชันมือถือ iOS/Android สำหรับให้บริการข้อมูลและรับเรื่องร้องเรียนจากประชาชนในพื้นที่ พร้อมระบบแจ้งเตือนและติดตามสถานะคำร้อง", 
    contact:{name:"คุณอนุชา ทองดี", role:"หัวหน้าฝ่ายเทคโนโลยีสารสนเทศ", email:"anucha.t@bangrak.go.th", phone:"02-234-5678"}, saved:false},

  {id:"TOR-2569-0151", title:"โครงการปรับปรุงโครงสร้างพื้นฐานคลาวด์ (Cloud Infrastructure Modernization)", agency:"การไฟฟ้านครหลวง (MEA)", type:"Cloud Infrastructure", status:"open", budget:[6500000,9800000], closing:"2026-09-25", posted:"2026-08-01", match:91,
    matchedQ:["AWS / Azure certified architect","Cloud Infrastructure","Registered vendor, DGA","Migration of legacy systems ≥ 5 yrs"],
    unmatchedQ:[],
    desc:"ปรับปรุงระบบโครงสร้างพื้นฐานคลาวด์เพื่อรองรับปริมาณข้อมูลผู้ใช้ไฟฟ้าที่เพิ่มขึ้น ครอบคลุมการย้ายระบบเดิมขึ้นคลาวด์ การออกแบบ high availability และแผนสำรองข้อมูล",
    contact:{name:"คุณวรพงษ์ ศรีสมบัติ", role:"ผู้จัดการโครงการ", email:"worapong.s@mea.or.th", phone:"02-345-6789"}, saved:true},

  {id:"TOR-2569-0129", title:"จ้างที่ปรึกษาพัฒนาระบบ Data Analytics และ Business Intelligence", agency:"การประปานครหลวง (MWA)", type:"Data Analytics & AI", status:"open", budget:[3200000,5000000], closing:"2026-09-10", posted:"2026-08-05", match:62,
    matchedQ:["SQL / data warehousing","Dashboard & BI tooling"],
    unmatchedQ:["Machine learning model deployment","Water utility domain experience","Power BI enterprise licensing"],
    desc:"พัฒนาระบบวิเคราะห์ข้อมูลปริมาณการใช้น้ำและพยากรณ์ความต้องการ พร้อม dashboard สำหรับผู้บริหารระดับสูง เชื่อมต่อกับระบบมิเตอร์อัจฉริยะ (Smart Meter)",
    contact:{name:"คุณภัทรา จันทรวงศ์", role:"เจ้าหน้าที่จัดซื้อจัดจ้าง", email:"pattra.c@mwa.co.th", phone:"02-456-7890"}, saved:false},

  {id:"TOR-2569-0147", title:"จ้างพัฒนาระบบรักษาความปลอดภัยไซเบอร์ (Cybersecurity Operations Center)", agency:"สำนักงานคณะกรรมการดิจิทัลฯ (DGA)", type:"Cybersecurity", status:"open", budget:[8000000,12500000], closing:"2026-10-05", posted:"2026-08-10", match:null,
    desc:"จัดตั้งศูนย์ปฏิบัติการเฝ้าระวังภัยคุกคามทางไซเบอร์ (SOC) แบบ 24/7 พร้อมระบบตรวจจับและตอบสนองต่อภัยคุกคามอัตโนมัติ (SOAR) สำหรับหน่วยงานภาครัฐ",
    contact:{name:"คุณกิตติ วัฒนกุล", role:"ผู้อำนวยการฝ่ายความมั่นคงปลอดภัย", email:"kitti.w@dga.or.th", phone:"02-567-8901"}, saved:false},

  {id:"TOR-2569-0136", title:"โครงการพัฒนาเว็บไซต์และระบบสมาชิกออนไลน์", agency:"ธนาคารออมสิน", type:"Web Application", status:"closing", budget:[1200000,1900000], closing:"2026-08-20", posted:"2026-07-25", match:68,
    matchedQ:["React / Node.js","Payment gateway integration"],
    unmatchedQ:["Banking-grade security audit trail","PCI DSS familiarity"],
    desc:"พัฒนาเว็บไซต์องค์กรใหม่พร้อมระบบสมัครสมาชิกออนไลน์และเชื่อมต่อระบบยืนยันตัวตนแบบดิจิทัล (e-KYC) สำหรับลูกค้าธนาคาร",
    contact:{name:"คุณดวงพร รุ่งเรือง", role:"เจ้าหน้าที่จัดซื้อ IT", email:"duangporn.r@gsb.or.th", phone:"02-678-9012"}, saved:true},

  {id:"TOR-2569-0119", title:"จ้างบำรุงรักษาระบบเครือข่ายคอมพิวเตอร์และศูนย์ข้อมูล", agency:"กรมสรรพากร", type:"Network Infrastructure", status:"open", budget:[2000000,3100000], closing:"2026-09-18", posted:"2026-08-02", match:null,
    desc:"บำรุงรักษาระบบเครือข่ายและอุปกรณ์ศูนย์ข้อมูลตลอด 24 ชั่วโมง รวมถึงการอัปเกรดอุปกรณ์ Firewall และ Switch หลักของหน่วยงาน",
    contact:{name:"คุณประยุทธ มั่นคง", role:"หัวหน้าฝ่ายโครงสร้างพื้นฐาน", email:"prayuth.m@rd.go.th", phone:"02-789-0123"}, saved:false},

  {id:"TOR-2569-0155", title:"จ้างพัฒนาระบบ ERP สำหรับหน่วยงานภาครัฐ (ระยะที่ 2)", agency:"การรถไฟฟ้าขนส่งมวลชนแห่งประเทศไทย (MRTA)", type:"ERP / System Integration", status:"open", budget:[9500000,15000000], closing:"2026-10-12", posted:"2026-08-08", match:79,
    matchedQ:["SAP / Odoo implementation","System integration ≥ 3 systems","Registered vendor, DGA"],
    unmatchedQ:["Rail/transit domain experience"],
    desc:"พัฒนาต่อยอดระบบ ERP ระยะที่ 2 ครอบคลุมโมดูลจัดซื้อจัดจ้าง บัญชี และบริหารทรัพย์สิน เชื่อมต่อกับระบบเดิมที่ใช้งานอยู่",
    contact:{name:"คุณธนกร อินทรสุวรรณ", role:"ผู้จัดการโครงการ ERP", email:"thanakorn.i@mrta.co.th", phone:"02-890-1234"}, saved:false},

  {id:"TOR-2569-0161", title:"จ้างพัฒนาแพลตฟอร์มจองคิวออนไลน์สำหรับโรงพยาบาลในสังกัด", agency:"สำนักการแพทย์ กรุงเทพมหานคร", type:"Web Application", status:"open", budget:[1500000,2400000], closing:"2026-09-28", posted:"2026-08-14", match:83,
    matchedQ:["React / Node.js","Healthcare scheduling systems","API integration ≥ 3 systems"],
    unmatchedQ:["HL7/FHIR standard experience"],
    desc:"พัฒนาแพลตฟอร์มจองคิวออนไลน์และระบบแจ้งเตือนนัดหมายสำหรับโรงพยาบาลในสังกัดกรุงเทพมหานคร 12 แห่ง เชื่อมต่อกับระบบ HIS เดิม",
    contact:{name:"คุณรัชนี พงษ์ไพบูลย์", role:"เจ้าหน้าที่จัดซื้อจัดจ้าง", email:"ratchanee.p@bkkhealth.go.th", phone:"02-901-2345"}, saved:false},

  {id:"TOR-2569-0111", title:"จ้างพัฒนาระบบบริหารจัดการงบประมาณและติดตามโครงการ", agency:"สำนักงบประมาณกรุงเทพมหานคร", type:"ERP / System Integration", status:"draft", budget:[4000000,6000000], closing:null, posted:"2026-08-13", expectedRelease:"2026-08-25", match:null, isOwnerTor:true,
    desc:"ระบบสำหรับบริหารจัดการงบประมาณประจำปีและติดตามความคืบหน้าโครงการของหน่วยงานในสังกัด กทม. พร้อม dashboard สรุปผลการเบิกจ่ายแบบเรียลไทม์ — ขณะนี้อยู่ระหว่างร่าง เปิดให้ผู้รับจ้างที่สนใจอ่านและแสดงความคิดเห็นก่อนประกาศจริง",
    contact:{name:"คุณศิริพร วงศ์เจริญ", role:"หัวหน้ากลุ่มงบประมาณ", email:"siriporn.w@bangkok.go.th", phone:"02-012-3456"}, saved:false},

  {id:"TOR-2569-0158", title:"โครงการพัฒนาระบบ AI วิเคราะห์ภาพจากกล้องวงจรปิดเพื่อความปลอดภัยสาธารณะ", agency:"กองบัญชาการตำรวจนครบาล", type:"Data Analytics & AI", status:"draft", budget:[7000000,11000000], closing:null, posted:"2026-08-11", expectedRelease:"2026-08-29", match:null, isOwnerTor:true,
    desc:"พัฒนาระบบปัญญาประดิษฐ์สำหรับวิเคราะห์ภาพจากกล้องวงจรปิดในพื้นที่สาธารณะ ตรวจจับเหตุการณ์ผิดปกติและแจ้งเตือนศูนย์ควบคุมแบบเรียลไทม์ — เอกสารร่างเปิดให้ผู้รับจ้างทบทวนก่อนประกาศ",
    contact:{name:"พ.ต.อ. สมเกียรติ บุญมาก", role:"หัวหน้าฝ่ายเทคโนโลยี", email:"somkiat.b@police.go.th", phone:"02-123-9988"}, saved:false},

  {id:"TOR-2569-0163", title:"จ้างพัฒนาระบบสารสนเทศภูมิศาสตร์ (GIS) สำหรับผังเมือง", agency:"สำนักผังเมือง กรุงเทพมหานคร", type:"Web Application", status:"draft", budget:[3500000,5200000], closing:null, posted:"2026-08-14", expectedRelease:"2026-09-01", match:null, isOwnerTor:true,
    desc:"พัฒนาระบบ GIS สำหรับจัดเก็บและวิเคราะห์ข้อมูลผังเมือง เชื่อมโยงกับฐานข้อมูลที่ดินและสิ่งปลูกสร้าง รองรับการวางแผนพัฒนาเมืองในอนาคต — อยู่ระหว่างร่างรายละเอียด",
    contact:{name:"คุณปิยะดา ศรีวิไล", role:"นักผังเมืองชำนาญการ", email:"piyada.s@cpb.go.th", phone:"02-234-1122"}, saved:false},
];

let currentRole = 'contractor';
let editingTorId = null;

/* ---------------- VERIFICATION STATE ---------------- */
const VERIFICATION_KEY = 'stealors_owner_verification';
const ADMIN_QUEUE_KEY = 'stealors_admin_verify_queue';

const defaultVerification = {
  status: 'not_verified',
  nationalId: '',
  nationalIdBack: '',
  gmail: '',
  phone: '',
  documents: [],
  rejectionReason: '',
  submittedAt: null,
};

function loadVerification(){
  try{
    const saved = localStorage.getItem(VERIFICATION_KEY);
    return saved ? {...defaultVerification, ...JSON.parse(saved)} : {...defaultVerification};
  }catch(e){ return {...defaultVerification}; }
}
function saveVerification(data){
  localStorage.setItem(VERIFICATION_KEY, JSON.stringify(data));
}
let ownerVerification = loadVerification();

function loadAdminQueue(){
  try{
    const saved = localStorage.getItem(ADMIN_QUEUE_KEY);
    return saved ? JSON.parse(saved) : [];
  }catch(e){ return []; }
}
function saveAdminQueue(queue){
  localStorage.setItem(ADMIN_QUEUE_KEY, JSON.stringify(queue));
}

function isOwnerVerified(){
  return ownerVerification.status === 'verified';
}
function isPublished(t){
  return t.status !== 'draft';
}

const draftReviews = {
  "TOR-2569-0111": [
    {name:"Cooldog", company:"Northline Software Co., Ltd.", time:"2 days ago", text:"งบประมาณดูสมเหตุสมผลกับขอบเขตงาน แต่อยากให้ระบุ SLA ของ dashboard เรียลไทม์ให้ชัดเจนกว่านี้ ว่าหมายถึงอัปเดตทุกกี่นาที"},
    {name:"Kritsada P.", company:"BluePeak Systems", time:"3 days ago", text:"ควรระบุด้วยว่าต้องเชื่อมต่อกับระบบ GFMIS หรือไม่ เพราะจะมีผลต่อ scope การเชื่อมต่อค่อนข้างมาก"},
    {name:"Waranya S.", company:"Freelance contractor", time:"3 days ago", text:"ระยะเวลาโครงการที่ระบุไว้ค่อนข้างสั้นเมื่อเทียบกับจำนวนหน่วยงานที่ต้องเชื่อมต่อข้อมูล อยากให้พิจารณาขยายเวลาส่งมอบเฟสแรก"},
  ],
  "TOR-2569-0158": [
    {name:"Anon T.", company:"VisionEdge AI", time:"1 day ago", text:"อยากให้ระบุสเปคกล้องวงจรปิดที่ใช้อยู่ในปัจจุบัน เพราะ compatibility กับโมเดล AI มีผลมากต่อความแม่นยำ"},
    {name:"Cooldog", company:"Northline Software Co., Ltd.", time:"2 days ago", text:"ควรมีรายละเอียดเรื่องมาตรฐานการเก็บข้อมูลภาพตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคลเพิ่มเติมในเอกสาร"},
  ],
  "TOR-2569-0163": [
    {name:"Piyawat R.", company:"GeoStack Co., Ltd.", time:"6 hours ago", text:"ต้องการทราบว่าฐานข้อมูลที่ดินปัจจุบันอยู่ในรูปแบบใด (Shapefile / PostGIS) เพื่อประเมินงานเชื่อมต่อได้ถูกต้อง"},
  ],
};

function daysUntil(dateStr){
  const d = new Date(dateStr); const now = new Date("2026-08-15");
  return Math.ceil((d-now)/(1000*60*60*24));
}
function fmtBudget(b){
  const f = n => (n/1000000).toFixed(1).replace(/\.0$/,'') + "M";
  return `฿${f(b[0])} – ฿${f(b[1])}`;
}
function fmtDate(d){
  if(!d) return "—";
  return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}

function getTorOfficialLinkById(id){
  const t = tors.find(x=>x.id===id);
  // If project owner provided a real TOR URL (via create form), use it.
  if(t && t.appLink) return t.appLink;
  // Demo fallback link (keeps existing TOR data working without extra fields).
  return `https://example-procurement.go.th/tor/${id}`;
}

/* ---------------- GAUGE (signature element) ---------------- */
function gauge(percent, size=58){
  const sw = 5.5;
  const r = (size-sw)/2;
  const c = 2*Math.PI*r;
  const off = c - (percent/100)*c;
  const gid = 'g'+Math.random().toString(36).slice(2,9);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1F2933"/><stop offset="50%" stop-color="#4B7DB8"/><stop offset="100%" stop-color="#E4EEF7"/>
    </linearGradient></defs>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#E9E7E1" stroke-width="${sw}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="52%" text-anchor="middle" dy="0.34em" font-family="IBM Plex Mono, monospace" font-size="${size*0.24}" font-weight="600" fill="#14181D">${percent}%</text>
  </svg>`;
}

/* ---------------- STATUS BADGE ---------------- */
function statusBadge(t){
  if(t.status==="draft") return `<span class="status-badge status-draft">ร่าง — ไม่เปิดรับสมัครผ่านแพลตฟอร์ม</span>`;
  if(t.status==="published") return `<span class="status-badge status-published">ประกาศแล้ว</span>`;
  if(t.status==="open") return `<span class="status-badge status-published">ประกาศแล้ว</span><span class="status-badge status-open" style="margin-left:4px;">เปิดรับ</span>`;
  if(t.status==="closing") return `<span class="status-badge status-published">ประกาศแล้ว</span><span class="status-badge status-closing" style="margin-left:4px;">ใกล้ปิดรับ</span>`;
  if(t.status==="updated") return `<span class="status-badge status-published">ประกาศแล้ว</span><span class="status-badge status-open" style="margin-left:4px;">เปิดรับ</span>`;
}
function renderReviewPreview(torId, limit=2){
  const reviews = draftReviews[torId]||[];
  if(!reviews.length) return `<div class="review-preview-section"><div class="review-preview-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>รีวิวจากผู้รับจ้าง (0)</div><div class="review-preview-item" style="color:var(--text-soft);">ยังไม่มีรีวิวจากผู้รับจ้าง — แชร์ TOR ร่างของคุณเพื่อรับความคิดเห็นล่วงหน้า</div></div>`;
  return `<div class="review-preview-section">
    <div class="review-preview-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>รีวิวจากผู้รับจ้าง (${reviews.length})</div>
    ${reviews.slice(0,limit).map(r=>`
      <div class="review-preview-item">
        <div class="review-preview-head">
          <span class="review-preview-name">${r.name} <span style="font-weight:400;color:var(--text-mid);">— ${r.company}</span></span>
          <span class="review-preview-time">${r.time}</span>
        </div>
        <div class="review-preview-text">${r.text}</div>
      </div>`).join('')}
    ${reviews.length>limit ? `<div class="review-preview-more" onclick="openReviewsModal('${torId}')" style="cursor:pointer;">+ ${reviews.length-limit} รีวิวเพิ่มเติม — ดูทั้งหมด</div>` : ''}
  </div>`;
}
function verificationStatusBadge(status){
  const map = {
    not_verified: ['status-not-verified','ยังไม่ได้ยืนยัน'],
    pending: ['status-pending','รอตรวจสอบ'],
    verified: ['status-verified','ยืนยันแล้ว'],
    rejected: ['status-rejected','ไม่ผ่านการยืนยัน'],
  };
  const [cls, label] = map[status] || map.not_verified;
  return `<span class="status-badge ${cls}">${label}</span>`;
}

/* ---------------- CARD RENDER ---------------- */
function icon(name){
  const icons={
    calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    coin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5"/></svg>',
    tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 12.6l-8-8H4v8.6l8 8a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8z"/><circle cx="8.5" cy="8.5" r="1"/></svg>',
  };
  return icons[name]||'';
}

function torCard(t, opts={}){
  const showQuals = opts.showQuals;
  const d = t.closing ? daysUntil(t.closing) : null;
  return `<div class="tor-card">
    <div class="tor-top-wrap" style="grid-column:1/2;">
      <div class="tor-top">
        ${statusBadge(t)}
        <span class="tor-id">${t.id}</span>
      </div>
      <div class="tor-agency">${t.agency}</div>
      <div class="tor-title">${t.title}</div>
      <div class="tor-meta-row">
        <span>${icon('coin')}<b>${fmtBudget(t.budget)}</b></span>
        <span>${icon('tag')}${t.type}</span>
        ${t.closing ? `<span>${icon('calendar')}ปิดรับ <b>${fmtDate(t.closing)}</b>${d<=7?` <span class="pill-days">${d} วันคงเหลือ</span>`:''}</span>` : t.expectedRelease ? `<span>${icon('calendar')}คาดว่าจะประกาศ <b>${fmtDate(t.expectedRelease)}</b></span>` : ''}
      </div>
      ${showQuals && t.match!==null ? `
      <div class="qual-section">
        <div class="qual-cols">
          <div>
            <div class="qual-col-title ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>ตรงกัน (${t.matchedQ.length})</div>
            ${t.matchedQ.map(q=>`<div class="qual-item ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>${q}</div>`).join('')}
          </div>
          <div>
            <div class="qual-col-title bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>ไม่ตรงกัน (${t.unmatchedQ.length})</div>
            ${t.unmatchedQ.length? t.unmatchedQ.map(q=>`<div class="qual-item bad"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>${q}</div>`).join('') : '<div class="qual-item" style="color:var(--text-soft)">ไม่มีรายการที่ไม่ตรงกัน — ตรงกันทั้งหมด</div>'}
          </div>
        </div>
      </div>`:''}
      ${opts.showReviews && t.status==='draft' ? renderReviewPreview(t.id) : ''}
    </div>
    <div class="tor-right">
      ${t.match!==null ? `<div class="gauge-wrap">${gauge(t.match)}<span class="gauge-label">ความตรงกัน</span></div>` : ''}
      <div class="tor-actions">
        <button class="btn btn-outline btn-block" onclick="openModal('${t.id}')">ดูรายละเอียด</button>
        ${t.status!=='draft' ? `<button class="btn ${t.saved?'btn-saved':'btn-outline'} btn-block" id="save-${t.id}" onclick="toggleSave('${t.id}')">
          <svg viewBox="0 0 24 24" fill="${t.saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${t.saved?'บันทึกแล้ว':'บันทึก'}
        </button>` : currentRole==='owner' ? `<button class="btn btn-outline btn-block" onclick="editTor('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>แก้ไข TOR</button><button class="btn btn-outline btn-block" onclick="openReviewsModal('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>ดูรีวิว (${(draftReviews[t.id]||[]).length})</button><button class="btn btn-primary btn-block" onclick="publishTor('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>ประกาศ TOR</button>` : `<button class="btn btn-outline btn-block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>แสดงความคิดเห็น</button>`}
        ${t.status!=='draft' ? `<button class="btn btn-primary btn-block" onclick="window.location.href='mailto:${t.contact.email}?subject=สอบถามการสมัคร: ${encodeURIComponent(t.title)}'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>ติดต่อเจ้าของโครงการ</button>`:''}
        ${t.status!=='draft' && currentRole==='contractor' ? `<button class="btn btn-outline btn-block" onclick="window.open(getTorOfficialLinkById('${t.id}'),'_blank')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg>ไปยังหน้า TOR</button>`:''}
      </div>
    </div>
  </div>`;
}

/* ---------------- FILTER HELPERS ---------------- */
function applyFilters(list, ids){
  const search = document.getElementById(ids.search)?.value.toLowerCase()||'';
  const type = document.getElementById(ids.type)?.value||'';
  const budget = document.getElementById(ids.budget)?.value||'';
  const urgency = document.getElementById(ids.urgency)?.value||'';
  return list.filter(t=>{
    if(search && !(t.title.toLowerCase().includes(search)||t.agency.toLowerCase().includes(search))) return false;
    if(type && t.type!==type) return false;
    if(budget){
      const [lo,hi] = budget.split('-').map(Number);
      const midM = ((t.budget[0]+t.budget[1])/2)/1000000;
      if(midM<lo || midM>=hi) return false;
    }
    if(urgency==='new' && daysSincePosted(t.posted) > 3) return false;
    if(urgency==='closing' && (!t.closing || daysUntil(t.closing) > 7)) return false;
    return true;
  });
}
function daysSincePosted(dateStr){
  const now = new Date("2026-08-15");
  return Math.floor((now-new Date(dateStr))/(1000*60*60*24));
}

/* ---------------- PAGE RENDERERS ---------------- */
function renderMarket(){
  let list = tors.filter(t=>t.status!=='draft');
  list = applyFilters(list, {search:'marketSearch',type:'marketType',budget:'marketBudget',urgency:'marketUrgency'});
  const sort = document.getElementById('marketSort').value;
  if(sort==='closing') list.sort((a,b)=> (a.closing?daysUntil(a.closing):999) - (b.closing?daysUntil(b.closing):999));
  if(sort==='newest') list.sort((a,b)=> new Date(b.posted)-new Date(a.posted));
  if(sort==='budget-high') list.sort((a,b)=> b.budget[1]-a.budget[1]);
  if(sort==='match') list.sort((a,b)=> (b.match||-1)-(a.match||-1));
  document.getElementById('marketList').innerHTML = list.map(t=>torCard(t)).join('') || emptyState('ไม่พบ TOR ที่ตรงตามตัวกรองของคุณ');
}
function renderMatched(){
  let list = tors.filter(t=>t.match!==null && t.match!==undefined);
  list = applyFilters(list, {search:'matchedSearch',type:'matchedType',budget:'matchedBudget',urgency:'matchedUrgency'});
  list.sort((a,b)=> b.match-a.match);
  document.getElementById('matchedList').innerHTML = list.map(t=>torCard(t,{showQuals:true})).join('') || emptyState('ยังไม่มี TOR ที่ตรงกัน — โปรดอัปเดตโปรไฟล์เพื่อเพิ่มความแม่นยำในการจับคู่');
}
function renderDraft(){
  const contractorBanner = document.getElementById('draftContractorBanner');
  const ownerBanner = document.getElementById('draftOwnerBanner');
  const filterBar = document.getElementById('draftFilterBar');
  if(contractorBanner) contractorBanner.style.display = currentRole==='contractor' ? 'flex' : 'none';
  if(ownerBanner) ownerBanner.style.display = currentRole==='owner' ? 'flex' : 'none';
  if(filterBar) filterBar.style.display = currentRole==='contractor' ? 'flex' : 'none';
  if(currentRole==='owner'){
    const list = tors.filter(t=>t.status==='draft' && t.isOwnerTor).sort((a,b)=> new Date(b.posted)-new Date(a.posted));
    const verifyNote = !isOwnerVerified() ? `<div class="info-banner" style="margin-bottom:18px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>จำเป็นต้องยืนยันตัวตนก่อนจึงจะประกาศ TOR ได้ <button class="btn btn-outline" style="display:inline-flex;padding:4px 10px;font-size:11px;margin-left:6px;" onclick="goPage('verify')">ยืนยันตัวตน</button></span></div>` : '';
    document.getElementById('draftList').innerHTML = verifyNote + (list.map(t=>torCard(t,{showReviews:true})).join('') || emptyState('ยังไม่มี TOR ร่าง — สร้าง TOR ใหม่เพื่อเริ่มต้น'));
  } else {
    const list = tors.filter(t=>t.status==='draft').sort((a,b)=> new Date(a.expectedRelease)-new Date(b.expectedRelease));
    document.getElementById('draftList').innerHTML = list.map(t=>torCard(t)).join('') || emptyState('ตอนนี้ยังไม่มี TOR ร่างที่ต้องตรวจสอบ');
  }
}
function renderSaved(){
  const list = tors.filter(t=>t.saved);
  document.getElementById('savedList').innerHTML = list.map(t=>torCard(t, {showQuals: t.match!==null})).join('') || emptyState('ยังไม่ได้บันทึกอะไร — บันทึก TOR จากตลาดเพื่อดูที่นี่');
}
function emptyState(msg){
  return `<div class="panel" style="text-align:center;color:var(--text-mid);font-size:13px;padding:40px;">${msg}</div>`;
}

/* ---------------- SAVE TOGGLE ---------------- */
function toggleSave(id){
  const t = tors.find(x=>x.id===id);
  t.saved = !t.saved;
  renderMarket(); renderMatched(); renderDraft(); renderSaved();
}

/* ---------------- MODAL ---------------- */
function openModal(id){
  const t = tors.find(x=>x.id===id);
  const d = t.closing ? daysUntil(t.closing) : null;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <button class="modal-close" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      ${statusBadge(t)}
      <h2>${t.title}</h2>
      <div class="m-agency">${t.agency} &nbsp;·&nbsp; ${t.id}</div>
    </div>
    <div class="modal-body">
      <div class="modal-grid">
        <div class="modal-stat"><div class="modal-stat-label">งบประมาณ</div><div class="modal-stat-value">${fmtBudget(t.budget)}</div></div>
        <div class="modal-stat"><div class="modal-stat-label">${t.closing?'ปิดรับ':'คาดว่าจะประกาศ'}</div><div class="modal-stat-value">${fmtDate(t.closing||t.expectedRelease)}</div></div>
        <div class="modal-stat"><div class="modal-stat-label">ประเภทซอฟต์แวร์</div><div class="modal-stat-value" style="font-size:12.5px">${t.type}</div></div>
      </div>
      ${t.match!==null && t.match!==undefined ? `
      <div class="modal-section" style="display:flex;align-items:center;gap:16px;background:var(--paper);border-radius:8px;padding:14px 16px;">
        ${gauge(t.match,64)}
        <div><div style="font-size:13px;font-weight:600;">การจับคู่คุณสมบัติ</div><div style="font-size:12px;color:var(--text-mid);margin-top:2px;">${t.matchedQ.length} จาก ${t.matchedQ.length+t.unmatchedQ.length} คุณสมบัติที่ต้องการ ตรงกัน</div></div>
      </div>`:''}
      <div class="modal-section">
        <h4>ขอบเขตงาน</h4>
        <p>${t.desc}</p>
      </div>
      ${t.status==='draft' ? `<div class="draft-notice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg><span><b>ร่าง — ไม่เปิดรับสมัครผ่านแพลตฟอร์ม</b> อ่านเงื่อนไขอย่างเดียว คุณไม่สามารถสมัครผ่านแพลตฟอร์มนี้ได้</span></div>` : `<div class="contact-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg><span><b>โปรดติดต่อเจ้าของโครงการเพื่อสมัคร</b> การสมัครจะดำเนินการโดยตรงระหว่างคุณและเจ้าของโครงการนอกแพลตฟอร์มนี้</span></div>`}
      <div class="modal-section">
        <h4>${t.status==='draft' ? 'ข้อมูลติดต่อเจ้าของโครงการ (เพื่ออ้างอิง)' : 'ข้อมูลติดต่อ'}</h4>
        <div class="contact-card">
          <div class="contact-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>${t.contact.name} — ${t.contact.role}</div>
          <div class="contact-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg><a href="mailto:${t.contact.email}">${t.contact.email}</a></div>
          <div class="contact-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg><a href="tel:${t.contact.phone}">${t.contact.phone}</a></div>
        </div>
      </div>
      <div class="modal-actions">
        ${t.status!=='draft' ? `<button class="btn ${t.saved?'btn-saved':'btn-outline'}" onclick="toggleSave('${t.id}'); openModal('${t.id}')"><svg viewBox="0 0 24 24" fill="${t.saved?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>${t.saved?'บันทึกแล้ว':'บันทึก TOR นี้'}</button>` : `<button class="btn btn-outline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>แสดงความคิดเห็น</button>`}
        ${t.status!=='draft' ? `<button class="btn btn-primary" onclick="window.location.href='mailto:${t.contact.email}?subject=สอบถามการสมัคร: ${encodeURIComponent(t.title)}'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>ติดต่อเจ้าของโครงการ</button>` : `<span style="font-size:11.5px;color:var(--text-mid);align-self:center;">ร่าง — ไม่เปิดรับสมัครผ่านแพลตฟอร์ม${t.expectedRelease ? ' — คาดว่าจะประกาศใน '+fmtDate(t.expectedRelease) : ''}</span>`}
      </div>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal(){ document.getElementById('modalOverlay').classList.remove('show'); }

function openReviewsModal(id){
  const t = tors.find(x=>x.id===id);
  const reviews = draftReviews[id]||[];
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <button class="modal-close" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      <span class="status-badge status-draft">รีวิวร่าง</span>
      <h2>${t.title}</h2>
      <div class="m-agency">${t.agency} &nbsp;·&nbsp; ${reviews.length} รีวิวจากผู้รับจ้าง</div>
    </div>
    <div class="modal-body">
      ${reviews.length ? reviews.map(r=>`
        <div class="contact-card" style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:12.5px;font-weight:600;">${r.name} <span style="font-weight:400;color:var(--text-mid);">— ${r.company}</span></div>
            <div style="font-size:11px;color:var(--text-soft);font-family:var(--font-mono);">${r.time}</div>
          </div>
          <p style="font-size:12.5px;color:var(--text-dark);line-height:1.6;margin-top:4px;">${r.text}</p>
        </div>`).join('') : `<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:30px;">ยังไม่มีรีวิวจากผู้รับจ้าง</div>`}
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="closeModal()">ปิด</button>
        <button class="btn btn-outline" onclick="closeModal(); editTor('${t.id}')">แก้ไข TOR ตามความคิดเห็น</button>
        ${currentRole==='owner' ? `<button class="btn btn-primary" onclick="publishTor('${t.id}')">ประกาศ TOR</button>` : ''}
      </div>
    </div>`;
  document.getElementById('modalOverlay').classList.add('show');
}

/* ---------------- TOR CREATE / EDIT / PUBLISH ---------------- */
function parseBudget(str){
  const nums = (str||'').replace(/[^\d.–\-]/g,' ').split(/[–\-]/).map(s=>parseFloat(s.replace(/,/g,''))).filter(n=>!isNaN(n));
  if(nums.length>=2) return [nums[0], nums[1]];
  if(nums.length===1) return [nums[0], nums[0]];
  return [1000000, 2000000];
}
function generateTorId(){
  const n = Math.floor(1000 + Math.random()*9000);
  return 'TOR-2569-'+n;
}
function clearCreateForm(){
  ['createTitle','createAgency','createBudget','createClosing','createDesc','createContactName','createContactRole','createContactEmail','createContactPhone','createAppLink'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  editingTorId = null;
}
function populateCreateForm(t){
  document.getElementById('createTitle').value = t.title||'';
  document.getElementById('createAgency').value = t.agency||'';
  document.getElementById('createType').value = t.type||'Web Application';
  document.getElementById('createBudget').value = t.budget ? fmtBudget(t.budget) : '';
  document.getElementById('createClosing').value = t.closing||'';
  document.getElementById('createDesc').value = t.desc||'';
  document.getElementById('createContactName').value = t.contact?.name||'';
  document.getElementById('createContactRole').value = t.contact?.role||'';
  document.getElementById('createContactEmail').value = t.contact?.email||'';
  document.getElementById('createContactPhone').value = t.contact?.phone||'';
  document.getElementById('createAppLink').value = t.appLink||'';
  editingTorId = t.id;
}
function editTor(id){
  const t = tors.find(x=>x.id===id);
  if(!t) return;
  if(t.status!=='draft'){
    alert('TOR ที่ประกาศแล้วไม่สามารถแก้ไขได้ มีเพียง TOR ร่างเท่านั้นที่สามารถแก้ไขได้');
    return;
  }
  populateCreateForm(t);
  goPage('create');
}
function saveTorDraft(exitAfter){
  const title = document.getElementById('createTitle').value.trim();
  if(!title){ alert('กรุณาใส่ชื่อ TOR'); return; }
  const budget = parseBudget(document.getElementById('createBudget').value);
  const closing = document.getElementById('createClosing').value || null;
  const torData = {
    title,
    agency: document.getElementById('createAgency').value.trim() || 'Project owner agency',
    type: document.getElementById('createType').value,
    status: 'draft',
    budget,
    closing,
    posted: new Date().toISOString().slice(0,10),
    expectedRelease: closing || new Date(Date.now()+14*86400000).toISOString().slice(0,10),
    match: null,
    desc: document.getElementById('createDesc').value.trim() || 'Draft TOR — scope details to be finalized.',
    contact: {
      name: document.getElementById('createContactName').value.trim() || 'Project Owner',
      role: document.getElementById('createContactRole').value.trim() || 'Project Owner',
      email: document.getElementById('createContactEmail').value.trim() || 'owner@example.com',
      phone: document.getElementById('createContactPhone').value.trim() || '02-000-0000',
    },
    appLink: document.getElementById('createAppLink').value.trim(),
    saved: false,
    isOwnerTor: true,
  };
  if(editingTorId){
    const idx = tors.findIndex(x=>x.id===editingTorId);
    if(idx>=0) tors[idx] = {...tors[idx], ...torData, id: editingTorId};
  } else {
    tors.unshift({id: generateTorId(), ...torData});
  }
  clearCreateForm();
  renderMarket(); renderMatched(); renderDraft(); renderSaved();
  if(exitAfter) goPage('draft');
  else goPage('draft');
}
function publishTor(id){
  if(!isOwnerVerified()){
    alert('โปรดยืนยันตัวตนของคุณก่อนจึงจะสามารถประกาศ TOR ได้');
    goPage('verify');
    return;
  }
  const t = tors.find(x=>x.id===id);
  if(!t || t.status!=='draft') return;
  t.status = 'published';
  if(!t.closing) t.closing = t.expectedRelease || new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  delete t.expectedRelease;
  closeModal();
  renderMarket(); renderMatched(); renderDraft(); renderSaved();
  alert('ประกาศ TOR สำเร็จแล้ว ผู้รับจ้างสามารถตรวจสอบและติดต่อคุณโดยตรงเพื่อยื่นใบสมัคร');
}
function contactOwner(id){
  const t = tors.find(x=>x.id===id);
  if(!t || !t.contact) return;
  openModal(id);
}

/* ---------------- VERIFY IDENTITY ---------------- */
function renderVerifyPage(){
  const v = ownerVerification;
  const statusMessages = {
    not_verified: 'คุณยังไม่ได้ส่งข้อมูลยืนยันตัวตน กรอกข้อมูลด้านล่างเพื่อเริ่มการยืนยันตัวตน',
    pending: 'ระบบได้รับข้อมูลยืนยันตัวตนของคุณแล้ว และกำลังรอตรวจสอบโดยผู้ดูแลระบบ คุณยังไม่สามารถประกาศ TOR ได้จนกว่าจะได้รับการอนุมัติ',
    verified: 'ผู้ดูแลระบบได้ยืนยันตัวตนของคุณแล้ว ตอนนี้คุณสามารถประกาศ TOR ร่างให้เป็นสถานะ “ประกาศแล้ว/Final/Published” ได้',
    rejected: 'ผู้ดูแลระบบปฏิเสธการยืนยันตัวตนของคุณ โปรดตรวจสอบเหตุผลด้านล่างและส่งข้อมูลใหม่อีกครั้ง',
  };
  document.getElementById('verifyStatusSection').innerHTML = `
    <div class="verify-status-card">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;">สถานะการยืนยันตัวตน</div>
      ${verificationStatusBadge(v.status)}
      <div class="verify-status-msg">${statusMessages[v.status]||statusMessages.not_verified}</div>
      ${v.status==='rejected' && v.rejectionReason ? `<div class="verify-reject-reason"><b>เหตุผลที่ถูกปฏิเสธ:</b> ${v.rejectionReason}</div>` : ''}
    </div>`;
  document.getElementById('verifyNationalId').value = v.nationalId||'';
  document.getElementById('verifyNationalIdBack').value = v.nationalIdBack||'';
  document.getElementById('verifyGmail').value = v.gmail||'';
  document.getElementById('verifyPhone').value = v.phone||'';
  renderVerifyDocList(v.documents||[]);
  const btn = document.getElementById('verifySubmitBtn');
  const isPending = v.status==='pending';
  const isVerified = v.status==='verified';
  btn.disabled = isPending || isVerified;
  btn.textContent = isVerified ? 'ยืนยันแล้ว' : isPending ? 'รอตรวจสอบโดยผู้ดูแล' : v.status==='rejected' ? 'ส่งข้อมูลใหม่เพื่อยืนยันตัวตน' : 'ส่งเพื่อยืนยันตัวตน';
  ['verifyNationalId','verifyNationalIdBack','verifyGmail','verifyPhone'].forEach(id=>{
    document.getElementById(id).disabled = isPending || isVerified;
  });
}
function renderVerifyDocList(docs){
  document.getElementById('verifyDocList').innerHTML = docs.map((d,i)=>`
    <div class="file-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>
      <span class="fname">${d.name}</span>
      <span class="fsize">${d.size}</span>
    </div>`).join('');
}
function handleVerifyDocUpload(e){
  const files = Array.from(e.target.files||[]);
  if(!ownerVerification.documents) ownerVerification.documents = [];
  files.forEach(f=>{
    ownerVerification.documents.push({name: f.name, size: (f.size/1024/1024).toFixed(1)+' MB'});
  });
  renderVerifyDocList(ownerVerification.documents);
}
function submitVerification(){
  if(ownerVerification.status==='verified') return;
  if(ownerVerification.status==='pending') return;
  const nationalId = document.getElementById('verifyNationalId').value.trim();
  const nationalIdBack = document.getElementById('verifyNationalIdBack').value.trim();
  const gmail = document.getElementById('verifyGmail').value.trim();
  const phone = document.getElementById('verifyPhone').value.trim();
  if(!nationalId || !nationalIdBack || !gmail || !phone){
    alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'); return;
  }
  if(!ownerVerification.documents || ownerVerification.documents.length===0){
    alert('กรุณาอัปโหลดเอกสารยืนยันอย่างน้อย 1 ไฟล์'); return;
  }
  ownerVerification = {
    ...ownerVerification,
    status: 'pending',
    nationalId, nationalIdBack, gmail, phone,
    rejectionReason: '',
    submittedAt: new Date().toISOString(),
  };
  saveVerification(ownerVerification);
  const queue = loadAdminQueue().filter(q=>q.ownerId!=='demo-owner');
  queue.push({
    ownerId: 'demo-owner',
    ownerName: 'Cooldog (Project Owner)',
    ...ownerVerification,
  });
  saveAdminQueue(queue);
  renderVerifyPage();
  logAdminActivity('user', `Project owner ${queue[queue.length-1]?.ownerName||'demo-owner'} submitted identity verification`);
  alert('ส่งข้อมูลยืนยันตัวตนเรียบร้อยแล้ว สถานะของคุณตอนนี้คือ “รอตรวจสอบ” ผู้ดูแลระบบจะตรวจสอบคำขอของคุณ');
}

/* ---------------- ADMIN DATA ---------------- */
const adminUsers = [
  {id:'U-001', name:'Cooldog', email:'cooldog@devteam.co.th', role:'contractor', status:'active', joined:'2025-11-12', verified:null},
  {id:'U-002', name:'คุณศิริพร วงศ์เจริญ', email:'siriporn.w@bangkok.go.th', role:'owner', status:'active', joined:'2026-01-08', verified:'verified'},
  {id:'U-003', name:'Northline Software', email:'owner@northline.co.th', role:'owner', status:'active', joined:'2026-02-20', verified:'pending'},
  {id:'U-004', name:'BluePeak Systems', email:'contact@bluepeak.co.th', role:'contractor', status:'active', joined:'2026-03-05', verified:null},
  {id:'U-005', name:'VisionEdge AI', email:'admin@visionedge.ai', role:'contractor', status:'suspended', joined:'2025-09-18', verified:null},
  {id:'U-006', name:'Admin User', email:'admin@stealors.go.th', role:'admin', status:'active', joined:'2025-06-01', verified:null},
  {id:'U-007', name:'GeoStack Co.', email:'info@geostack.co.th', role:'contractor', status:'active', joined:'2026-04-11', verified:null},
  {id:'U-008', name:'คุณปิยะดา ศรีวิไล', email:'piyada.s@cpb.go.th', role:'owner', status:'active', joined:'2026-05-22', verified:'verified'},
];

const torSources = [
  {name:'Bangkok Metropolitan Admin (BMA)', type:'Agency feed', tors:142, lastSync:'Today, 08:00', status:'active'},
  {name:'DGA Procurement Portal', type:'External portal', tors:89, lastSync:'Today, 06:30', status:'active'},
  {name:'Project owner uploads', type:'Manual upload', tors:34, lastSync:'Yesterday, 21:15', status:'active'},
  {name:'MEA / MWA / MRTA feeds', type:'Agency feed', tors:67, lastSync:'Today, 07:45', status:'active'},
  {name:'Legacy e-GP scraper', type:'External portal', tors:0, lastSync:'3 days ago', status:'paused'},
];

const activityLogs = [
  {time:'Today, 10:42', type:'user', msg:'Contractor Cooldog saved TOR-2569-0142'},
  {time:'Today, 09:18', type:'tor', msg:'New draft TOR uploaded by สำนักผังเมือง กทม.'},
  {time:'Today, 08:55', type:'system', msg:'BMA agency feed synced — 4 new TORs ingested'},
  {time:'Yesterday, 17:30', type:'user', msg:'Project owner verification submitted — Northline Software'},
  {time:'Yesterday, 14:05', type:'tor', msg:'New published TOR from MEA — Cloud Infrastructure Modernization'},
  {time:'Yesterday, 11:20', type:'report', msg:'New complaint filed against TOR listing accuracy'},
  {time:'2 days ago', type:'system', msg:'Scheduled match recalculation completed for 186 contractors'},
  {time:'2 days ago', type:'user', msg:'Admin approved verification for คุณศิริพร วงศ์เจริญ'},
  {time:'3 days ago', type:'tor', msg:'TOR-2569-0111 published as draft for contractor review'},
  {time:'3 days ago', type:'user', msg:'New contractor registration — GeoStack Co.'},
];

const adminReports = [
  {id:'RPT-1042', type:'complaint', title:'Incorrect budget range on TOR-2569-0138', from:'BluePeak Systems', tor:'TOR-2569-0138', status:'open', time:'Today, 08:10', desc:'The listed budget does not match the official procurement document.'},
  {id:'RPT-1039', type:'report', title:'Duplicate TOR listing detected', from:'Cooldog', tor:'TOR-2569-0142', status:'reviewing', time:'Yesterday, 16:22', desc:'Same TOR appears twice with slightly different titles from the same agency.'},
  {id:'RPT-1035', type:'abuse', title:'Spam contact attempt reported', from:'Anonymous contractor', tor:'—', status:'open', time:'2 days ago', desc:'User reported receiving unsolicited contact outside platform guidelines.'},
  {id:'RPT-1028', type:'complaint', title:'Outdated closing date on TOR-2569-0119', from:'VisionEdge AI', tor:'TOR-2569-0119', status:'resolved', time:'5 days ago', desc:'Closing date was past due but TOR still shown as open. Resolved after source sync.'},
];

function logAdminActivity(type, msg){
  activityLogs.unshift({time:'Just now', type, msg});
  if(currentRole==='admin') renderAdminLogs();
  renderAdminDashboard();
}

function updateAdminBadges(){
  const pending = loadAdminQueue().filter(q=>q.status==='pending').length;
  const badge = document.getElementById('adminVerifyBadge');
  if(badge) badge.textContent = pending;
  const pendingStat = document.getElementById('adminStatPending');
  if(pendingStat) pendingStat.textContent = pending;
  const openReports = adminReports.filter(r=>r.status==='open'||r.status==='reviewing').length;
  const reportsBadge = document.getElementById('adminReportsBadge');
  if(reportsBadge) reportsBadge.textContent = openReports;
}

function renderAdminDashboard(){
  const draftCount = tors.filter(t=>t.status==='draft').length;
  const pubCount = tors.filter(t=>t.status!=='draft').length;
  const statTors = document.getElementById('adminStatTors');
  if(statTors) statTors.textContent = tors.length;
  updateAdminBadges();
  const logsEl = document.getElementById('adminDashboardLogs');
  if(logsEl) logsEl.innerHTML = activityLogs.slice(0,5).map(l=>`
    <div class="log-item">
      <span class="log-time">${l.time}</span>
      <span class="log-type ${l.type}">${l.type}</span>
      <span>${l.msg}</span>
    </div>`).join('');
  const pendingEl = document.getElementById('adminDashboardPending');
  if(pendingEl){
    const pendingVerify = loadAdminQueue().filter(q=>q.status==='pending').length;
    const openReports = adminReports.filter(r=>r.status==='open').length;
    pendingEl.innerHTML = `
      <div class="mini-list-item"><div><div class="mini-list-title">การยืนยันตัวตน</div><div class="mini-list-meta">${pendingVerify} รายการรอตรวจสอบ</div></div><button class="btn btn-outline" onclick="goPage('admin-verify')">ตรวจสอบ</button></div>
      <div class="mini-list-item"><div><div class="mini-list-title">รายงาน / ร้องเรียน</div><div class="mini-list-meta">${openReports} รายการที่ยังเปิดอยู่</div></div><button class="btn btn-outline" onclick="goPage('admin-reports')">ตรวจสอบ</button></div>
      <div class="mini-list-item"><div><div class="mini-list-title">แหล่งข้อมูล TOR</div><div class="mini-list-meta">1 แหล่งข้อมูลหยุดชั่วคราว — ตัวดึง Legacy e-GP</div></div><button class="btn btn-outline" onclick="goPage('admin-sources')">จัดการ</button></div>`;
  }
}

function renderAdminUsers(){
  const search = (document.getElementById('adminUserSearch')?.value||'').toLowerCase();
  const role = document.getElementById('adminUserRole')?.value||'';
  const status = document.getElementById('adminUserStatus')?.value||'';
  let list = adminUsers.filter(u=>{
    if(search && !(u.name.toLowerCase().includes(search)||u.email.toLowerCase().includes(search))) return false;
    if(role && u.role!==role) return false;
    if(status && u.status!==status) return false;
    return true;
  });
  const roleLabel = r=>({contractor:'ผู้รับจ้าง',owner:'เจ้าของโครงการ',admin:'ผู้ดูแลระบบ'}[r]||r);
  document.getElementById('adminUsersTable').innerHTML = `
    <table class="data-table">
      <thead><tr><th>ผู้ใช้งาน</th><th>บทบาท</th><th>สถานะ</th><th>การยืนยัน</th><th>เข้าร่วมเมื่อ</th><th>การทำงาน</th></tr></thead>
      <tbody>${list.map(u=>`
        <tr>
          <td><div style="font-weight:600;">${u.name}</div><div style="font-size:11px;color:var(--text-mid);">${u.email}</div></td>
          <td>${roleLabel(u.role)}</td>
          <td><span class="status-badge ${u.status==='active'?'status-verified':'status-rejected'}">${u.status==='active'?'ใช้งานอยู่':'ระงับแล้ว'}</span></td>
          <td>${u.role==='owner' ? (u.verified ? verificationStatusBadge(u.verified) : verificationStatusBadge('not_verified')) : '—'}</td>
          <td style="font-family:var(--font-mono);font-size:11px;">${u.joined}</td>
          <td class="actions">
            <button class="btn btn-outline" style="padding:5px 10px;font-size:11px;" onclick="alert('ดูผู้ใช้ ${u.id} — เดโม')">ดู</button>
            ${u.status==='active' ? `<button class="btn btn-outline" style="padding:5px 10px;font-size:11px;" onclick="suspendUser('${u.id}')">ระงับ</button>` : `<button class="btn btn-outline" style="padding:5px 10px;font-size:11px;" onclick="activateUser('${u.id}')">เปิดใช้งาน</button>`}
          </td>
        </tr>`).join('')}</tbody>
    </table>`;
}
function suspendUser(id){
  const u = adminUsers.find(x=>x.id===id);
  if(u){ u.status='suspended'; logAdminActivity('user',`Admin suspended user ${u.name}`); renderAdminUsers(); }
}
function activateUser(id){
  const u = adminUsers.find(x=>x.id===id);
  if(u){ u.status='active'; logAdminActivity('user',`Admin activated user ${u.name}`); renderAdminUsers(); }
}

function renderAdminStats(){
  const months = ['มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.'];
  const draft = [2,3,2,4,3,3];
  const published = [12,14,16,18,20,21];
  const max = Math.max(...published);
  document.getElementById('adminStatsChart').innerHTML = `<div class="mchart-bars">` + months.map((m,i)=>{
    const pubH = 6 + (published[i]/max)*118;
    const draftH = 6 + (draft[i]/max)*118;
    return `<div class="mbar-col">
      <div class="mbar" style="height:${pubH}px;background:var(--slate);"></div>
      <div class="mbar" style="height:${draftH}px;background:#C6DAEC;margin-top:-${Math.min(pubH,draftH)}px;opacity:0.7;"></div>
      <span class="mbar-label">${m}</span>
    </div>`;
  }).join('') + `</div>
  <div style="display:flex;justify-content:center;gap:16px;font-size:11px;color:var(--text-mid);margin-top:6px;">
    <span><i class="dot" style="background:var(--slate)"></i>ประกาศแล้ว</span>
    <span><i class="dot" style="background:#C6DAEC"></i>ร่าง</span>
  </div>`;
  document.getElementById('adminStatsBreakdown').innerHTML = [
    ['ผู้รับจ้าง',186,'var(--slate)'],
    ['เจ้าของโครงการ',59,'var(--ink)'],
    ['เจ้าของโครงการที่ยืนยันแล้ว',41,'var(--match)'],
    ['ผู้ดูแลระบบ',3,'var(--warn)'],
  ].map(([label,val,color])=>`
    <div class="mhbar-row">
      <span class="mhbar-label" style="width:100px;text-align:left;">${label}</span>
      <div class="mhbar-track"><div class="mhbar-fill" style="width:${(val/186)*100}%;background:${color};"></div></div>
      <span class="mhbar-val">${val}</span>
    </div>`).join('');
}

// function renderAdminSources(){
//   document.getElementById('adminSourcesList').innerHTML = torSources.map(s=>`
//     <div class="source-card">
//       <div>
//         <div class="source-name">${s.name}</div>
//         <div class="source-meta">${s.type} · ${s.tors} TORs ingested · Last sync: ${s.lastSync}</div>
//       </div>
//       <div style="display:flex;align-items:center;gap:8px;">
//         <span class="status-badge ${s.status==='active'?'status-verified':'status-pending'}">${s.status}</span>
//         <button class="btn btn-outline" style="padding:5px 10px;font-size:11px;" onclick="alert('Configure ${s.name} — demo')">Configure</button>
//       </div>
//     </div>`).join('');
// }

function renderAdminLogs(){
  const type = document.getElementById('adminLogType')?.value||'';
  let list = activityLogs;
  if(type) list = list.filter(l=>l.type===type);
  document.getElementById('adminLogsList').innerHTML = list.map(l=>`
    <div class="log-item">
      <span class="log-time">${l.time}</span>
      <span class="log-type ${l.type}">${l.type==='user'?'ผู้ใช้':l.type==='tor'?'TOR':l.type==='system'?'ระบบ':'รายงาน'}</span>
      <span>${l.msg}</span>
    </div>`).join('') || `<div style="text-align:center;color:var(--text-mid);padding:30px;font-size:13px;">ไม่พบบันทึกกิจกรรมที่ตรงกับตัวกรองของคุณ</div>`;
}

function renderAdminReports(){
  const status = document.getElementById('adminReportStatus')?.value||'';
  const type = document.getElementById('adminReportType')?.value||'';
  let list = adminReports.filter(r=>{
    if(status && r.status!==status) return false;
    if(type && r.type!==type) return false;
    return true;
  });
  document.getElementById('adminReportsList').innerHTML = list.map(r=>`
    <div class="report-card">
      <div class="report-card-head">
        <div>
          <div class="report-title">${r.title}</div>
          <div class="report-meta">${r.id} · ${r.type} · from ${r.from}${r.tor!=='—'?' · '+r.tor:''} · ${r.time}</div>
        </div>
        <span class="status-badge ${r.status==='resolved'?'status-verified':r.status==='open'?'status-rejected':'status-pending'}">${r.status==='resolved'?'แก้ไขแล้ว':r.status==='open'?'เปิดอยู่':'อยู่ระหว่างตรวจสอบ'}</span>
      </div>
      <p style="font-size:12.5px;color:var(--text-mid);line-height:1.6;">${r.desc}</p>
      <div class="actions" style="margin-top:10px;">
        ${r.status!=='resolved' ? `<button class="btn btn-primary" style="padding:5px 12px;font-size:11px;" onclick="resolveReport('${r.id}')">ทำเครื่องหมายว่าแก้ไขแล้ว</button>` : ''}
        <button class="btn btn-outline" style="padding:5px 12px;font-size:11px;" onclick="alert('ดูรายงาน ${r.id} — เดโม')">ดูรายละเอียด</button>
      </div>
    </div>`).join('') || `<div style="text-align:center;color:var(--text-mid);padding:30px;font-size:13px;">ไม่พบรายงานที่ตรงกับตัวกรองของคุณ</div>`;
}
function resolveReport(id){
  const r = adminReports.find(x=>x.id===id);
  if(r){ r.status='resolved'; logAdminActivity('report',`Admin resolved report ${r.id}`); renderAdminReports(); updateAdminBadges(); }
}

function renderAdminVerifyQueue(){
  const queue = loadAdminQueue();
  const pending = queue.filter(q=>q.status==='pending');
  const history = queue.filter(q=>q.status!=='pending');
  updateAdminBadges();
  const el = document.getElementById('adminVerifyQueue');
  if(!el) return;
  if(!pending.length){
    el.innerHTML = `<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:30px;">ยังไม่มีคำขอยืนยันตัวตนที่รอดำเนินการ</div>`;
  } else {
    el.innerHTML = pending.map(q=>`
    <div class="admin-queue-item">
      <div>
        <div style="font-size:13.5px;font-weight:600;">${q.ownerName}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;">
          เลขบัตรประชาชน: ${q.nationalId} · รหัสหลังบัตร: ${q.nationalIdBack}<br>
          Gmail: ${q.gmail} · เบอร์โทรศัพท์: ${q.phone}<br>
          เอกสาร: ${(q.documents||[]).map(d=>d.name).join(', ')||'—'}<br>
          ส่งเมื่อ: ${q.submittedAt ? new Date(q.submittedAt).toLocaleString() : '—'}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
        <button class="btn btn-primary" onclick="adminApproveVerify('${q.ownerId}')">อนุมัติ</button>
        <button class="btn btn-outline" onclick="adminRejectVerify('${q.ownerId}')">ปฏิเสธ</button>
      </div>
    </div>`).join('');
  }
  const histEl = document.getElementById('adminVerifyHistory');
  if(histEl){
    histEl.innerHTML = history.length ? history.map(q=>`
      <div class="admin-queue-item">
        <div>
          <div style="font-size:13px;font-weight:600;">${q.ownerName} ${verificationStatusBadge(q.status)}</div>
          <div style="font-size:12px;color:var(--text-mid);margin-top:4px;">
            ${q.gmail} · ${q.submittedAt ? new Date(q.submittedAt).toLocaleString() : '—'}
            ${q.rejectionReason ? `<br>เหตุผล: ${q.rejectionReason}` : ''}
          </div>
        </div>
      </div>`).join('') : `<div style="text-align:center;color:var(--text-mid);font-size:13px;padding:20px;">ยังไม่มีประวัติการยืนยันตัวตน</div>`;
  }
}
function adminApproveVerify(ownerId){
  const queue = loadAdminQueue();
  const item = queue.find(q=>q.ownerId===ownerId && q.status==='pending');
  if(!item) return;
  item.status = 'verified';
  saveAdminQueue(queue);
  ownerVerification = {...ownerVerification, status: 'verified', rejectionReason: ''};
  saveVerification(ownerVerification);
  logAdminActivity('user', `Admin approved verification for ${item.ownerName}`);
  renderAdminVerifyQueue();
  renderVerifyPage();
  updateAdminBadges();
  alert('การยืนยันผ่านแล้ว เจ้าของโครงการได้รับสถานะ “ยืนยันแล้ว”');
}
function adminRejectVerify(ownerId){
  const reason = prompt('ป้อนเหตุผลในการปฏิเสธสำหรับเจ้าของโครงการ:');
  if(!reason) return;
  const queue = loadAdminQueue();
  const item = queue.find(q=>q.ownerId===ownerId && q.status==='pending');
  if(!item) return;
  item.status = 'rejected';
  item.rejectionReason = reason;
  saveAdminQueue(queue);
  ownerVerification = {
    ...ownerVerification,
    status: 'rejected',
    rejectionReason: reason,
  };
  saveVerification(ownerVerification);
  logAdminActivity('user', `Admin rejected verification for ${item.ownerName}`);
  renderAdminVerifyQueue();
  renderVerifyPage();
  updateAdminBadges();
  alert('การยืนยันไม่ผ่าน ผู้ดูแลระบบปฏิเสธคำขอ เจ้าของโครงการสามารถส่งข้อมูลใหม่เพื่อยืนยันอีกครั้ง');
}

const notifications = [
  {icon:'match', title:'New match: 87% — e-Document platform, BMA', desc:'Your qualifications matched a newly posted TOR from กรุงเทพมหานคร.', time:'Today, 09:42', email:true, unread:true},
  {icon:'closing', title:'Closing in 4 days: ระบบสมาชิกออนไลน์ ธนาคารออมสิน', desc:'A saved TOR you matched with is closing soon — review before it closes.', time:'Today, 08:10', unread:true},
  {icon:'match', title:'New match: 79% — ERP ระยะที่ 2, MRTA', desc:'Your qualifications matched a newly posted TOR from การรถไฟฟ้าขนส่งมวลชนฯ.', time:'Yesterday, 17:22', email:true, unread:true},
  {icon:'match', title:'New match: 91% — Cloud Infrastructure Modernization, MEA', desc:'Your qualifications matched a newly posted TOR from การไฟฟ้านครหลวง.', time:'Yesterday, 14:05', unread:true},
  {icon:'system', title:'Your profile match score improved', desc:'Adding "Cloud Infrastructure" to your qualifications increased 3 match scores.', time:'2 days ago', unread:true},
  {icon:'closing', title:'Closing in 4 days: แอปมือถือบริการประชาชน, เขตบางรัก', desc:'A saved TOR is nearing its application deadline.', time:'2 days ago', unread:false},
  {icon:'system', title:'New draft TOR open for review', desc:'สำนักผังเมือง กทม. posted a draft TOR — read it before it opens.', time:'3 days ago', unread:false},
];
function renderNotifications(){
  const iconsSvg = {
    match:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
    update:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 4v5h-5"/></svg>',
    closing:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>',
    system:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>',
  };
  document.getElementById('notifList').innerHTML = notifications.map(n=>`
    <div class="notif-item ${n.unread?'unread':''}">
      <div class="notif-icon ${n.icon}">${iconsSvg[n.icon]}</div>
      <div class="notif-body">
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${n.time}</div>
        ${n.email? `<div class="email-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>Also sent to your email</div>`:''}
      </div>
    </div>`).join('');
}

/* ---------------- DASHBOARD WIDGETS ---------------- */
function renderClosingSoon(){
  const list = tors.filter(t=>t.closing && t.match!==null && daysUntil(t.closing)<=10).sort((a,b)=>daysUntil(a.closing)-daysUntil(b.closing));
  document.getElementById('closingSoonList').innerHTML = list.map(t=>`
    <div class="mini-list-item">
      <div>
        <div class="mini-list-title">${t.title.length>46? t.title.slice(0,46)+'…':t.title}</div>
        <div class="mini-list-meta">${t.agency} · ${t.match}% match</div>
      </div>
      <span class="pill-days">${daysUntil(t.closing)}d left</span>
    </div>`).join('');
}

/* ---------------- MOCK CHARTS (static demo visuals, no external deps) ---------------- */
function drawMonthlyChart(){
  const months = ['Mar','Apr','May','Jun','Jul','Aug'];
  const posted = [14,19,16,22,20,24];
  const maxPosted = Math.max(...posted);
  const el = document.getElementById('monthlyChart');
  el.innerHTML = `<div class="mchart-bars">` + months.map((m,i)=>{
    const barH = 6 + (posted[i]/maxPosted)*118;
    return `<div class="mbar-col">
      <span class="mbar-val">${posted[i]}</span>
      <div class="mbar" style="height:${barH}px;"></div>
      
      <span class="mbar-label">${m}</span>
    </div>`;
  }).join('') + `</div>
  <div style="display:flex;justify-content:center;gap:16px;font-size:11px;color:var(--text-mid);margin-top:6px;">
    <span><i class="dot" style="background:#C6DAEC"></i>TORs matched</span>
  </div>`;
}

function drawQualityDonut(){
  const data = [{v:4,c:'#1F2933'},{v:3,c:'#4B7DB8'},{v:1,c:'#C6DAEC'}];
  const total = data.reduce((s,d)=>s+d.v,0);
  let acc = 0;
  const stops = data.map(d=>{
    const start = (acc/total)*360; acc += d.v;
    const end = (acc/total)*360;
    return `${d.c} ${start}deg ${end}deg`;
  }).join(', ');
  document.getElementById('qualityChart').innerHTML = `<div class="mdonut-wrap"><div class="mdonut" style="background:conic-gradient(${stops});"><div class="mdonut-center"><b>${total}</b><span>matched</span></div></div></div>`;
}

function drawCategoryBars(){
  const cats = [['Web App',7],['ERP',4],['Mobile',3],['Cloud',3],['Data/AI',3],['Cyber',2],['Network',2]];
  const max = Math.max(...cats.map(c=>c[1]));
  document.getElementById('categoryChart').innerHTML = cats.map(([label,val])=>`
    <div class="mhbar-row">
      <span class="mhbar-label">${label}</span>
      <div class="mhbar-track"><div class="mhbar-fill" style="width:${(val/max)*100}%;"></div></div>
      <span class="mhbar-val">${val}</span>
    </div>`).join('');
}

function initCharts(){
  drawMonthlyChart();
  drawQualityDonut();
  drawCategoryBars();
}

/* ---------------- NAV / ROUTING ---------------- */
const titles = {
  dashboard:['Dashboard','Overview of TOR activity matched to your qualifications'],
  market:['TOR market','Every TOR collected in one place, filtered to what matters to you'],
  matched:['TOR matched','Sorted by match percentage — highest first'],
  draft:['Draft TOR','Review requirements before a TOR opens for application'],
  'owner-draft':['TOR ร่างของฉัน','แก้ไข TOR ร่างและตรวจสอบความคิดเห็นจากผู้รับจ้างก่อนประกาศ'],
  saved:['Saved','TORs you have saved from the market or matches'],
  notifications:['Notifications','Matches, updates, and deadlines that need your attention'],
  profile:['Profile','Keep your qualifications current for accurate matching'],
  create:['สร้าง TOR','เผยแพร่ TOR ใหม่ให้ผู้รับจ้างค้นพบ'],
  verify:['ยืนยันตัวตน','ส่งข้อมูลยืนยันตัวตนเพื่อให้ผู้ดูแลระบบตรวจสอบก่อนประกาศ TOR'],
  'admin-dashboard':['แดชบอร์ดผู้ดูแลระบบ','ภาพรวมระบบและรายการที่รอดำเนินการของผู้ดูแล'],
  'admin-users':['จัดการผู้ใช้งาน','จัดการผู้รับจ้าง เจ้าของโครงการ และบัญชีผู้ดูแลระบบ'],
  'admin-verify':['ยืนยันตัวตน','ตรวจสอบและอนุมัติ/ปฏิเสธคำขอยืนยันตัวตนของเจ้าของโครงการ'],
  'admin-stats':['สถิติระบบ','การใช้งานแพลตฟอร์ม ปริมาณ TOR และตัวชี้วัดผู้ใช้งาน'],
  'admin-sources':['แหล่งข้อมูล TOR','จัดการฟีดของหน่วยงานและแหล่งนำเข้า TOR'],
  'admin-logs':['บันทึกกิจกรรม','ประวัติเหตุการณ์ในระบบและการดำเนินการของผู้ดูแล'],
  'admin-reports':['รายงาน / ร้องเรียน','ปัญหาที่ผู้ใช้ส่งมาและต้องให้ผู้ดูแลระบบตรวจสอบ'],
};
const adminPages = ['admin-dashboard','admin-users','admin-verify','admin-stats','admin-sources','admin-logs','admin-reports'];
function goPage(page){
  if(currentRole==='admin' && !adminPages.includes(page)) page = 'admin-dashboard';
  if(currentRole!=='admin' && adminPages.includes(page)) return;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  const pageEl = document.getElementById('page-'+page);
  if(!pageEl) return;
  pageEl.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.page===page));
  if(titles[page]){
    document.getElementById('pageTitle').textContent = titles[page][0];
    document.getElementById('pageSub').textContent = titles[page][1];
  }
  if(page==='verify') renderVerifyPage();
  if(page==='admin-dashboard') renderAdminDashboard();
  if(page==='admin-users') renderAdminUsers();
  if(page==='admin-verify') renderAdminVerifyQueue();
  if(page==='admin-stats') renderAdminStats();
//   if(page==='admin-sources') renderAdminSources();
  if(page==='admin-logs') renderAdminLogs();
  if(page==='admin-reports') renderAdminReports();
  if(page==='create' && !editingTorId) clearCreateForm();
  if(page==='draft') renderDraft();
  if(page==='draft' && currentRole==='owner'){
    document.getElementById('pageTitle').textContent = titles['owner-draft'][0];
    document.getElementById('pageSub').textContent = titles['owner-draft'][1];
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
function setRole(role){
  const auth = window.__STEALORS_AUTH__ || { accountRole: 'contractor' };
  // Contractors can only switch between contractor and owner views.
  // Admin view is only for accounts with admin role (Gmail admin).
  if(role === 'admin' && auth.accountRole !== 'admin') return;
  if(auth.accountRole === 'admin') role = 'admin';
  if(auth.accountRole !== 'admin' && role === 'admin') return;

  currentRole = role;
  const contractorBtn = document.getElementById('roleContractorBtn');
  const ownerBtn = document.getElementById('roleOwnerBtn');
  if(contractorBtn) contractorBtn.classList.toggle('active', role==='contractor');
  if(ownerBtn) ownerBtn.classList.toggle('active', role==='owner');
  document.getElementById('contractorNav').style.display = role==='contractor' ? 'block':'none';
  document.getElementById('ownerNav').style.display = role==='owner' ? 'block':'none';
  document.getElementById('adminNav').style.display = role==='admin' ? 'block':'none';
  const isAdmin = role==='admin';
  const roleToggle = document.querySelector('.role-toggle');
  if(roleToggle) roleToggle.style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('topbarNotifBtn').style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('topbarAvatar').style.display = isAdmin ? 'none' : 'flex';
  document.getElementById('topbarAvatar').onclick = isAdmin ? ()=>{} : ()=>goPage('profile');
  const displayName = auth.name || (isAdmin ? 'ผู้ดูแลระบบ' : 'Cooldog');
  const initials = (auth.initials) || (isAdmin ? 'AD' : (role==='owner' ? 'PO' : 'CD'));
  if(isAdmin){
    document.getElementById('sidebarAvatar').textContent = initials;
    document.getElementById('sidebarName').textContent = displayName;
    document.getElementById('roleFooterLabel').textContent = 'บัญชีผู้ดูแลระบบ';
  } else if(role==='owner'){
    document.getElementById('sidebarAvatar').textContent = initials;
    document.getElementById('sidebarName').textContent = displayName;
    document.getElementById('roleFooterLabel').textContent = 'บัญชีเจ้าของโครงการ';
  } else {
    document.getElementById('sidebarAvatar').textContent = initials;
    document.getElementById('sidebarName').textContent = displayName;
    document.getElementById('roleFooterLabel').textContent = 'บัญชีผู้รับจ้าง';
  }
  renderDraft();
  if(role==='contractor') goPage('dashboard');
  else if(role==='owner') goPage('create');
  else goPage('admin-dashboard');
}

/* ---------------- INIT ---------------- */
renderMarket(); renderMatched(); renderDraft(); renderSaved(); renderNotifications(); renderClosingSoon();
initCharts();
updateAdminBadges();
(function applyAuthBootstrap(){
  const auth = window.__STEALORS_AUTH__ || { accountRole: 'contractor' };
  if(auth.accountRole === 'admin'){
    setRole('admin');
  } else {
    setRole('contractor');
  }
})();
