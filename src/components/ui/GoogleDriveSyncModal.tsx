import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { api } from '../../lib/api';
import { CloudUpload, CheckCircle2, Loader2, ExternalLink, HardDrive, Clock } from 'lucide-react';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  isOpen,
  onClose,
  onAddToast,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('mindshare_google_webhook_url') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{ totalUsers?: number; folderUrl?: string; message?: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<{ configured: boolean; midnightScheduled: boolean }>({
    configured: false,
    midnightScheduled: true,
  });

  useEffect(() => {
    if (isOpen) {
      api.getGoogleDriveStatus().then((st) => setServerStatus(st)).catch(() => {});
    }
  }, [isOpen]);

  const handleRunSync = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUrl = webhookUrl.trim();

    if (!cleanUrl && !serverStatus.configured) {
      onAddToast('Please paste your Google Apps Script Webhook URL.', 'error');
      return;
    }

    if (cleanUrl) {
      localStorage.setItem('mindshare_google_webhook_url', cleanUrl);
    }

    setIsSyncing(true);
    setLastResult(null);

    const res = await api.syncGoogleDriveBackup(cleanUrl || undefined);
    setIsSyncing(false);

    if (res.error || !res.success) {
      onAddToast(res.error || 'Sync failed. Please verify your Google Webhook URL.', 'error');
    } else {
      const folderUrl = res.data?.folderUrl;
      setLastResult({
        totalUsers: res.totalUsers,
        folderUrl,
        message: res.message || 'Synced successfully!',
      });
      onAddToast(res.message || 'Google Drive sync complete!', 'success');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Google Drive Per-User Sync">
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-blue-500/10 hairline-border border-blue-500/20 text-xs text-ink space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
            <HardDrive className="w-4 h-4 shrink-0" />
            <span>Style 2: Dedicated Sheet per User in Google Drive</span>
          </div>
          <p className="text-ink-muted leading-relaxed">
            Every team member gets their own individual Google Sheet file named <strong className="font-mono text-ink">Mindshare_@username</strong> inside your Drive folder (<code className="font-mono bg-canvas px-1 rounded">Mindshare User Backups</code>).
          </p>
          <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Processes all existing clients now, and auto-spawns files for new users when they join!</span>
          </div>
        </div>

        {/* Midnight Scheduler Badge */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-canvas hairline-border text-xs">
          <span className="flex items-center gap-1.5 font-medium text-ink-muted">
            <Clock className="w-3.5 h-3.5 text-primary" /> Midnight Auto-Sync:
          </span>
          <span className="px-2 py-0.5 rounded-full bg-primary-light/60 text-primary font-bold text-[10px]">
            ACTIVE (Runs daily at 00:00)
          </span>
        </div>

        {/* Webhook Form */}
        <form onSubmit={handleRunSync} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-ink-subtle uppercase tracking-wider mb-1">
              Google Apps Script Webhook URL:
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3 py-2 text-xs rounded-xl bg-canvas text-ink hairline-border placeholder:text-ink-subtle focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-[10px] text-ink-subtle mt-1">
              Need the Google Script? Find it in your workspace at <strong className="font-mono">database/google_apps_script_style2.js</strong>.
            </p>
          </div>

          {lastResult && (
            <div className="p-3 rounded-xl bg-status-success/10 hairline-border border-status-success/20 text-xs space-y-1">
              <div className="flex items-center gap-1 font-semibold text-status-success">
                <CheckCircle2 className="w-4 h-4" /> {lastResult.message}
              </div>
              {lastResult.folderUrl && (
                <a
                  href={lastResult.folderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline font-medium mt-1"
                >
                  <span>Open Google Drive Backup Folder</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSyncing}
              className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-xl shadow-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Syncing Users to Drive...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>Run Full Sync Now</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
