CREATE TABLE `approval_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_type` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`drafter_id` text NOT NULL,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`current_step_order` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`drafter_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approval_documents_document_type_check" CHECK("approval_documents"."document_type" IN ('GENERAL','LEAVE')),
	CONSTRAINT "approval_documents_status_check" CHECK("approval_documents"."status" IN ('IN_PROGRESS','APPROVED','REJECTED','CANCELED'))
);
--> statement-breakpoint
CREATE TABLE `approval_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`step_order` integer NOT NULL,
	`approver_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`comment` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `approval_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approval_steps_status_check" CHECK("approval_steps"."status" IN ('PENDING','APPROVED','REJECTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_steps_document_step_idx` ON `approval_steps` (`document_id`,`step_order`);--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `document_id` integer REFERENCES approval_documents(id);