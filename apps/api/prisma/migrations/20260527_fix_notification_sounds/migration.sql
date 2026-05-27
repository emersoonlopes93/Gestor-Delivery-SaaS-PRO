-- Update existing TenantSettings with default sound values if they're set to "default"
UPDATE tenant_settings
SET 
  new_order_sound = 'notification.mp3' WHERE new_order_sound = 'default' OR new_order_sound IS NULL,
  cancellation_sound = 'notification.mp3' WHERE cancellation_sound = 'default' OR cancellation_sound IS NULL;

-- Ensure all new records have correct defaults for audio notifications
UPDATE tenant_settings
SET 
  audio_notification_enabled = true WHERE audio_notification_enabled IS NULL,
  notification_volume = 1.0 WHERE notification_volume IS NULL;
