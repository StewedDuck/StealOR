"use client";

import { useRouter } from "next/navigation";
import Sidebar from "@/components/sideBar";
import TorForm from "@/components/projectOwner/TorForm";
import { useToast } from "@/components/toast/ToastProvider";
import { createTor } from "@/lib/torApi";
import "./create_TOR.css";

export default function CreateTOR() {
    const router = useRouter();
    const { showToast } = useToast();

    return (
        <div className="createTOR-layout">
            <Sidebar />
            <main className="createTOR-main">
                <div className="createTOR-header">
                    <div><p>เจ้าของโครงการ</p><h1>สร้าง TOR</h1><span>กรอกข้อมูลและบันทึกเป็นฉบับร่างเพื่อกลับมาแก้ไขภายหลัง</span></div>
                </div>
                <TorForm onSubmit={async (data) => { await createTor(data); showToast("สร้าง TOR ฉบับร่างสำเร็จ"); router.push("/project_own/draft_TOR"); }} />
            </main>
        </div>
    );
}
