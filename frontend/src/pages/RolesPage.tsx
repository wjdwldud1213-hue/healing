import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Permission, Role } from "../types";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function loadRoles() {
    api.get<Role[]>("/roles").then(setRoles).catch((e) => setError((e as Error).message));
  }

  useEffect(loadRoles, []);
  useEffect(() => {
    api
      .get<Permission[]>("/permissions")
      .then(setPermissionsCatalog)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (selectedRoleId == null) return;
    api.get<number[]>(`/roles/${selectedRoleId}/permissions`).then((ids) => setChecked(new Set(ids)));
  }, [selectedRoleId]);

  async function handleCreateRole(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/roles", { name: newRoleName, description: newRoleDesc || undefined });
      setNewRoleName("");
      setNewRoleDesc("");
      loadRoles();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleActive(role: Role) {
    await api.patch(`/roles/${role.id}`, { isActive: !role.isActive });
    loadRoles();
  }

  function toggleCheck(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function savePermissions() {
    if (selectedRoleId == null) return;
    setMessage(null);
    setError(null);
    try {
      await api.put(`/roles/${selectedRoleId}/permissions`, { permissionIds: Array.from(checked) });
      setMessage("저장되었습니다.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const grouped = new Map<string, Permission[]>();
  for (const p of permissionsCatalog) {
    const key = p.category ?? "기타";
    const list = grouped.get(key) ?? [];
    list.push(p);
    grouped.set(key, list);
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  return (
    <section>
      <h2>역할 / 권한 관리</h2>
      <p className="hint">
        역할을 추가하고, 역할별로 어떤 권한(메뉴/기능)을 가질지 체크박스로 조정합니다. 여기서
        바뀐 내용은 즉시 모든 사용자의 접근 권한에 반영됩니다.
      </p>

      <div className="grid-2">
        <div className="card">
          <h3>역할 목록</h3>
          <form onSubmit={handleCreateRole} className="inline-form">
            <input
              placeholder="새 역할 이름"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
            />
            <input
              placeholder="설명 (선택)"
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
            />
            <button type="submit">추가</button>
          </form>
          <ul className="chip-list">
            {roles.map((r) => (
              <li key={r.id} className={r.isActive ? "" : "inactive"}>
                <button
                  type="button"
                  className={r.id === selectedRoleId ? "selected-chip" : ""}
                  onClick={() => setSelectedRoleId(r.id)}
                >
                  {r.name}
                </button>
                <button type="button" onClick={() => toggleActive(r)}>
                  {r.isActive ? "비활성화" : "다시 사용"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>권한 매트릭스{selectedRole ? ` — ${selectedRole.name}` : ""}</h3>
          {!selectedRoleId && <p className="hint">왼쪽에서 역할을 선택하세요.</p>}
          {selectedRoleId &&
            Array.from(grouped.entries()).map(([category, items]) => (
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
          {selectedRoleId && (
            <button type="button" onClick={savePermissions}>
              저장
            </button>
          )}
          {message && <p className="notice">{message}</p>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
