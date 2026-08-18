PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`category` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`visibility` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "documents_visibility_check" CHECK("__new_documents"."visibility" IN ('PUBLIC', 'DEPARTMENT', 'ADMIN')),
	CONSTRAINT "documents_category_check" CHECK("__new_documents"."category" IN ('주민등록등본', '보건증', '기타'))
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "employee_id", "category", "file_name", "storage_key", "mime_type", "file_size", "visibility", "created_at") SELECT "id", "employee_id", "category", "file_name", "storage_key", "mime_type", "file_size", "visibility", "created_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;