const EDGE = 32;

let start: {
  x: number;
  y: number;
  dialog: HTMLDialogElement | null;
  dismissable: boolean;
} | null = null;

export function swipeDirection(
  dx: number,
  dy: number
): 'right' | 'down' | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (dx >= 64 && ax >= 2 * ay) return 'right';
  if (dy >= 96 && ay >= 2 * ax) return 'down';
  return null;
}

function atTop(target: Element, dialog: Element): boolean {
  for (
    let node: Element | null = target;
    node && node !== dialog;
    node = node.parentElement
  )
    if (node.scrollTop > 0) return false;
  return true;
}

export function swipeStart(event: TouchEvent) {
  const touch = event.touches.length === 1 ? event.touches[0] : undefined;
  const target = event.target;
  if (!touch || !(target instanceof Element)) {
    start = null;
    return;
  }
  const dialog = target.closest('dialog');
  start = {
    x: touch.clientX,
    y: touch.clientY,
    dialog,
    dismissable:
      !!dialog &&
      !target.closest('input, textarea, select') &&
      atTop(target, dialog),
  };
}

export function swipeEnd(event: TouchEvent) {
  const origin = start;
  const touch = event.changedTouches[0];
  start = null;
  if (!origin || !touch || event.touches.length) return;
  const direction = swipeDirection(
    touch.clientX - origin.x,
    touch.clientY - origin.y
  );
  if (origin.dialog) {
    if (direction === 'down' && origin.dismissable)
      origin.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  } else if (direction === 'right' && origin.x <= EDGE)
    document.querySelector<HTMLAnchorElement>('a[data-swipe-back]')?.click();
}

export function swipeRemove(node: HTMLElement, onremove: () => void) {
  let origin: { x: number; y: number } | null = null;
  let offset = 0;
  function slide(value: number) {
    offset = value;
    node.style.transition = value ? 'none' : '';
    node.style.translate = value ? `${value}px` : '';
  }
  node.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      origin = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    { passive: true }
  );
  node.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      if (!origin || !touch) return;
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (!offset && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (!offset && (dx > 0 || Math.abs(dy) > Math.abs(dx))) origin = null;
      else slide(Math.min(0, dx));
    },
    { passive: true }
  );
  node.addEventListener('touchend', () => {
    const remove = offset <= -node.offsetWidth / 2 && offset < 0;
    origin = null;
    if (remove) onremove();
    slide(0);
  });
  node.addEventListener('touchcancel', () => {
    origin = null;
    slide(0);
  });
}
