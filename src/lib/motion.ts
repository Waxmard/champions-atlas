import type { NavigationTarget, OnNavigate } from '$app/navigation';
import type { TransitionConfig } from 'svelte/transition';

type Place = Pick<NavigationTarget, 'route' | 'url'>;
export type NavKind = 'tab' | 'push' | 'pop';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const dur = (ms: number) => (reduced() ? 0 : ms);

export function dialogOut(node: Element): TransitionConfig {
  return {
    duration: dur(150),
    tick: (t) => node.toggleAttribute('data-closing', t < 1),
  };
}

const tab = ({ route }: Place) =>
  route.id === '/teams/[id]'
    ? '/'
    : route.id === '/my-teams/new'
      ? '/my-teams'
      : route.id;

const depth = ({ route, url }: Place) =>
  route.id === '/teams/[id]' ||
  route.id === '/my-teams/new' ||
  ((route.id === '/wishlist' || route.id === '/saved') &&
    url.searchParams.has('team'))
    ? 1
    : 0;

export function navKind(from: Place, to: Place): NavKind | null {
  if (tab(from) !== tab(to)) return 'tab';
  const change = depth(to) - depth(from);
  return change > 0 ? 'push' : change < 0 ? 'pop' : null;
}

let active: ViewTransition | undefined;

let under: HTMLElement | null = null;

export const pageUnder = () => under;

function keep(kind: NavKind) {
  under = null;
  const main = kind === 'push' ? document.getElementById('main') : null;
  if (!main) return;
  const { left, top, width } = main.getBoundingClientRect();
  const copy = main.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.inert = true;
  Object.assign(copy.style, {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    margin: '0',
  });
  copy.querySelectorAll('img').forEach((image) => {
    image.loading = 'eager';
  });
  under = document.createElement('div');
  under.dataset.swipeUnder = '';
  under.ariaHidden = 'true';
  under.append(copy);
}

export function pageTransition({
  from,
  to,
  complete,
}: OnNavigate): Promise<void> | undefined {
  if (!from || !to) return;
  const kind = navKind(from, to);
  if (!kind) return;
  const swiped = !!under?.isConnected;
  keep(kind);
  if (swiped || reduced() || !('startViewTransition' in document)) return;
  const root = document.documentElement;
  const { promise, resolve } = Promise.withResolvers<void>();
  root.dataset.nav = kind;
  const transition = document.startViewTransition(async () => {
    resolve();
    await complete;
  });
  active = transition;
  void transition.finished.finally(() => {
    if (active === transition) delete root.dataset.nav;
  });
  return promise;
}
