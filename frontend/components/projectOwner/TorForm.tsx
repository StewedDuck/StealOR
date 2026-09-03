"use client";

import { useState, type FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { TorFormData } from "@/types/tor";
import styles from "./TorForm.module.css";

type TorFormProps = {
  initialData?: TorFormData;
  submitLabel?: string;
  onSubmit: (data: TorFormData) => Promise<void>;
};

export const emptyTorForm: TorFormData = {
  projectName: "", agencyName: "", description: "", objectives: [""],
  scopeOfWork: [""], requirements: [], budget: null, submissionDeadline: "",
  contactName: "", contactEmail: "",
};

export function toTorFormData(data: TorFormData): TorFormData {
  return {
    projectName: data.projectName ?? "",
    agencyName: data.agencyName ?? "",
    description: data.description ?? "",
    objectives: data.objectives?.length ? data.objectives : [""],
    scopeOfWork: data.scopeOfWork?.length ? data.scopeOfWork : [""],
    requirements: data.requirements ?? [],
    budget: data.budget ?? null,
    submissionDeadline: data.submissionDeadline ? data.submissionDeadline.slice(0, 10) : "",
    contactName: data.contactName ?? "",
    contactEmail: data.contactEmail ?? "",
  };
}

export default function TorForm({ initialData = emptyTorForm, submitLabel = "บันทึกร่าง", onSubmit }: TorFormProps) {
  const [form, setForm] = useState<TorFormData>(() => toTorFormData(initialData));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function updateList(field: "objectives" | "scopeOfWork", index: number, value: string) {
    setForm((current) => ({ ...current, [field]: current[field].map((item, i) => i === index ? value : item) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    const cleanedData = {
      ...form,
      projectName: form.projectName.trim(),
      agencyName: form.agencyName.trim(),
      objectives: form.objectives.map((item) => item.trim()).filter(Boolean),
      scopeOfWork: form.scopeOfWork.map((item) => item.trim()).filter(Boolean),
      requirements: form.requirements.filter((item) => item.description.trim()),
    };
    try {
      await onSubmit(cleanedData);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "ไม่สามารถบันทึก TOR ได้");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && <div className={styles.error}>{error}</div>}
      <FormSection number="01" title="ข้อมูลโครงการ" subtitle="รายละเอียดพื้นฐานของ TOR">
        <div className={styles.grid}>
          <label className={styles.full}>ชื่อโครงการ <b>*</b><input required value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="เช่น โครงการพัฒนาระบบบริหารจัดการเอกสาร" /></label>
          <label>หน่วยงาน <b>*</b><input required value={form.agencyName} onChange={(e) => setForm({ ...form, agencyName: e.target.value })} placeholder="ชื่อหน่วยงานเจ้าของโครงการ" /></label>
          <label>งบประมาณ (บาท)<input type="number" min="0" value={form.budget ?? ""} onChange={(e) => setForm({ ...form, budget: e.target.value === "" ? null : Number(e.target.value) })} /></label>
          <label>วันสิ้นสุดรับข้อเสนอ<input type="date" value={form.submissionDeadline} onChange={(e) => setForm({ ...form, submissionDeadline: e.target.value })} /></label>
          <label className={styles.full}>รายละเอียดโครงการ<textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="อธิบายภาพรวมและที่มาของโครงการ" /></label>
        </div>
      </FormSection>

      {(["objectives", "scopeOfWork"] as const).map((field, fieldIndex) => (
        <FormSection key={field} number={`0${fieldIndex + 2}`} title={field === "objectives" ? "วัตถุประสงค์" : "ขอบเขตงาน"} subtitle="เพิ่มรายละเอียดได้มากกว่าหนึ่งรายการ">
          <div className={styles.list}>
            {form[field].map((item, index) => (
              <div className={styles.listRow} key={`${field}-${index}`}>
                <span>{index + 1}</span>
                <input value={item} onChange={(e) => updateList(field, index, e.target.value)} placeholder="ระบุรายละเอียด" />
                <button type="button" aria-label="ลบรายการ" onClick={() => setForm((current) => ({ ...current, [field]: current[field].filter((_, i) => i !== index) }))}><Trash2 size={17} /></button>
              </div>
            ))}
            <button className={styles.addButton} type="button" onClick={() => setForm((current) => ({ ...current, [field]: [...current[field], ""] }))}><Plus size={16} /> เพิ่มรายการ</button>
          </div>
        </FormSection>
      ))}

      <FormSection number="04" title="คุณสมบัติและเงื่อนไข" subtitle="กำหนดน้ำหนักและเงื่อนไขที่จำเป็น">
        <div className={styles.list}>
          {form.requirements.map((requirement, index) => (
            <div className={styles.requirement} key={`requirement-${index}`}>
              <input value={requirement.description} onChange={(e) => setForm((current) => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, description: e.target.value } : item) }))} placeholder="ระบุคุณสมบัติหรือเงื่อนไข" />
              <label>น้ำหนัก<input type="number" min="0" max="100" value={requirement.weight} onChange={(e) => setForm((current) => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, weight: Number(e.target.value) } : item) }))} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={requirement.mandatory} onChange={(e) => setForm((current) => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, mandatory: e.target.checked } : item) }))} /> จำเป็นต้องผ่าน</label>
              <button type="button" aria-label="ลบเงื่อนไข" onClick={() => setForm((current) => ({ ...current, requirements: current.requirements.filter((_, i) => i !== index) }))}><Trash2 size={17} /></button>
            </div>
          ))}
          <button className={styles.addButton} type="button" onClick={() => setForm((current) => ({ ...current, requirements: [...current.requirements, { description: "", weight: 0, mandatory: false }] }))}><Plus size={16} /> เพิ่มเงื่อนไข</button>
        </div>
      </FormSection>

      <FormSection number="05" title="ข้อมูลผู้ติดต่อ" subtitle="ข้อมูลสำหรับติดต่อเกี่ยวกับโครงการ">
        <div className={styles.grid}>
          <label>ชื่อผู้ติดต่อ<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
          <label>อีเมล<input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></label>
        </div>
      </FormSection>

      <div className={styles.actions}><span>ข้อมูลจะถูกจัดเก็บเป็นฉบับร่าง</span><button className={styles.saveButton} disabled={isSaving} type="submit"><Save size={17} /> {isSaving ? "กำลังบันทึก..." : submitLabel}</button></div>
    </form>
  );
}

function FormSection({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className={styles.section}><div className={styles.sectionHeading}><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}
