ALTER TABLE `employees` ADD `employment_type` text DEFAULT 'REGULAR' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `is_owner_operator` integer;--> statement-breakpoint
ALTER TABLE `employees` ADD `view_pin_hash` text;