export type HelpTopic =
  | 'regulation'
  | 'set'
  | 'evs'
  | 'nature'
  | 'mega'
  | 'vp'
  | 'in-game'
  | 'replica'
  | 'pokepaste'
  | 'showdown'
  | 'record'
  | 'new';

export const help = $state<{ open: boolean; topic: HelpTopic | null }>({
  open: false,
  topic: null,
});

export function openHelp(topic: HelpTopic | null = null): void {
  help.topic = topic;
  help.open = true;
}

export function closeHelp(): void {
  help.open = false;
}
