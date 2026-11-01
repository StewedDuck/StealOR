const definitions = [
    ['bankruptcyStatus', 'สถานะล้มละลาย', 'no', /not\s+be\s+(?:a\s+)?bankrupt|ไม่เป็นบุคคลล้มละลาย/i],
    ['debarmentStatus', 'สถานะผู้ทิ้งงาน', 'no', /not\s+be\s+(?:a\s+)?(?:debarred|defaulting)|ไม่เป็นผู้ทิ้งงาน|ไม่อยู่ในบัญชี.*ทิ้งงาน/i],
    ['legalCapacity', 'มีความสามารถตามกฎหมาย', true, /(?:have\s+legal\s+capacity|legally\s+capable)|มีความสามารถตามกฎหมาย/i],
    ['liquidationStatus', 'สถานะเลิกกิจการหรือชำระบัญชี', 'no', /not\s+be\s+(?:(?:under|undergoing)\s+)?(?:business\s+)?liquidation|ไม่อยู่ระหว่าง(?:การ)?(?:ชำระบัญชี|เลิกกิจการ)/i],
    ['suspensionStatus', 'สถานะการระงับสิทธิ์', 'no', /not\s+be\s+suspended|ไม่[^,;.]{0,60}(?:ถูกระงับ|ระงับสิทธิ)/i],
    ['isJuristicPerson', 'เป็นนิติบุคคล', true, /(?:must\s+)?be\s+(?:a\s+)?(?:juristic|legal)\s+person|ต้องเป็นนิติบุคคล/i],
    ['isEGPRegistered', 'ลงทะเบียนในระบบ e-GP แล้ว', true, /registered\s+(?:in|with)\s+(?:the\s+)?e-?gp|ลงทะเบียน[^,;.]*e-GP|ลงทะเบียน[^,;.]*อีจีพี/i],
    ['hasConflictOfInterest', 'มีผลประโยชน์ทับซ้อน', false, /no\s+conflicts?\s+of\s+interest|not\s+have\s+conflicts?\s+of\s+interest|ไม่มีผลประโยชน์ทับซ้อน/i],
    ['hasCourtImmunity', 'ได้รับความคุ้มกันจากศาล', false, /not\s+have\s+(?:court\s+)?immunity|ไม่มีเอกสิทธิ์คุ้มกันจากศาล/i],
    ['hasCourtImmunityWaiver', 'สละความคุ้มกันจากศาลแล้ว', true, /waived\s+(?:court\s+)?immunity|สละ(?:เอกสิทธิ์|ความ)?คุ้มกันจากศาล/i],
    ['hasAntiCorruptionPolicy', 'มีนโยบายต่อต้านการทุจริต', true, /anti-corruption\s+policy|policy\s+and\s+guidelines\s+for\s+preventing\s+corruption|มีนโยบายต่อต้านการทุจริต/i],
    ['hasSignedIntegrityAgreement', 'ลงนามข้อตกลงคุณธรรมแล้ว', true, /(?:signed|sign)\s+(?:an?\s+)?integrity\s+agreement|ลงนาม.*ข้อตกลงคุณธรรม/i],
    ['meetsProcurementCommitteeQualifications', 'คุณสมบัติตามข้อกำหนดของคณะกรรมการจัดซื้อจัดจ้าง', true, /meet\s+(?:the\s+)?procurement\s+committee\s+qualifications|มีคุณสมบัติตาม.*คณะกรรมการ.*จัดซื้อจัดจ้าง/i],
];
function evaluateLegalEvidence(requirement, contractor) {
    const legal = contractor.legalEligibility || {};
    const text = String(requirement.sourceText || requirement.text || '').trim();
    const found = definitions.filter(([, , , pattern]) => pattern.test(text));
    const conditionDetails = found.map(([field, label, expected]) => {
        const value = legal[field];
        const known = typeof expected === 'boolean' ? typeof value === 'boolean' : ['yes', 'no'].includes(value);
        const status = !known ? 'unknown' : value === expected ? 'pass' : 'fail';
        const actual = !known ? 'ยังไม่ได้ระบุ' : typeof value === 'boolean' ? (value ? 'ใช่' : 'ไม่ใช่') : value === 'yes' ? 'มีสถานะนี้' : 'ไม่มีสถานะนี้';
        return { field: `legalEligibility.${field}`, label, status, actual,
            expected: typeof expected === 'boolean' ? (expected ? 'ใช่' : 'ไม่ใช่') : 'ไม่มีสถานะนี้',
            reason: status === 'unknown' ? `ยังไม่ได้ระบุข้อมูล ${label} ในโปรไฟล์` : status === 'fail' ? `ข้อมูล ${label} ไม่ตรงกับเงื่อนไขที่ TOR กำหนด` : `ข้อมูล ${label} ตรงกับเงื่อนไขที่ TOR กำหนด` };
    });
    // Do not silently pass a compound clause that includes an unsupported obligation.
    const clauses = text.split(/และ|รวมทั้ง|\s+and\s+(?!guidelines\s+for\s+preventing\s+corruption)/i).map(value => value.trim()).filter(Boolean);
    const unsupported = !found.length || clauses.some(clause => clause.length > 5 && !definitions.some(([, , , pattern]) => pattern.test(clause)));
    if (unsupported) conditionDetails.push({ field: null, label: 'เงื่อนไขอื่นที่ต้องตรวจสอบเพิ่มเติม', actual: 'ยังไม่มีข้อมูลที่ใช้ยืนยันได้', expected: 'หลักฐานตามข้อกำหนด TOR', status: 'unknown', reason: 'ระบบยังตรวจสอบเงื่อนไขส่วนนี้จากข้อมูลโปรไฟล์ไม่ได้ ต้องตรวจหลักฐานเพิ่มเติม' });
    const failed = conditionDetails.filter(row => row.status === 'fail').length;
    const unknown = conditionDetails.filter(row => row.status === 'unknown').length;
    const passed = conditionDetails.filter(row => row.status === 'pass').length;
    return { status: failed ? 'fail' : unknown ? 'unknown' : 'pass', conditionDetails,
        reason: `ตรวจข้อมูลในโปรไฟล์แล้ว: ตรงตามเงื่อนไข ${passed} ข้อ ไม่ตรง ${failed} ข้อ และข้อมูลไม่เพียงพอ ${unknown} ข้อ` };
}
module.exports = { evaluateLegalEvidence };
