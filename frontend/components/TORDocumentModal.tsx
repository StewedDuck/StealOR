"use client";

import { useEffect, useState } from "react";
import {
    FileText,
    X,
    ExternalLink,
} from "lucide-react";

import {
    getLocalDocumentUrl,
    getLocalProjectDocuments,
    type LocalProjectDocuments,
} from "@/lib/torApi";

import "./TORDocumentModal.css";

type Props = {
    projectId: string;
    projectName: string;
    onClose: () => void;
};

export default function TORDocumentModal({
    projectId,
    projectName,
    onClose,
}: Props) {
    const [data, setData] = useState<LocalProjectDocuments | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        setLoading(true);
        setError("");

        getLocalProjectDocuments(projectId)
        .then(setData)
        .catch((error) => {
            setError(
            error instanceof Error
                ? error.message
                : "ไม่สามารถโหลดเอกสารได้"
            );
        })
        .finally(() => {
            setLoading(false);
        });
    }, [projectId]);

    const categories = data
        ? [
            {
                label: "ประกาศราคากลาง",
                document: data.documents.priceEstimate,
            },
            {
                label: "ร่างเอกสารประกวดราคา",
                document: data.documents.draftEbidding,
            },
            {
                label: "ประกาศเชิญชวน",
                document: data.documents.invitation,
            },
        ]
        : [];

    return (
        <div
            className="tor-document-overlay"
            onClick={onClose}
        >
            <div
                className="tor-document-modal"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="tor-document-header">
                    <div>
                        <h2>เอกสาร TOR</h2>
                        <p>{projectName}</p>
                    </div>

                    <button
                        type="button"
                        className="tor-document-close"
                        onClick={onClose}
                        aria-label="ปิด"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="tor-document-body">
                    {loading && (
                        <div className="tor-document-message">
                            กำลังโหลดเอกสาร...
                        </div>
                    )}

                    {error && (
                        <div className="tor-document-message error">
                            {error}
                        </div>
                    )}

                    {!loading &&
                        !error &&
                        categories.map(
                        ({ label, document }) => (
                            <div
                                className="tor-document-row"
                                key={label}
                            >
                                <span className="tor-document-label">
                                    {label}
                                </span>

                                {!document.available ? (
                                    <span className="tor-document-empty">
                                        -
                                    </span>
                                ) : (
                                    <div className="tor-document-files">
                                        {document.files.map((file) => (
                                            <button
                                                key={file.fileName}
                                                type="button"
                                                className="tor-document-file"
                                                title={file.fileName}
                                                onClick={() =>
                                                    window.open(
                                                        getLocalDocumentUrl(file.url),
                                                        "_blank",
                                                        "noopener,noreferrer"
                                                    )
                                                }
                                            >
                                                <FileText
                                                    size={18}
                                                    className="tor-document-file-icon"
                                                />

                                                <span className="tor-document-file-name">
                                                    {file.fileName}
                                                </span>

                                                <ExternalLink
                                                    size={13}
                                                    className="tor-document-file-open"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}