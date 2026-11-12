import type { NavigationTarget, OnNavigate } from '$app/navigation';
import type { TransitionConfig } from 'svelte/transition';

type Place = Pick<NavigationTarget, 'params' | 'route' | 'url'>;
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
  ((route.id === '/wishlist' || route.id === '/favorites') &&
    url.searchParams.has('team'))
    ? 1
    : 0;

export function navKind(from: Place, to: Place): NavKind | null {
  if (tab(from) !== tab(to)) return 'tab';
  const change = depth(to) - depth(from);
  return change > 0 ? 'push' : change < 0 ? 'pop' : null;
}

export function morphTeam({ params, route, url }: Place): string | null {
  if (route.id === '/teams/[id]') return params?.id ?? null;
  if (route.id === '/wishlist' || route.id === '/favorites')
    return url.searchParams.get('team');
  return null;
}

let active: ViewTransition | undefined;

function markCard(id: string | null) {
  document
    .querySelectorAll<HTMLElement>('[data-team-card]')
    .forEach((card) =>
      card.toggleAttribute('data-morph', card.dataset.teamCard === id)
    );
}

export function pageTransition({
  from,
  to,
  complete,
}: OnNavigate): Promise<void> | undefined {
  if (!from || !to || reduced() || !('startViewTransition' in document)) return;
  const kind = navKind(from, to);
  if (!kind) return;
  const team =
    kind === 'push' ? morphTeam(to) : kind === 'pop' ? morphTeam(from) : null;
  const root = document.documentElement;
  const { promise, resolve } = Promise.withResolvers<void>();
  root.dataset.nav = team ? 'morph' : kind;
  markCard(kind === 'push' ? team : null);
  const transition = document.startViewTransition(async () => {
    resolve();
    await complete;
    if (!team) return;
    await new Promise((done) => setTimeout(done));
    markCard(kind === 'pop' ? team : null);
  });
  active = transition;
  void transition.finished.finally(() => {
    if (active !== transition) return;
    markCard(null);
    delete root.dataset.nav;
  });
  return promise;
}
