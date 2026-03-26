import { storage } from "./storage";
import { performBackup } from "./github-backup";

let backupInterval: NodeJS.Timeout | null = null;

export async function initializeAutoBackup() {
  try {
    const settings = await storage.getSettings();
    
    if (!settings?.autoBackupEnabled || !settings?.githubToken || !settings?.githubRepo) {
      console.log('[Backup] Auto backup disabled or not configured');
      return;
    }

    // Clear existing interval
    if (backupInterval) {
      clearInterval(backupInterval);
    }

    // Run backup every 24 hours
    backupInterval = setInterval(async () => {
      try {
        console.log('[Backup Scheduler] Running automatic backup...');
        const config = {
          token: settings.githubToken!,
          repo: settings.githubRepo!,
          branch: settings.githubBranch || 'main'
        };
        await performBackup(config, 'auto');
      } catch (error: any) {
        console.error('[Backup Scheduler] Auto backup failed:', error.message);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    console.log('[Backup Scheduler] Auto backup initialized (every 24 hours)');
  } catch (error) {
    console.error('[Backup Scheduler] Error initializing auto backup:', error);
  }
}

export function stopAutoBackup() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    console.log('[Backup Scheduler] Auto backup stopped');
  }
}
