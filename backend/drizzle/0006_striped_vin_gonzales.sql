CREATE TABLE `attendance_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` text NOT NULL,
	`work_place_id` integer,
	`check_in_at` text NOT NULL,
	`check_out_at` text,
	`check_in_lat` real,
	`check_in_lng` real,
	`check_out_lat` real,
	`check_out_lng` real,
	`check_in_accuracy` real,
	`check_out_accuracy` real,
	`check_in_is_mocked` integer,
	`check_out_is_mocked` integer,
	`check_in_device_type` text NOT NULL,
	`check_out_device_type` text,
	`check_in_type` text NOT NULL,
	`check_out_type` text,
	`status` text DEFAULT 'WORKING' NOT NULL,
	`reason` text,
	`approver_id` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`work_place_id`) REFERENCES `work_places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attendance_logs_status_check" CHECK("attendance_logs"."status" IN ('WORKING', 'DONE', 'PENDING_APPROVAL', 'REJECTED')),
	CONSTRAINT "attendance_logs_check_in_type_check" CHECK("attendance_logs"."check_in_type" IN ('NORMAL', 'FIELD', 'MANUAL')),
	CONSTRAINT "attendance_logs_check_out_type_check" CHECK("attendance_logs"."check_out_type" IS NULL OR "attendance_logs"."check_out_type" IN ('NORMAL', 'FIELD', 'MANUAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_logs_working_employee_idx` ON `attendance_logs` (`employee_id`) WHERE "attendance_logs"."status" = 'WORKING';--> statement-breakpoint
CREATE TABLE `work_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`radius_m` integer DEFAULT 100 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
-- job_type은 새 컬럼 하나만 참조하는 CHECK라서 테이블 재생성(rebuild) 없이 일반 ADD COLUMN으로 처리 가능하다.
-- D1은 PRAGMA foreign_keys=OFF가 배치 내에서 안정적으로 적용되지 않아(다른 테이블의 employees FK 때문에
-- rebuild용 DROP TABLE employees가 FOREIGN KEY constraint failed로 실패함), drizzle-kit이 기본 생성한
-- rebuild 방식 대신 이 단순 ALTER TABLE로 직접 수정했다.
ALTER TABLE `employees` ADD COLUMN `job_type` text NOT NULL DEFAULT 'OFFICE' CHECK(`job_type` IN ('OFFICE', 'DELIVERY', 'SALES'));