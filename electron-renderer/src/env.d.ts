import type { HeptaElectronApi } from '@shared/api';

declare global {
  interface Window {
    heptaElectronApi: HeptaElectronApi;
  }
}

export {};
