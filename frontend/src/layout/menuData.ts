export type MenuChild = {
  id: string;
  label: string;
  path: string;
  badge?: number | null;
  /** 이 중 하나라도 있으면 노출. 없으면(undefined) 로그인만 하면 누구나 볼 수 있음 */
  anyOfPermissions?: string[];
  /** true면 상무 이상 직급(currentUser.isExecutive)에게만 노출된다 — 권한 코드가 아니라 직급 기준. */
  executiveOnly?: boolean;
  /** true면 모바일 하단 탭바에 바로가기로 노출된다. 어떤 항목을 넣을지는 이 값만 바꾸면 됨. */
  mobileTab?: boolean;
};

/** 모바일 하단 탭바 아이콘(24x24 stroke SVG 내부 path 조각). child.id로 매핑. */
export const MOBILE_TAB_ICONS: Record<string, string> = {
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  vacation: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  approvalInbox: '<path d="M9 11l3 3L22 4"/><path d="M21 11v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/>',
};

export type MenuGroup = {
  id: string;
  label: string;
  /** 24x24 stroke SVG의 내부 path 조각. rail-icon/group-header 아이콘에 그대로 삽입된다. */
  icon: string;
  children: MenuChild[];
};

// 아이콘 레일 + 아코디언 서브메뉴는 이 배열 하나로 렌더링된다.
// 항목을 추가/삭제하면 AppShell이 자동으로 반영한다 (index.html 시안의 menuData 패턴 유지).
export const menuData: MenuGroup[] = [
  {
    id: "hr",
    label: "인사관리",
    icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="3" y1="12" x2="21" y2="12"/>',
    children: [
      {
        id: "orgChart",
        label: "조직도",
        path: "/org-chart",
      },
      {
        id: "empManage",
        label: "직원 관리",
        path: "/employees",
        anyOfPermissions: ["EMPLOYEE_READ_ALL", "EMPLOYEE_READ_DEPARTMENT"],
      },
    ],
  },
  {
    id: "attendance",
    label: "근태관리",
    icon: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    children: [
      { id: "clock", label: "출근/퇴근", path: "/attendance/clock", badge: null, mobileTab: true },
      { id: "vacation", label: "연차 관리", path: "/leave", badge: null, mobileTab: true },
      { id: "attHistory", label: "근태내역조회", path: "/attendance-history", badge: null },
    ],
  },
  {
    id: "approval",
    label: "전자결재",
    icon: '<path d="M9 11l3 3L22 4"/><path d="M21 11v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/>',
    children: [
      { id: "approvalDrafts", label: "기안함", path: "/approval/drafts" },
      { id: "approvalInbox", label: "결재함", path: "/approval/inbox", mobileTab: true },
      { id: "approvalAll", label: "전체 문서함", path: "/approval/all", executiveOnly: true },
    ],
  },
  {
    id: "system",
    label: "시스템관리",
    icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    children: [
      { id: "deptManage", label: "부서 관리", path: "/departments", anyOfPermissions: ["DEPARTMENT_MANAGE"] },
      {
        id: "rankManage",
        label: "직급 관리",
        path: "/reference",
        anyOfPermissions: ["JOB_CODE_MANAGE"],
      },
      { id: "roleManage", label: "권한 관리", path: "/roles", anyOfPermissions: ["ROLE_MANAGE"] },
      {
        id: "workPlaceManage",
        label: "근무지 관리",
        path: "/work-places",
        anyOfPermissions: ["ATTENDANCE_MANAGE"],
      },
    ],
  },
];

/** 현재 사용자의 권한 목록/직급으로 볼 수 있는 자식만 남긴 메뉴 트리를 만든다 */
export function filterMenuByPermissions(permissions: string[], isExecutive = false): MenuGroup[] {
  return menuData
    .map((group) => ({
      ...group,
      children: group.children.filter((child) => {
        if (child.executiveOnly && !isExecutive) return false;
        return !child.anyOfPermissions || child.anyOfPermissions.some((p) => permissions.includes(p));
      }),
    }))
    .filter((group) => group.children.length > 0);
}

/** 모바일 하단 탭바에 노출할 항목만 권한/직급 필터링해서 뽑는다 (menuData 순서를 그대로 따름) */
export function getMobileTabItems(permissions: string[], isExecutive = false): MenuChild[] {
  return filterMenuByPermissions(permissions, isExecutive)
    .flatMap((group) => group.children)
    .filter((child) => child.mobileTab);
}

/** 현재 경로(pathname)와 일치하는 메뉴 항목을 찾는다 (브레드크럼/활성 상태 표시용) */
export function findMenuItemByPath(pathname: string): { group: MenuGroup; child: MenuChild } | null {
  for (const group of menuData) {
    const child = group.children.find((c) => c.path === pathname);
    if (child) return { group, child };
  }
  return null;
}
