import { useEffect, useMemo, useState } from "react";
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
  DEPARTMENT: "부서공개",
  ADMIN: "관리자공개",
};

// 일부 분류는 공개범위가 고정이다(백엔드도 동일 규칙으로 재검증한다) — 보건증은
// 전체공개, 등본은 관리자공개로 강제하고 "기타"만 자유롭게 고를 수 있다.
const FIXED_VISIBILITY_BY_CATEGORY: Partial<Record<DocumentCategory, DocumentVisibility>> = {
  보건증: "PUBLIC",
  주민등록등본: "ADMIN",
};

function UploadDocumentModal({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("주민등록등본");
  const [visibility, setVisibility] = useState<DocumentVisibility>("ADMIN");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fixedVisibility = FIXED_VISIBILITY_BY_CATEGORY[category];

  function handleCategoryChange(next: DocumentCategory) {
    setCategory(next);
    const fixed = FIXED_VISIBILITY_BY_CATEGORY[next];
    if (fixed) setVisibility(fixed);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("파일을 선택하세요.");
      return;
    }
    if (validFrom && validUntil && validFrom > validUntil) {
      setError("유효기간 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("visibility", visibility);
      if (category === "보건증") {
        if (validFrom) formData.append("validFrom", validFrom);
        if (validUntil) formData.append("validUntil", validUntil);
      }
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
          분류
          <select value={category} onChange={(e) => handleCategoryChange(e.target.value as DocumentCategory)}>
            {(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          공개범위
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
            disabled={!!fixedVisibility}
          >
            <option value="ADMIN">관리자공개</option>
            <option value="DEPARTMENT">부서공개</option>
            <option value="PUBLIC">전체공개</option>
          </select>
        </label>
        {fixedVisibility && (
          <p className="hint">
            "{CATEGORY_LABEL[category]}"는 공개범위가 {VISIBILITY_LABEL[fixedVisibility]}로 고정됩니다.
          </p>
        )}
        {category === "보건증" && (
          <>
            <label>
              유효기간 시작일
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </label>
            <label>
              유효기간 종료일
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
          </>
        )}
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
// 관리자공개는 등록자 본인과 EMPLOYEE_WRITE 보유자에게만 노출된다(백엔드가 매번 재확인).
export function DocumentRepositoryPage() {
  const { currentUser } = useAuth();
  const canWrite = currentUser?.permissions?.includes("EMPLOYEE_WRITE") ?? false;

  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [departmentFilter, setDepartmentFilter] = useState<number | "">("");
  const [uploaderFilter, setUploaderFilter] = useState<string | "">("");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "">("");
  const [validUntilSort, setValidUntilSort] = useState<"asc" | "desc" | null>(null);

  function toggleValidUntilSort() {
    setValidUntilSort((prev) => (prev === null ? "asc" : prev === "asc" ? "desc" : null));
  }

  function load() {
    api
      .get<StoredDocument[]>("/documents")
      .then(setDocuments)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(load, []);

  const departments = useMemo(() => {
    const map = new Map<number, string>();
    for (const doc of documents) map.set(doc.employee.department.id, doc.employee.department.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [documents]);

  const uploaders = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) map.set(doc.employee.employeeId, doc.employee.name);
    return Array.from(map.entries()).map(([employeeId, name]) => ({ employeeId, name }));
  }, [documents]);

  const filteredDocuments = documents.filter((doc) => {
    if (departmentFilter && doc.employee.department.id !== departmentFilter) return false;
    if (uploaderFilter && doc.employee.employeeId !== uploaderFilter) return false;
    if (categoryFilter && doc.category !== categoryFilter) return false;
    return true;
  });

  // 유효기간이 없는 분류(주민등록등본/기타)는 정렬 방향과 무관하게 항상 뒤로 보낸다.
  const sortedDocuments = validUntilSort
    ? [...filteredDocuments].sort((a, b) => {
        if (!a.validUntil && !b.validUntil) return 0;
        if (!a.validUntil) return 1;
        if (!b.validUntil) return -1;
        return validUntilSort === "asc"
          ? a.validUntil.localeCompare(b.validUntil)
          : b.validUntil.localeCompare(a.validUntil);
      })
    : filteredDocuments;

  async function handleDelete(doc: StoredDocument) {
    if (!confirm(`${doc.fileName} 파일을 삭제할까요?`)) return;
    await api.delete(`/documents/${doc.id}`);
    load();
  }

  return (
    <section>
      <h2>
        자료실
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            주민등록등본/보건증 등 개인 서류를 직접 올릴 수 있습니다. "전체공개"는 모든 직원이,
            "부서공개"는 본인과 같은 부서 직원만, "관리자공개"는 본인과 관리자만 볼 수 있습니다.
          </span>
        </span>
      </h2>

      <div className="toolbar">
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">부서별</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={uploaderFilter} onChange={(e) => setUploaderFilter(e.target.value)}>
          <option value="">등록자별</option>
          {uploaders.map((u) => (
            <option key={u.employeeId} value={u.employeeId}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as DocumentCategory | "")}
        >
          <option value="">분류별</option>
          {(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <button type="button" className="toolbar-end" onClick={() => setUploadOpen(true)}>
          업로드
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>등록자</th>
            <th>분류</th>
            <th>파일명</th>
            <th></th>
            <th onClick={toggleValidUntilSort} style={{ cursor: "pointer", userSelect: "none" }}>
              유효기간{validUntilSort === "asc" ? " ▲" : validUntilSort === "desc" ? " ▼" : ""}
            </th>
            <th>업로드일</th>
            <th>공개범위</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedDocuments.map((doc) => (
            <tr key={doc.id}>
              <td>{doc.employee.name}</td>
              <td>{CATEGORY_LABEL[doc.category]}</td>
              <td>{doc.fileName}</td>
              <td>
                <a href={`${API_BASE}/documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                  다운로드
                </a>
              </td>
              <td>
                {doc.validFrom && doc.validUntil ? `${doc.validFrom} ~ ${doc.validUntil}` : "-"}
              </td>
              <td>{doc.createdAt.slice(0, 10)}</td>
              <td>{VISIBILITY_LABEL[doc.visibility]}</td>
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
