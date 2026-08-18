import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { Modal } from "../components/Modal";
import type { Employee, JobGrade } from "../types";

type DepartmentGroup = {
  departmentId: number;
  name: string;
  sortOrder: number;
  managerId: string | null;
  members: Employee[];
};

const TRUNK_DEPTH = 32; // 임원 행 아래에서 가로 분기선까지의 세로 길이(px)

export function OrgChartPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobGrades, setJobGrades] = useState<JobGrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 재직 여부(employmentStatus)는 EMPLOYEE_WRITE 없는 조회자에게 마스킹(null)되므로,
    // 퇴사자 제외는 클라이언트가 아니라 서버(GET /employees)가 항상 책임진다.
    api
      .get<Employee[]>("/employees")
      .then(setEmployees)
      .catch((e) => setError((e as Error).message));
    api.get<JobGrade[]>("/job-grades").then(setJobGrades).catch(() => {});
  }, []);

  const { roots, executives, visibleDepartmentGroups } = useMemo(() => {
    // employmentStatus는 마스킹되면 null이 되는데, 그 경우 서버(GET /employees)가 애초에
    // 퇴사자를 응답에서 제외하고 내려주므로 null도 "재직중"으로 취급해 안전하다.
    const active = employees.filter((e) => e.employmentStatus !== "RESIGNED");
    if (active.length === 0) {
      return { roots: [] as Employee[], executives: [] as Employee[], visibleDepartmentGroups: [] as DepartmentGroup[] };
    }

    // 루트는 "가장 높은 직급 1명"이 아니라 직급명이 정확히 "대표"인 사람으로만 정한다.
    // 대표가 아직 없으면 루트가 비어있고, 실장/상무 등 임원 전원이 같은 임원 행에 나란히 놓인다.
    const roots = active.filter((e) => e.jobGrade.name === "대표");
    const rootIds = new Set(roots.map((e) => e.employeeId));

    // "상무" 이상 직급은 부서와 무관하게 대표 직속 임원으로 취급한다 — 전자결재의
    // "상무 이상 직급은 임원" 기준(getExecutiveThresholdSortOrder)과 동일한 개념을 재사용.
    // sortOrder는 작을수록 선임(대표가 최솟값)이므로, "상무 이상"은 상무의 sortOrder 이하를 의미한다.
    const executiveThreshold = jobGrades.find((g) => g.name === "상무")?.sortOrder;
    const executives =
      executiveThreshold == null
        ? []
        : active.filter((e) => !rootIds.has(e.employeeId) && e.jobGrade.sortOrder <= executiveThreshold);
    const executiveIds = new Set(executives.map((e) => e.employeeId));
    const sortedExecutives = [...executives].sort((a, b) => a.jobGrade.sortOrder - b.jobGrade.sortOrder);

    const byDept = new Map<number, Employee[]>();
    for (const emp of active) {
      if (rootIds.has(emp.employeeId) || executiveIds.has(emp.employeeId)) continue;
      const list = byDept.get(emp.departmentId) ?? [];
      list.push(emp);
      byDept.set(emp.departmentId, list);
    }

    const departmentGroups: DepartmentGroup[] = Array.from(byDept.values())
      .map((members) => ({
        departmentId: members[0].departmentId,
        name: members[0].department.name,
        sortOrder: members[0].department.sortOrder,
        managerId: members[0].department.managerId,
        members: [...members].sort((a, b) => a.jobGrade.sortOrder - b.jobGrade.sortOrder),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // 부서는 소속 직원(employees.departmentId)이 아니라 담당 임원(departments.managerId)이
    // 지정돼 있는지로만 표시 여부를 정한다 — 임원의 등록 소속 부서는 조직도상 의미가 없기 때문.
    // 담당 임원이 지정되지 않았거나 대표/임원이 아닌 사람이 지정된 경우는 표시하지 않는다.
    // 직급상 부서는 항상 임원 행 전체(대표~상무) 아래에 있는 것이므로, 실제 담당자가 누구든
    // 트리 구조는 임원 행 맨 아래에서 갈라지는 하나의 트렁크로 통일한다(담당자는 부서 상자 자체로 확인).
    // 나열 순서는 부서관리 화면의 sortOrder(코드순)와는 별개로, 담당자 순서(루트→임원 직급순)를
    // 우선하고 같은 담당자 안에서는 sortOrder로 정렬한다 — 부서관리 자체의 정렬 기준은 안 건드림.
    const ownersInOrder = [...roots, ...sortedExecutives];
    const visibleDepartmentGroups = ownersInOrder.flatMap((owner) =>
      departmentGroups.filter((g) => g.managerId === owner.employeeId),
    );

    return { roots, executives: sortedExecutives, visibleDepartmentGroups };
  }, [employees, jobGrades]);

  const hasContent = roots.length > 0 || executives.length > 0;

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastTierRowRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef(new Map<number, HTMLDivElement>());
  const [connectorPaths, setConnectorPaths] = useState<string[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  // 임원 행(직급상 맨 아래 줄) 중앙에서 내려오는 트렁크 하나가 각 부서 상자로 갈라지는
  // 꺾은선(엘보 커넥터)을 실제 화면 좌표를 측정해서 그린다. 담당자가 누구든 직급 구조상
  // 부서는 항상 임원 행 전체 아래에 있으므로 트렁크 시작점은 항상 하나로 통일한다.
  useLayoutEffect(() => {
    function recompute() {
      const container = containerRef.current;
      const trunkRow = lastTierRowRef.current;
      if (!container || !trunkRow) return;
      const containerRect = container.getBoundingClientRect();
      setSvgSize({ width: containerRect.width, height: containerRect.height });

      const rowRect = trunkRow.getBoundingClientRect();
      const startX = rowRect.left + rowRect.width / 2 - containerRect.left;
      const startY = rowRect.bottom - containerRect.top;
      const trunkY = startY + TRUNK_DEPTH;

      const paths: string[] = [];
      for (const group of visibleDepartmentGroups) {
        const groupEl = groupRefs.current.get(group.departmentId);
        if (!groupEl) continue;
        const groupRect = groupEl.getBoundingClientRect();
        const endX = groupRect.left + groupRect.width / 2 - containerRect.left;
        const endY = groupRect.top - containerRect.top;
        paths.push(`M ${startX} ${startY} L ${startX} ${trunkY} L ${endX} ${trunkY} L ${endX} ${endY}`);
      }
      setConnectorPaths(paths);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [visibleDepartmentGroups]);

  const executiveRowIsLastTier = executives.length > 0;

  return (
    <section>
      <h2>조직도</h2>
      <p className="hint">직급관리에 설정된 직급 순서와 부서관리의 담당 임원 지정을 기준으로 자동 구성됩니다.</p>

      {error && <p className="error">{error}</p>}

      {hasContent && (
        <div className="orgchart" ref={containerRef}>
          <svg
            className="orgchart-svg"
            width={svgSize.width}
            height={svgSize.height}
            aria-hidden="true"
          >
            {connectorPaths.map((d, i) => (
              <path key={i} className="orgchart-connector-path" d={d} />
            ))}
          </svg>

          {roots.length > 0 ? (
            <>
              <div className="orgchart-root-row" ref={executiveRowIsLastTier ? undefined : lastTierRowRef}>
                {roots.map((emp) => (
                  <OrgChartCard key={emp.employeeId} employee={emp} highlight onSelect={setSelectedEmployee} />
                ))}
              </div>
              {executives.length > 0 && (
                <>
                  <div className="orgchart-connector" />
                  <div className="orgchart-root-row" ref={lastTierRowRef}>
                    {executives.map((emp) => (
                      <OrgChartCard key={emp.employeeId} employee={emp} onSelect={setSelectedEmployee} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="orgchart-root-row" ref={lastTierRowRef}>
              {executives.map((emp) => (
                <OrgChartCard key={emp.employeeId} employee={emp} highlight onSelect={setSelectedEmployee} />
              ))}
            </div>
          )}

          {visibleDepartmentGroups.length > 0 && (
            <div className="orgchart-dept-row orgchart-dept-row--spaced">
              {visibleDepartmentGroups.map((group) => (
                <DeptGroupBox
                  key={group.departmentId}
                  group={group}
                  groupRef={(el) => {
                    if (el) groupRefs.current.set(group.departmentId, el);
                  }}
                  onSelect={setSelectedEmployee}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {!hasContent && !error && <p className="hint">표시할 직원이 없습니다.</p>}

      {selectedEmployee && (
        <Modal onClose={() => setSelectedEmployee(null)}>
          <div className="card">
            <h3>{selectedEmployee.name}</h3>
            <p>부서: {selectedEmployee.department.name}</p>
            <p>
              직급: {selectedEmployee.jobGrade.name}
              {selectedEmployee.jobTitle ? ` · ${selectedEmployee.jobTitle.name}` : ""}
            </p>
            {selectedEmployee.mobilePhone && <p>휴대폰번호: {selectedEmployee.mobilePhone}</p>}
            <p>내선번호: {selectedEmployee.extensionNumber ?? "-"}</p>
            <div className="form-actions">
              <button type="button" onClick={() => setSelectedEmployee(null)}>
                닫기
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

function DeptGroupBox({
  group,
  groupRef,
  onSelect,
}: {
  group: DepartmentGroup;
  groupRef?: (el: HTMLDivElement | null) => void;
  onSelect: (employee: Employee) => void;
}) {
  return (
    <div className="orgchart-dept-group" ref={groupRef}>
      <div className="orgchart-dept-name">{group.name}</div>
      <div className="orgchart-dept-members">
        {group.members.map((emp) => (
          <OrgChartCard key={emp.employeeId} employee={emp} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function OrgChartCard({
  employee,
  highlight,
  onSelect,
}: {
  employee: Employee;
  highlight?: boolean;
  onSelect: (employee: Employee) => void;
}) {
  return (
    <div
      className={`orgchart-card${highlight ? " orgchart-card--root" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(employee)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(employee);
      }}
    >
      <div className="orgchart-card-name">{employee.name}</div>
      <div className="orgchart-card-meta">
        {employee.jobGrade.name}
        {employee.jobTitle ? ` · ${employee.jobTitle.name}` : ""}
      </div>
    </div>
  );
}
