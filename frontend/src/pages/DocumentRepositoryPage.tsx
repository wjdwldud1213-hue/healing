import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, API_BASE } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "../components/Modal";
import type { DocumentCategory, DocumentVisibility, StoredDocument } from "../types";

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  주민등록등본: "주민등록등본",
  보건증: "보건증",
  기타: "기타",
};

const VISIBILITY_LABEL: Record<DocumentVisibility, string> = {
  PUBLIC: "전체공개",
  ADMIN: "관리자공개",
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function UploadDocumentModal({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("주민등록등본");
  const [visibility, setVisibility] = useState<DocumentVisibility>("ADMIN");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("파일을 선택하세요.");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("visibility", visibility);
      await api.upload("/documents", formData);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h3>자료 업로드</h3>
      <form onSubmit={handleSubmit} className="stacked-form">
        <label>
          파일
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label>
          카테고리
          <select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          공개범위
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}>
            <option value="ADMIN">관리자공개</option>
            <option value="PUBLIC">전체공개</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "업로드 중..." : "업로드"}
          </button>
          <button type="button" onClick={onDone} disabled={submitting}>
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

// 직원이 직접 파일(주민등록등본/보건증 등)을 올리는 자료실. 전체공개는 전 직원에게,
// 관리자공개는 업로더 본인과 EMPLOYEE_WRITE 보유자에게만 노출된다(백엔드가 매번 재확인).
export function DocumentRepositoryPage() {
  const { currentUser } = useAuth();
  const canWrite = currentUser?.permissions?.includes("EMPLOYEE_WRITE") ?? false;

  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  function load() {
    api
      .get<StoredDocument[]>("/documents")
      .then(setDocuments)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  async function handleDelete(doc: StoredDocument) {
    if (!confirm(`${doc.fileName} 파일을 삭제할까요?`)) return;
    await api.delete(`/documents/${doc.id}`);
    load();
  }

  return (
    <section>
      <h2>자료실</h2>
      <p className="hint">
        주민등록등본/보건증 등 개인 서류를 직접 올릴 수 있습니다. "전체공개"는 모든 직원이,
        "관리자공개"는 본인과 관리자만 볼 수 있습니다.
      </p>

      <div className="toolbar">
        <button type="button" className="toolbar-end" onClick={() => setUploadOpen(true)}>
          업로드
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>파일명</th>
            <th>카테고리</th>
            <th>업로더</th>
            <th>공개범위</th>
            <th>크기</th>
            <th>업로드일</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.fileName}</td>
              <td>{CATEGORY_LABEL[doc.category]}</td>
              <td>{doc.employee.name}</td>
              <td>{VISIBILITY_LABEL[doc.visibility]}</td>
              <td>{formatFileSize(doc.fileSize)}</td>
              <td>{doc.createdAt.slice(0, 10)}</td>
              <td>
                <a href={`${API_BASE}/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                  다운로드
                </a>
              </td>
              <td>
                {(doc.employeeId === currentUser?.employeeId || canWrite) && (
                  <button type="button" onClick={() => handleDelete(doc)}>
                    삭제
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {uploadOpen && (
        <Modal onClose={() => setUploadOpen(false)}>
          <UploadDocumentModal
            onDone={() => {
              setUploadOpen(false);
              load();
            }}
          />
        </Modal>
      )}
    </section>
  );
}
