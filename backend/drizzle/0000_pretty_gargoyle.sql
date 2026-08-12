CREATE TABLE `department_code_sequences` (
	`department_code` text PRIMARY KEY NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "departments_code_format" CHECK("departments"."code" GLOB '[A-Z]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE TABLE `employee_assignment_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`department_id` integer NOT NULL,
	`job_grade_id` integer NOT NULL,
	`job_title_id` integer,
	`effective_date` text NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_grade_id`) REFERENCES `job_grades`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_title_id`) REFERENCES `job_titles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`department_id` integer NOT NULL,
	`job_grade_id` integer NOT NULL,
	`job_title_id` integer,
	`hire_date` text NOT NULL,
	`employment_status` text DEFAULT 'ACTIVE' NOT NULL,
	`status_changed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`mobile_phone` text NOT NULL,
	`extension_number` text,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`role_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_grade_id`) REFERENCES `job_grades`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_title_id`) REFERENCES `job_titles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "employees_id_format" CHECK("employees"."employee_id" GLOB '[A-Z][0-9][0-9][0-9][0-9]'),
	CONSTRAINT "employees_employment_status_check" CHECK("employees"."employment_status" IN ('ACTIVE', 'LEAVE', 'RESIGNED'))
);
--> statement-breakpoint
CREATE TABLE `job_grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `password_reset_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "password_reset_requests_status_check" CHECK("password_reset_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_code_unique` ON `permissions` (`code`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	`granted_by` text,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_activity_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`revoked_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
