import { storage } from "./storage";
import { performBackup } from "./github-backup";
import { performTelegramDbBackup } from "./telegram-db-backup";

let backupInterval: NodeJS.Timeout | null = null;
let telegramBackupInterval: NodeJS.Timeout | null = null;

export async function initializeAutoBackup() {
  try {
    const settings = await storage.getSettings();
    
    if (!settings?.autoBackupEnabled || !settings?.githubToken || !settings?.githubRepo) {
      console.log('[Backup] Auto backup disabled or not configured');
    } else {
      // Clear existing interval
      if (backupInterval) {
        clearInterval(backupInterval);
      }

      // Run GitHub backup every 24 hours
      backupInterval = setInterval(async () => {
        try {
          console.log('[Backup Scheduler] Running automatic GitHub backup...');
          const config = {
            token: settings.githubToken!,
            repo: settings.githubRepo!,
            branch: settings.githubBranch || 'main'
          };
          await performBackup(config, 'auto');
        } catch (error: any) {
          console.error('[Backup Scheduler] Auto GitHub backup failed:', error.message);
        }
      }, 24 * 60 * 60 * 1000);

      console.log('[Backup Scheduler] Auto GitHub backup initialized (every 24 hours)');
    }

    // Initialize Telegram DB backup if configured
    if (settings?.telegramAutoDbBackupEnabled && settings?.telegramBackupChannelId && settings?.botToken) {
      await initializeTelegramBackup();
    }
  } catch (error) {
    console.error('[Backup Scheduler] Error initializing auto backup:', error);
  }
}

export async function initializeTelegramBackup() {
  try {
    if (telegramBackupInterval) {
      clearInterval(telegramBackupInterval);
    }

    // Run Telegram DB backup every 24 hours
    telegramBackupInterval = setInterval(async () => {
      try {
        console.log('[TG Backup Scheduler] Running daily Telegram DB backup...');
        const result = await performTelegramDbBackup();
        if (result.success) {
          console.log('[TG Backup Scheduler] ✓ Daily backup sent:', result.message);
        } else {
          console.error('[TG Backup Scheduler] Daily backup failed:', result.message);
        }
      } catch (error: any) {
        console.error('[TG Backup Scheduler] Unexpected error:', error.message);
      }
    }, 24 * 60 * 60 * 1000);

    console.log('[TG Backup Scheduler] Telegram DB backup initialized (every 24 hours)');
  } catch (error) {
    console.error('[TG Backup Scheduler] Error initializing Telegram backup:', error);
  }
}

export function stopAutoBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    console.log('[Backup Scheduler] GitHub auto backup stopped');
  }
  if (telegramBackupInterval) {
    clearInterval(telegramBackupInterval);
    telegramBackupInterval = null;
    console.log('[TG Backup Scheduler] Telegram auto backup stopped');
  }
}
