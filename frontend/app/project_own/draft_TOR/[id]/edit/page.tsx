"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/sideBar";
import TorForm, { toTorFormData } from "@/components/projectOwner/TorForm";
import { getTorById, updateTor } from "@/lib/torApi";
import type { TorFormData } from "@/types/tor";
import "../../../create_TOR/create_TOR.css";
import "../../draft_TOR.css";

export default function EditDraftTOR() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<TorFormData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getTorById(id).then((tor) => setData(toTorFormData(tor))).catch((err) => setError(err instanceof Error ? err.message : "โหลด TOR ไม่สำเร็จ"));
  }, [id]);

  return <div className="createTOR-layout"><Sidebar /><main className="createTOR-main"><div className="createTOR-header"><div><p>TOR ร่างของฉัน</p><h1>แก้ไข TOR</h1><span>บันทึกการเปลี่ยนแปลงลงในฉบับร่าง</span></div></div>{error ? <div className="draftTOR-error">{error}</div> : data ? <TorForm initialData={data} submitLabel="บันทึกการแก้ไข" onSubmit={async (formData) => { await updateTor(id, formData); router.push("/project_own/draft_TOR"); }} /> : <div className="draftTOR-state">กำลังโหลดข้อมูล...</div>}</main></div>;
}
