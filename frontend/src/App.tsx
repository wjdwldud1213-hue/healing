import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequirePermission } from "./auth/RequirePermission";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ReferenceDataPage } from "./pages/ReferenceDataPage";
import { AdminPasswordResetsPage } from "./pages/AdminPasswordResetsPage";
import { RolesPage } from "./pages/RolesPage";
import { MyProfilePage } from "./pages/MyProfilePage";

const CAN_VIEW_EMPLOYEE_LIST = ["EMPLOYEE_READ_ALL", "EMPLOYEE_READ_DEPARTMENT"];

function HomeRedirect() {
  const { currentUser } = useAuth();
  const perms = currentUser?.permissions ?? [];
  const canViewList = CAN_VIEW_EMPLOYEE_LIST.some((p) => perms.includes(p));
  return <Navigate to={canViewList ? "/employees" : "/my-profile"} replace />;
}

function AppShell() {
  const { currentUser, logout } = useAuth();
  const perms = currentUser?.permissions ?? [];
  const canViewList = CAN_VIEW_EMPLOYEE_LIST.some((p) => perms.includes(p));

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>사내 그룹웨어 — 인사관리</h1>
        <nav>
          {canViewList ? (
            <NavLink to="/employees">직원 관리</NavLink>
          ) : (
            <NavLink to="/my-profile">내 정보</NavLink>
          )}
          {perms.includes("DEPARTMENT_MANAGE") && <NavLink to="/departments">부서 관리</NavLink>}
          {perms.includes("JOB_CODE_MANAGE") && <NavLink to="/reference">직급/직책 관리</NavLink>}
          {perms.includes("EMPLOYEE_APPROVE") && (
            <NavLink to="/password-resets">비밀번호 재설정 승인</NavLink>
          )}
          {perms.includes("ROLE_MANAGE") && <NavLink to="/roles">역할/권한 관리</NavLink>}
        </nav>
        {currentUser && (
          <div className="user-badge">
            <span>
              {currentUser.name} ({currentUser.employeeId}) · {currentUser.role.name}
            </span>
            <button type="button" onClick={() => logout()}>
              로그아웃
            </button>
          </div>
        )}
      </header>
      <main>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/my-profile" element={<MyProfilePage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route element={<RequirePermission anyOf={CAN_VIEW_EMPLOYEE_LIST} />}>
              <Route path="/employees" element={<EmployeesPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={["DEPARTMENT_MANAGE"]} />}>
              <Route path="/departments" element={<DepartmentsPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={["JOB_CODE_MANAGE"]} />}>
              <Route path="/reference" element={<ReferenceDataPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={["EMPLOYEE_APPROVE"]} />}>
              <Route path="/password-resets" element={<AdminPasswordResetsPage />} />
            </Route>
            <Route element={<RequirePermission anyOf={["ROLE_MANAGE"]} />}>
              <Route path="/roles" element={<RolesPage />} />
            </Route>
          </Route>
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
