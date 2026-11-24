import { readonly, writable } from 'svelte/store';
import { later } from './timers.ts';

type Notification = { message: string; expiresAt: number };

const current = writable<Notification | null>(null);
export const notification = readonly(current);
let cancelDismiss: (() => void) | undefined;

export function clearNotification(): void {
  cancelDismiss?.();
  cancelDismiss = undefined;
  current.set(null);
}

export function notify(message: string): void {
  if (!message) {
    clearNotification();
    return;
  }

  cancelDismiss?.();
  const expiresAt = Date.now() + 3000;
  cancelDismiss = later(clearNotification, 3000);
  current.set({ message, expiresAt });
}
