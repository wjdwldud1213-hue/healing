import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { RequirePermission } from "./auth/RequirePermission";
import { AppShell } from "./layout/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { DepartmentsPage } from "./pages/DepartmentsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ReferenceDataPage } from "./pages/ReferenceDataPage";
import { AdminPasswordResetsPage } from "./pages/AdminPasswordResetsPage";
import { RolesPage } from "./pages/RolesPage";
import { MyProfilePage } from "./pages/MyProfilePage";
import { LeaveManagementPage } from "./pages/LeaveManagementPage";
import { AdminLeaveRequestsPage } from "./pages/AdminLeaveRequestsPage";
import { AttendanceHistoryPage } from "./pages/AttendanceHistoryPage";
import { AttendanceClockPage } from "./pages/AttendanceClockPage";
import { WorkPlacesPage } from "./pages/WorkPlacesPage";

const CAN_VIEW_EMPLOYEE_LIST = ["EMPLOYEE_READ_ALL", "EMPLOYEE_READ_DEPARTMENT"];

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/my-profile" element={<MyProfilePage />} />
              <Route path="/leave" element={<LeaveManagementPage />} />
              <Route path="/attendance-history" element={<AttendanceHistoryPage />} />
              <Route path="/attendance/clock" element={<AttendanceClockPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/coming-soon/:feature" element={<ComingSoonPage />} />

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
              <Route element={<RequirePermission anyOf={["LEAVE_APPROVE"]} />}>
                <Route path="/leave/admin" element={<AdminLeaveRequestsPage />} />
              </Route>
              <Route element={<RequirePermission anyOf={["ATTENDANCE_MANAGE"]} />}>
                <Route path="/work-places" element={<WorkPlacesPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
