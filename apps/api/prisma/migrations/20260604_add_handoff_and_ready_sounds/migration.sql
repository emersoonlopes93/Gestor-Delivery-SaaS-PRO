DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_settings' AND column_name='handoff_sound') THEN
        ALTER TABLE tenant_settings ADD COLUMN handoff_sound VARCHAR(255) DEFAULT 'notification.mp3';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_settings' AND column_name='ready_sound') THEN
        ALTER TABLE tenant_settings ADD COLUMN ready_sound VARCHAR(255) DEFAULT 'notification.mp3';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenant_settings' AND column_name='browser_notifications_enabled') THEN
        ALTER TABLE tenant_settings ADD COLUMN browser_notifications_enabled BOOLEAN DEFAULT true;
    END IF;
END $$;

ALTER TABLE tenant_settings ALTER COLUMN handoff_sound SET NOT NULL;
ALTER TABLE tenant_settings ALTER COLUMN ready_sound SET NOT NULL;
ALTER TABLE tenant_settings ALTER COLUMN browser_notifications_enabled SET NOT NULL;

-- Update existing records with default values if any NULL values exist
UPDATE tenant_settings
SET handoff_sound = 'notification.mp3' WHERE handoff_sound IS NULL;

UPDATE tenant_settings
SET ready_sound = 'notification.mp3' WHERE ready_sound IS NULL;

UPDATE tenant_settings
SET browser_notifications_enabled = true WHERE browser_notifications_enabled IS NULL;
