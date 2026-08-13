CREATE TABLE `employee_compensations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`base_salary` integer NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "employee_compensations_salary_check" CHECK("employee_compensations"."base_salary" >= 0)
);
--> statement-breakpoint
CREATE TABLE `employee_leave_balances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`year` integer NOT NULL,
	`granted_days` real DEFAULT 0 NOT NULL,
	`used_days` real DEFAULT 0 NOT NULL,
	`carried_over_days` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "employee_leave_balances_days_check" CHECK("employee_leave_balances"."granted_days" >= 0 AND "employee_leave_balances"."used_days" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_leave_balances_employee_year_idx` ON `employee_leave_balances` (`employee_id`,`year`);--> statement-breakpoint
ALTER TABLE `employees` ADD `address` text;