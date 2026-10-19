<script lang="ts">
  import EvEditor from '#lib/components/EvEditor.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { buildBenchmarkIndex, type BenchmarkIndex } from '#lib/benchmarks.js';
  import { normalize, type Member, type Team } from '#lib/catalog.js';
  import {
    catalogSpreadSuggestions,
    originalSpreadSuggestion,
    type CatalogSuggestion,
    type SpreadSuggestion,
  } from '#lib/workbench.js';
  import type { CurrentSetChoice } from '#lib/current-sets.js';

  let {
    member,
    teams,
    currentRegulation,
    natureSuggestions,
    originalMember,
    inGameMember,
    onspreadchange,
    onnaturechange,
    oningame,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    natureSuggestions: CatalogSuggestion[];
    originalMember?: Member;
    inGameMember?: Member;
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
    oningame: (choice: CurrentSetChoice, displayed: Member) => void;
  } = $props();
  let evEditor: { flush: () => void } | undefined;
  export function flush(): void {
    evEditor?.flush();
  }

  let cachedTeams: Team[] | undefined;
  let cachedRegulation = '';
  let cachedIndex: BenchmarkIndex | undefined;
  const index = $derived.by(() => {
    if (
      !cachedIndex ||
      cachedTeams !== teams ||
      cachedRegulation !== currentRegulation
    ) {
      cachedTeams = teams;
      cachedRegulation = currentRegulation;
      cachedIndex = buildBenchmarkIndex(teams, currentRegulation);
    }
    return cachedIndex;
  });
  const regulationTeams = $derived(
    teams.filter((team) => team.regulation === currentRegulation)
  );
  const spreadKey = (nature: string, spread: string) =>
    `${normalize(nature)}|${normalize(spread)}`;

  const spreadSuggestions = $derived.by(() => {
    const preferredNature = originalMember?.nature ?? null;
    const seen = new SvelteSet<string>();
    const rows: SpreadSuggestion[] = [];
    const original =
      originalMember && originalSpreadSuggestion(member, originalMember);
    if (original) {
      const key = spreadKey(original.nature, original.spread);
      rows.push(original);
      seen.add(key);
    }
    const inGame =
      inGameMember && originalSpreadSuggestion(member, inGameMember);
    if (inGame) {
      const key = spreadKey(inGame.nature, inGame.spread);
      const existing = rows.find(
        (row) => spreadKey(row.nature, row.spread) === key
      );
      if (existing) {
        existing.inGame = true;
        existing.source = 'Original team · My in-game set';
      } else {
        rows.push({
          ...inGame,
          source: 'My in-game set',
          original: undefined,
          inGame: true,
        });
        seen.add(key);
      }
    }
    for (const option of catalogSpreadSuggestions(
      member,
      teams,
      currentRegulation,
      4,
      preferredNature
    )) {
      const key = spreadKey(option.nature, option.spread);
      const source =
        `${option.totalCount} catalog team${option.totalCount === 1 ? '' : 's'}` +
        (option.currentCount
          ? ` · ${option.currentCount} in ${currentRegulation}`
          : '');
      if (seen.has(key)) {
        const existing = rows.find(
          (row) => spreadKey(row.nature, row.spread) === key
        );
        if (existing?.inGame) existing.source += ` · ${source}`;
        continue;
      }
      seen.add(key);
      rows.push({
        spread: option.spread,
        nature: option.nature,
        source,
        deltas: option.deltas,
        movedPoints: option.movedPoints,
        speed: option.speed,
      });
    }
    const selected = rows.slice(0, 6);
    const preferred = rows.find(
      (row) => normalize(row.nature) === normalize(preferredNature ?? '')
    );
    if (preferred && !selected.includes(preferred)) selected[5] = preferred;
    return selected;
  });
</script>

<EvEditor
  bind:this={evEditor}
  {member}
  spread={member.spread || ''}
  nature={member.nature || ''}
  {index}
  {spreadSuggestions}
  {currentRegulation}
  teams={regulationTeams}
  {natureSuggestions}
  {inGameMember}
  {onspreadchange}
  {onnaturechange}
  {oningame}
/>
