CREATE TABLE `admin_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`name` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `admin_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `auth_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(128) NOT NULL,
	`productId` int,
	`batch` varchar(128),
	`verificationCount` int NOT NULL DEFAULT 0,
	`maxVerifications` int NOT NULL DEFAULT 3,
	`disabled` boolean NOT NULL DEFAULT false,
	`firstVerifiedAt` timestamp,
	`lastVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auth_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `lab_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`batch` varchar(128),
	`lab` varchar(255),
	`testedOn` varchar(32),
	`fileUrl` varchar(1024) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileName` varchar(255),
	`sizeBytes` bigint,
	`published` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(255) NOT NULL,
	`subtitle` varchar(255),
	`description` text,
	`imageUrl` varchar(1024),
	`imageKey` varchar(512),
	`sortOrder` int NOT NULL DEFAULT 0,
	`published` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `query_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(128) NOT NULL,
	`result` enum('valid','not_found','limit_reached','disabled') NOT NULL,
	`attemptNumber` int,
	`ip` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `query_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `auth_code_idx` ON `auth_codes` (`code`);--> statement-breakpoint
CREATE INDEX `auth_code_product_idx` ON `auth_codes` (`productId`);--> statement-breakpoint
CREATE INDEX `lab_report_product_idx` ON `lab_reports` (`productId`);--> statement-breakpoint
CREATE INDEX `lab_report_published_idx` ON `lab_reports` (`published`);--> statement-breakpoint
CREATE INDEX `product_slug_idx` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `product_sort_idx` ON `products` (`sortOrder`);--> statement-breakpoint
CREATE INDEX `log_code_idx` ON `query_logs` (`code`);--> statement-breakpoint
CREATE INDEX `log_result_idx` ON `query_logs` (`result`);--> statement-breakpoint
CREATE INDEX `log_created_idx` ON `query_logs` (`createdAt`);