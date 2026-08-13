CREATE TABLE `leave_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`days` real NOT NULL,
	`reason` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_by` text,
	`decided_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "leave_requests_days_check" CHECK("leave_requests"."days" > 0),
	CONSTRAINT "leave_requests_status_check" CHECK("leave_requests"."status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
