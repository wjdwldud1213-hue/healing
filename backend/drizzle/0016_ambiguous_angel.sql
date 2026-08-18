CREATE INDEX `approval_steps_approver_id_idx` ON `approval_steps` (`approver_id`);--> statement-breakpoint
CREATE INDEX `attendance_logs_employee_checkin_idx` ON `attendance_logs` (`employee_id`,`check_in_at`);--> statement-breakpoint
CREATE INDEX `documents_visibility_idx` ON `documents` (`visibility`);--> statement-breakpoint
CREATE INDEX `documents_employee_id_idx` ON `documents` (`employee_id`);--> statement-breakpoint
CREATE INDEX `employees_department_id_idx` ON `employees` (`department_id`);--> statement-breakpoint
CREATE INDEX `employees_employment_status_idx` ON `employees` (`employment_status`);--> statement-breakpoint
CREATE INDEX `leave_grants_employee_id_idx` ON `leave_grants` (`employee_id`);