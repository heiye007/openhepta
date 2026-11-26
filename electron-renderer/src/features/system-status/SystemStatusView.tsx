import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Cpu,
  HardDrive,
  FolderGit2,
  Terminal,
  Bell,
  RefreshCw,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import type {
  AppNotification,
  AppUpdateState,
  SystemDiagnosticsState,
} from '../../../../shared/types';
import { heptaClient } from '../../client';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';

export interface SystemStatusViewProps {
  cardsCount: number;
  whiteboardsCount: number;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

export function SystemStatusView({
  cardsCount,
  whiteboardsCount,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: SystemStatusViewProps) {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnosticsState | null>(null);
  const [cliStatus, setCliStatus] = useState<{ isRunning: boolean; port: number } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const loadSystemData = useCallback(async () => {
    try {
      const [diag, cli, notifs, upd] = await Promise.all([
        heptaClient.system.getDiagnostics(),
        heptaClient.system.getCliStatus(),
        heptaClient.notifications.listRecent(),
        heptaClient.update.getState(),
      ]);
      setDiagnostics(diag);
      setCliStatus(cli);
      setNotifications(notifs || []);
      setUpdateState(upd);
    } catch (err) {
      console.error('Failed to load system diagnostics:', err);
    }
  }, []);

  useEffect(() => {
    loadSystemData();
  }, [loadSystemData]);

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const next = await heptaClient.update.checkForUpdates();
      setUpdateState(next);
    } catch (err) {
      console.error('Failed to check for updates:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await heptaClient.notifications.send({
        title: 'OpenHepta',
        body: 'Desktop notifications and IPC bridge are active.',
      });
      const recent = await heptaClient.notifications.listRecent();
      setNotifications(recent || []);
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      <div
        className={`flex items-center min-h-[48px] py-2.5 pr-6 border-b border-light-grey bg-background-secondary/60 shrink-0 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-6'
        }`}
      >
        <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />
        <div className="flex-1 min-w-0">
          <div className="w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-ultra-light-grey border border-light-grey flex items-center justify-center text-successful-item">
              <Database size={14} />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text-color">
              Storage &amp; Engine Diagnostics
            </h1>
          </div>
          <button
            type="button"
            onClick={loadSystemData}
            className="h-7 px-2.5 rounded-md border border-light-grey bg-background-primary hover:bg-light-grey text-[12px] text-middle-hard-grey hover:text-text-color flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card">
              <div className="flex items-center gap-2 text-[12px] font-medium text-active-item mb-1.5">
                <Database size={14} />
                <span>Primary Database</span>
              </div>
              <div className="text-[16px] font-semibold text-text-color">main.sqlite</div>
              <div className="text-[11.5px] text-middle-grey mt-1">
                WAL mode enabled · {cardsCount} cards · {whiteboardsCount} boards
              </div>
            </div>

            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card">
              <div className="flex items-center gap-2 text-[12px] font-medium text-active-item mb-1.5">
                <Cpu size={14} />
                <span>Reader Workers</span>
              </div>
              <div className="text-[16px] font-semibold text-text-color">3 Threads</div>
              <div className="text-[11.5px] text-middle-grey mt-1">
                Concurrent non-blocking WAL queries
              </div>
            </div>

            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card">
              <div className="flex items-center gap-2 text-[12px] font-medium text-successful-item mb-1.5">
                <HardDrive size={14} />
                <span>Writer Worker</span>
              </div>
              <div className="text-[16px] font-semibold text-text-color">1 FIFO Queue</div>
              <div className="text-[11.5px] text-middle-grey mt-1">
                Serialized write transaction isolation
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-color">
                  <Activity size={14} className="text-active-item" />
                  <span>Runtime &amp; Diagnostics</span>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-ultra-light-grey text-successful-item font-medium">
                  {diagnostics?.isEnabled ? 'Active' : 'Standby'}
                </span>
              </div>
              <div className="text-[12px] text-middle-hard-grey space-y-1 tabular-nums">
                <div>
                  Platform: {diagnostics?.platform || 'unknown'} ({diagnostics?.arch || 'unknown'})
                </div>
                <div>
                  Electron: {diagnostics?.electronVersion || '-'} · Node: {diagnostics?.nodeVersion || '-'}
                </div>
                <div>Uptime: {diagnostics ? `${Math.round(diagnostics.uptime)}s` : '-'}</div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-color">
                  <Terminal size={14} className="text-active-item" />
                  <span>Local Operations Server</span>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full bg-ultra-light-grey font-medium ${
                    cliStatus?.isRunning ? 'text-successful-item' : 'text-middle-grey'
                  }`}
                >
                  {cliStatus?.isRunning ? `Port ${cliStatus.port}` : 'Offline'}
                </span>
              </div>
              <p className="text-[12px] text-middle-hard-grey leading-relaxed">
                Localhost HTTP automation &amp; CLI bridge for whiteboard layout operations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-color">
                  <CheckCircle2 size={14} className="text-successful-item" />
                  <span>Application Updates</span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={isCheckingUpdate}
                  className="px-2.5 py-1 rounded-md border border-light-grey bg-background-primary hover:bg-light-grey text-[11.5px] text-text-color transition cursor-pointer disabled:opacity-60"
                >
                  {isCheckingUpdate ? 'Checking...' : 'Check for updates'}
                </button>
              </div>
              <div className="text-[12px] text-middle-hard-grey space-y-1">
                <div>Current version: {updateState?.currentVersion || '0.1.0'}</div>
                <div>Status: {updateState?.status || 'idle'}</div>
                {updateState?.lastCheckedAt && (
                  <div className="text-[11px] text-middle-grey">
                    Last checked: {new Date(updateState.lastCheckedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-color">
                  <Bell size={14} className="text-active-item" />
                  <span>Recent Notifications ({notifications.length})</span>
                </div>
                <button
                  type="button"
                  onClick={handleSendTestNotification}
                  className="px-2.5 py-1 rounded-md border border-light-grey bg-background-primary hover:bg-light-grey text-[11.5px] text-text-color transition cursor-pointer"
                >
                  Send test
                </button>
              </div>
              {notifications.length === 0 ? (
                <div className="text-[12px] text-middle-grey">No recent notifications.</div>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {notifications.slice(0, 5).map((n) => (
                    <div
                      key={n.id}
                      className="px-2.5 py-1.5 rounded bg-background-primary border border-light-grey text-[11.5px]"
                    >
                      <div className="font-medium text-text-color">{n.title}</div>
                      <div className="text-middle-hard-grey truncate">{n.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-1.5">
            <h3 className="text-[13.5px] font-semibold text-text-color flex items-center gap-2">
              <FolderGit2 size={15} className="text-active-item" />
              <span>Local File Shadow Store (local-file-mvp.sqlite)</span>
            </h3>
            <p className="text-[12px] text-middle-hard-grey leading-relaxed">
              Decoupled physical file references with SHA-256 content addressing,{' '}
              <code className="px-1 py-0.5 rounded bg-ultra-light-grey text-[11px]">
                hepta-preview://
              </code>{' '}
              streaming protocol, and 100-token soft-delete recovery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
