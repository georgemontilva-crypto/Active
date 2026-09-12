ALTER TABLE `products` ADD `collection` varchar(255);--> statement-breakpoint
CREATE INDEX `product_collection_idx` ON `products` (`collection`);