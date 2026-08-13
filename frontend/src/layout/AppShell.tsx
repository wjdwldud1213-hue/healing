import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { filterMenuByPermissions, findMenuItemByPath } from "./menuData";
import type { MenuGroup } from "./menuData";

const MOBILE_BREAKPOINT = 767;

function GroupIcon({ pathFragment }: { pathFragment: string }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: pathFragment }}
    />
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

// 경로가 menuData에 없는 화면(홈/마이페이지 등)의 브레드크럼 표시용 이름
const STATIC_PAGE_LABELS: Record<string, string> = {
  "/": "홈",
  "/my-profile": "마이페이지",
  "/change-password": "비밀번호 변경",
};

export function AppShell() {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

  // openGroupId: 어떤 그룹이 "논리적으로" 펼쳐져 있는지 (모바일에서 패널을 닫아도 유지됨)
  // panelVisible: 서브메뉴 패널이 실제로 화면에 보이는지 (모바일 오버레이 표시 여부)
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const visibleMenu = useMemo(
    () => filterMenuByPermissions(currentUser?.permissions ?? []),
    [currentUser],
  );

  const activeMatch = findMenuItemByPath(location.pathname);

  // 라우트가 바뀔 때마다(직접 URL 진입/새로고침 포함) 해당 그룹을 논리적으로 펼친다.
  // 데스크톱은 패널을 계속 보여주고, 모바일은 오버레이를 자동으로 띄우지 않고 상태만 기억한다.
  useEffect(() => {
    const match = findMenuItemByPath(location.pathname);
    if (match) {
      setOpenGroupId(match.group.id);
      setPanelVisible(!isMobile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 패널/프로필 바깥을 클릭하면 닫는다
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (panelVisible && shellRef.current && !shellRef.current.contains(e.target as Node)) {
        setOpenGroupId(null);
        setPanelVisible(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [panelVisible]);

  function toggleGroup(id: string) {
    if (openGroupId === id) {
      setOpenGroupId(null);
      setPanelVisible(false);
    } else {
      setOpenGroupId(id);
      setPanelVisible(true);
    }
  }

  function handleChildClick() {
    if (isMobile) setPanelVisible(false);
  }

  function handleHamburgerClick() {
    if (panelVisible) {
      setOpenGroupId(null);
      setPanelVisible(false);
      return;
    }
    if (!openGroupId && visibleMenu[0]) setOpenGroupId(visibleMenu[0].id);
    setPanelVisible(true);
  }

  const breadcrumbLabel = activeMatch
    ? `${activeMatch.group.label} › ${activeMatch.child.label}`
    : (STATIC_PAGE_LABELS[location.pathname] ?? "");

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="hamburger-btn"
            aria-label="메뉴 열기"
            aria-expanded={panelVisible}
            onClick={handleHamburgerClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="logo-text">Healing Food</span>
          {breadcrumbLabel && (
            <p className="breadcrumb">
              {activeMatch ? (
                <>
                  {activeMatch.group.label} <span>&rsaquo;</span> <b>{activeMatch.child.label}</b>
                </>
              ) : (
                breadcrumbLabel
              )}
            </p>
          )}
        </div>

        <div className="topbar-right">
          <button className="icon-btn" aria-label="알림">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="badge-dot" />
          </button>

          <div className="profile-menu" ref={profileRef}>
            <button
              className="profile-btn"
              aria-haspopup="true"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((v) => !v)}
            >
              <span className="avatar">{currentUser?.name.charAt(0)}</span>
              <span className="profile-info">
                <span className="profile-name">
                  {currentUser?.name} {currentUser?.jobGrade.name}
                </span>
                <span className="profile-dept">{currentUser?.department.name}</span>
              </span>
              <ChevronIcon className="chevron-icon" />
            </button>
            <div className={`profile-dropdown${profileOpen ? " open" : ""}`}>
              <Link to="/my-profile" onClick={() => setProfileOpen(false)}>
                마이페이지
              </Link>
              <button type="button" onClick={() => logout()}>
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <div
          className={`sidebar-overlay${panelVisible && isMobile ? " show" : ""}`}
          onClick={() => {
            setOpenGroupId(null);
            setPanelVisible(false);
          }}
        />

        <aside className="sidebar-wrapper" ref={shellRef}>
          <nav className="icon-rail" aria-label="대분류 메뉴">
            {visibleMenu.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`rail-icon${openGroupId === group.id ? " active" : ""}`}
                aria-label={group.label}
                onClick={() => toggleGroup(group.id)}
              >
                <GroupIcon pathFragment={group.icon} />
                <span className="rail-label">{group.label}</span>
                <span className="rail-tooltip">{group.label}</span>
              </button>
            ))}
          </nav>

          <div className={`submenu-panel${panelVisible ? " panel-open" : ""}`}>
            <div className="submenu-panel-inner">
              {visibleMenu.map((group) => (
                <MenuGroupAccordion
                  key={group.id}
                  group={group}
                  open={openGroupId === group.id}
                  activeChildId={activeMatch?.child.id ?? null}
                  onHeaderClick={() => toggleGroup(group.id)}
                  onChildClick={handleChildClick}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}

function MenuGroupAccordion({
  group,
  open,
  activeChildId,
  onHeaderClick,
  onChildClick,
}: {
  group: MenuGroup;
  open: boolean;
  activeChildId: string | null;
  onHeaderClick: () => void;
  onChildClick: () => void;
}) {
  return (
    <div className="menu-group">
      <button type="button" className="group-header" aria-expanded={open} onClick={onHeaderClick}>
        <span>{group.label}</span>
        <ChevronIcon className="chevron" />
      </button>
      <div className={`group-children${open ? " open" : ""}`}>
        <div className="group-children-inner">
          {group.children.map((child) => (
            <Link
              key={child.id}
              to={child.path}
              className={`child-link${activeChildId === child.id ? " active" : ""}`}
              onClick={onChildClick}
            >
              <span>{child.label}</span>
              {child.badge != null && <span className="child-badge">{child.badge}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
