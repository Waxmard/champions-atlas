import { dur, pageUnder } from './motion.ts';

const EDGE = 32;
const SLOP = 10;
const BACK = 64;
const DISMISS = 96;
const SETTLE = 200;
const HOLD = 300;

type Kind = 'left' | 'right' | 'down';
type Start = {
  x: number;
  y: number;
  target: Element;
  dialog: HTMLDialogElement | null;
  top: boolean;
};
type Gesture = {
  node: HTMLElement;
  kind: Kind;
  limit: number;
  exit: 'none' | 'hold' | 'slide';
  commit: () => void;
};

let start: Start | null = null;
let gesture: Gesture | null = null;
let offset = 0;
let motion: Animation | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let moved: HTMLElement | null = null;
let under: HTMLElement | null = null;

export function swipeKind(dx: number, dy: number): Kind | 'up' | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SLOP) return null;
  if (ax > ay) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
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

const shift = (kind: Kind, value: number) =>
  kind === 'down' ? `0 ${value}px` : `${kind === 'left' ? -value : value}px`;

function place({ node, kind, limit }: Gesture, value: number) {
  node.style.translate = shift(kind, value);
  node.dataset.swipe = kind;
  node.toggleAttribute('data-swipe-armed', value >= limit);
}

function find(kind: Kind, { x, target, dialog, top }: Start): Gesture | null {
  if (dialog)
    return kind === 'down' && top
      ? {
          node: dialog,
          kind,
          limit: DISMISS,
          exit: 'hold',
          commit: () =>
            dialog.dispatchEvent(new Event('cancel', { cancelable: true })),
        }
      : null;
  if (kind === 'down') return null;
  const row = target.closest<HTMLElement>('[data-swipe-row]');
  const action = row?.querySelector<HTMLElement>(
    `[data-swipe-${kind}]:enabled`
  );
  if (row && action)
    return {
      node: row,
      kind,
      limit: row.offsetWidth / 2,
      exit: 'none',
      commit: () => action.click(),
    };
  const link =
    kind === 'right' && x <= EDGE
      ? document.querySelector<HTMLAnchorElement>('a[data-swipe-back]')
      : null;
  const main = document.getElementById('main');
  if (!link || !main) return null;
  return {
    node: main,
    kind,
    limit: BACK,
    exit: 'slide',
    commit: () => link.click(),
  };
}

export function swipeReset() {
  clearTimeout(timer);
  motion?.cancel();
  motion = null;
  if (moved) delete moved.dataset.swipe;
  moved = null;
  under?.remove();
  under = null;
  document.documentElement.style.overflowX = '';
}

function settle(commit: boolean) {
  const current = gesture;
  const from = offset;
  start = null;
  gesture = null;
  offset = 0;
  if (!current) return;
  const { node, kind, exit } = current;
  const done = commit && from >= current.limit;
  const slide = done && exit === 'slide';
  const hold = done && exit === 'hold';
  if (done && !slide) current.commit();
  node.style.translate = '';
  node.removeAttribute('data-swipe-armed');
  const run = node.animate(
    {
      translate: [
        shift(kind, from),
        shift(kind, slide ? window.innerWidth : hold ? from : 0),
      ],
    },
    {
      duration: hold ? HOLD : dur(SETTLE),
      easing: 'ease-out',
      fill: slide ? 'forwards' : 'none',
    }
  );
  motion = run;
  run.onfinish = () => {
    if (motion !== run) return;
    if (!slide) return swipeReset();
    current.commit();
    timer = setTimeout(swipeReset, HOLD);
  };
}

function onStart(event: TouchEvent) {
  settle(false);
  const touch = event.touches.length === 1 ? event.touches[0] : undefined;
  const target = event.target;
  if (!touch || !(target instanceof Element)) return;
  const dialog = target.closest('dialog');
  start = {
    x: touch.clientX,
    y: touch.clientY,
    target,
    dialog,
    top:
      !!dialog &&
      !target.closest('input, textarea, select') &&
      atTop(target, dialog),
  };
}

function onMove(event: TouchEvent) {
  const touch = event.touches[0];
  if (!start || !touch) return;
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (!gesture) {
    const kind = swipeKind(dx, dy);
    if (!kind) return;
    const next = kind === 'up' ? null : find(kind, start);
    if (!next) {
      start = null;
      return;
    }
    swipeReset();
    gesture = next;
    moved = next.node;
    if (next.exit === 'slide') {
      document.documentElement.style.overflowX = 'hidden';
      under = pageUnder();
      if (under) document.body.append(under);
    }
  }
  const { kind } = gesture;
  offset = Math.max(0, kind === 'down' ? dy : kind === 'left' ? -dx : dx);
  place(gesture, offset);
}

function onEnd(event: TouchEvent) {
  settle(event.type === 'touchend' && !event.touches.length);
}

export function swipe(node: Document) {
  const passive = { passive: true };
  node.addEventListener('touchstart', onStart, passive);
  node.addEventListener('touchmove', onMove, passive);
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onEnd);
}
