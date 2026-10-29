import { readonly, writable } from 'svelte/store';

type Notification = { message: string; expiresAt: number };

const current = writable<Notification | null>(null);
export const notification = readonly(current);
let timer: ReturnType<typeof setTimeout> | undefined;

export function clearNotification(): void {
  clearTimeout(timer);
  timer = undefined;
  current.set(null);
}

export function notify(message: string): void {
  if (!message) {
    clearNotification();
    return;
  }

  clearTimeout(timer);
  const expiresAt = Date.now() + 3000;
  timer = setTimeout(clearNotification, 3000);
  current.set({ message, expiresAt });
}
