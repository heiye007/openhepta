import { Notification } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { AppNotification } from '../../shared/types';

const recentNotifications: AppNotification[] = [];
const MAX_RECENT = 50;

export function sendAppNotification(input: { title: string; body: string }): AppNotification {
  const item: AppNotification = {
    id: uuidv4(),
    title: input.title,
    body: input.body,
    createdAt: Date.now(),
  };

  recentNotifications.unshift(item);
  if (recentNotifications.length > MAX_RECENT) {
    recentNotifications.length = MAX_RECENT;
  }

  try {
    if (Notification.isSupported()) {
      const nativeNotif = new Notification({
        title: item.title,
        body: item.body,
      });
      nativeNotif.show();
    }
  } catch (err) {
    console.warn('[OpenHepta] Notification show warning:', err);
  }

  return item;
}

export function listRecentNotifications(): AppNotification[] {
  return [...recentNotifications];
}
