-- AddColumn: Add new notification sound fields for handoff and ready status
ALTER TABLE tenant_settings
ADD COLUMN handoff_sound VARCHAR(255) DEFAULT 'notification.mp3' NOT NULL,
ADD COLUMN ready_sound VARCHAR(255) DEFAULT 'notification.mp3' NOT NULL,
ADD COLUMN browser_notifications_enabled BOOLEAN DEFAULT true NOT NULL;

-- Update existing records with default values if any NULL values exist
UPDATE tenant_settings
SET handoff_sound = 'notification.mp3' WHERE handoff_sound IS NULL;

UPDATE tenant_settings
SET ready_sound = 'notification.mp3' WHERE ready_sound IS NULL;

UPDATE tenant_settings
SET browser_notifications_enabled = true WHERE browser_notifications_enabled IS NULL;
