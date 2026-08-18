import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import { useDragReorder } from "../lib/dragReorder";
import type { Permission, Role } from "../types";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<Permission[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [settingsRole, setSettingsRole] = useState<Role | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [modalError, setModalError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function loadRoles() {
    api.invalidateCache("/roles");
    api.getCached<Role[]>("/roles").then(setRoles).catch((e) => setError((e as Error).message));
  }

  useEffect(loadRoles, []);
  useEffect(() => {
    api
      .get<Permission[]>("/permissions")
      .then(setPermissionsCatalog)
      .catch((e) => setError((e as Error).message));
  }, []);

  async function handleCreateRole(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/roles", { name: newRoleName, sortOrder: roles.length });
      setNewRoleName("");
      loadRoles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(role: Role) {
    await api.patch(`/roles/${role.id}`, { isActive: !role.isActive });
    loadRoles();
  }

  const { draggedId, handleDragHandleMouseDown } = useDragReorder(roles, setRoles, async (changed) => {
    await Promise.all(changed.map((c) => api.patch(`/roles/${c.id}`, { sortOrder: c.sortOrder })));
    loadRoles();
  });

  function openSettings(role: Role) {
    setSettingsRole(role);
    setEditName(role.name);
    setEditDescription(role.description ?? "");
    setModalError(null);
    setMessage(null);
    api.get<number[]>(`/roles/${role.id}/permissions`).then((ids) => setChecked(new Set(ids)));
  }

  function toggleCheck(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveSettings() {
    if (!settingsRole) return;
    setModalError(null);
    setMessage(null);
    try {
      await api.patch(`/roles/${settingsRole.id}`, {
        name: editName,
        description: editDescription || null,
      });
      await api.put(`/roles/${settingsRole.id}/permissions`, { permissionIds: Array.from(checked) });
      setMessage("저장되었습니다.");
      loadRoles();
    } catch (err) {
      setModalError((err as Error).message);
    }
  }

  const grouped = new Map<string, Permission[]>();
  for (const p of permissionsCatalog) {
    const key = p.category ?? "기타";
    const list = grouped.get(key) ?? [];
    list.push(p);
    grouped.set(key, list);
  }

  return (
    <section>
      <h2>
        권한 관리
        <span className="help-icon">
          ?
          <span className="help-icon-tooltip">
            역할을 추가하고, "설정"에서 이름/설명과 권한(메뉴/기능)을 함께 관리합니다. 여기서 바뀐
            내용은 즉시 모든 사용자의 접근 권한에 반영됩니다. ⠿ 아이콘을 드래그해서 순서를 바꿀 수
            있습니다.
          </span>
        </span>
      </h2>

      <form onSubmit={handleCreateRole} className="inline-form">
        <input
          placeholder="새 역할 이름"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          역할 추가
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>이름</th>
            <th>설명</th>
            <th>상태</th>
            <th></th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} data-drag-id={r.id} style={{ opacity: draggedId === r.id ? 0.4 : 1 }}>
              <td>{r.name}</td>
              <td>{r.description ?? "-"}</td>
              <td>{r.isActive ? "사용중" : "비활성"}</td>
              <td>
                <button type="button" onClick={() => openSettings(r)}>
                  설정
                </button>
              </td>
              <td>
                <button type="button" onClick={() => toggleActive(r)}>
                  {r.isActive ? "비활성화" : "다시 사용"}
                </button>
              </td>
              <td
                aria-hidden="true"
                onMouseDown={handleDragHandleMouseDown(r.id)}
                style={{ cursor: "grab", userSelect: "none" }}
              >
                ⠿
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {settingsRole && (
        <Modal onClose={() => setSettingsRole(null)}>
          <div className="card">
            <h3>역할 설정 — {settingsRole.name}</h3>
            <label>
              이름
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label>
              설명
              <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </label>

            <h4>권한</h4>
            {Array.from(grouped.entries()).map(([category, items]) => (
              <div key={category}>
                <h4>{category}</h4>
                {items.map((p) => (
                  <label key={p.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked.has(p.id)}
                      onChange={() => toggleCheck(p.id)}
                    />
                    {p.name} <code>{p.code}</code>
                  </label>
                ))}
              </div>
            ))}

            {modalError && <p className="error">{modalError}</p>}
            {message && <p className="notice">{message}</p>}
            <div className="form-actions">
              <button type="button" onClick={saveSettings}>
                저장
              </button>
              <button type="button" onClick={() => setSettingsRole(null)}>
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
