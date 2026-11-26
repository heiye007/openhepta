import { app } from 'electron';
import { AppUpdateState } from '../../shared/types';

let updateState: AppUpdateState = {
  currentVersion: '0.1.0',
  latestVersion: '0.1.0',
  status: 'idle',
  lastCheckedAt: null,
  errorMessage: null,
};

function resolveCurrentVersion(): string {
  try {
    return app.getVersion() || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

export function getUpdateState(): AppUpdateState {
  const ver = resolveCurrentVersion();
  updateState = {
    ...updateState,
    currentVersion: ver,
    latestVersion: updateState.latestVersion || ver,
  };
  return { ...updateState };
}

export async function checkForAppUpdates(): Promise<AppUpdateState> {
  const ver = resolveCurrentVersion();
  updateState = {
    currentVersion: ver,
    latestVersion: ver,
    status: 'up-to-date',
    lastCheckedAt: Date.now(),
    errorMessage: null,
  };
  return { ...updateState };
}
