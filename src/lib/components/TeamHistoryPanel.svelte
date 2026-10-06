<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import {
    evidence,
    evidenceGrade,
    isPasteUrl,
    normalize,
    regulationLabel,
  } from '$lib/catalog';
  import { canonicalSnapshot, differences } from '$lib/team-history';
  import { isMegaSpecies, MAX_TEAM_MEGAS } from '$lib/workbench';
  import type { SavedTeam } from '$lib/workbench';

  interface Props {
    team: SavedTeam;
    currentRegulation: string;
    disabled: boolean;
    onrestore: () => void;
    onrestoreslot: (index: number) => void;
  }

  type ComparisonRow = {
    pokemon: string;
    field: string;
    before: string;
    after: string;
  };
  type ComparisonGroup = {
    pokemon: string;
    rows: ComparisonRow[];
    slot: number | null;
  };

  let { team, currentRegulation, disabled, onrestore, onrestoreslot }: Props =
    $props();
  const identical = $derived(
    canonicalSnapshot({
      name: team.original.name,
      members: team.original.members,
    }) === canonicalSnapshot({ name: team.name, members: team.members })
  );
  const rows = $derived(differences(team.original.members, team.members));
  const swapped = (index: number) =>
    normalize(team.members[index]?.pokemon ?? '') !==
    normalize(team.original.members[index].pokemon);
  const groups = $derived.by<ComparisonGroup[]>(() => {
    const grouped: ComparisonGroup[] = [];
    for (const row of rows) {
      const group = grouped.find(({ pokemon }) => pokemon === row.pokemon);
      if (group) group.rows.push(row);
      else grouped.push({ pokemon: row.pokemon, rows: [row], slot: null });
    }
    return team.original.members.flatMap((member, index) => {
      const group = grouped.find(({ pokemon }) => pokemon === member.pokemon);
      return group || swapped(index)
        ? [{ pokemon: member.pokemon, rows: group?.rows ?? [], slot: index }]
        : [];
    });
  });
  const missingMetadata = $derived(
    team.origin !== 'custom' &&
      [
        'sheetIds',
        'creator',
        'publishedAt',
        'replicaCode',
        'replicaStatus',
        'reports',
        'pasteNotes',
      ].some((key) => team.original[key] === undefined)
  );
  function safeUrl(value: string): boolean {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  function slotReason(index: number): string {
    const original = team.original.members[index];
    if (canonicalSnapshot(original) === canonicalSnapshot(team.members[index]))
      return 'This slot already matches the original set.';
    const others = team.members.filter((_, slot) => slot !== index);
    if (
      others.some(
        ({ pokemon }) => normalize(pokemon) === normalize(original.pokemon)
      )
    )
      return `${original.pokemon} is already in another slot. Restore the original team to recover its roster order.`;
    if (
      isMegaSpecies(original.pokemon) &&
      others.filter(({ pokemon }) => isMegaSpecies(pokemon)).length >=
        MAX_TEAM_MEGAS
    )
      return 'Restoring this set would exceed the two-Mega limit. Restore the original team instead.';
    return '';
  }
</script>

<details
  class="mt-5 min-w-0 border-t border-base-300 pt-3"
  aria-label="Original & history"
>
  <summary class="min-h-11 cursor-pointer py-2 text-lg font-extrabold"
    >Original & history</summary
  >
  <div class="mt-3 space-y-5">
    <div class="flex flex-wrap items-end gap-3">
      <Button
        variant="outline"
        class="min-h-11"
        disabled={disabled || identical}
        onclick={() => onrestore()}>Restore original</Button
      >
    </div>
    <div class="provenance space-y-1">
      <p>Each line reads the original → your team.</p>
    </div>

    {#if identical}
      <p class="value">No changes from the original team.</p>
    {:else}
      <section aria-label="Version comparison" class="divide-y divide-base-300">
        {#each groups as group (group.pokemon)}
          <div class="py-3" data-original-slot={group.slot ?? undefined}>
            <p class="font-bold wrap-break-word">{group.pokemon}</p>
            <ul class="mt-1 space-y-1">
              {#each group.rows as row (row.field)}
                <li class="wrap-anywhere">
                  {row.field}: {row.before} → {row.after}
                </li>
              {/each}
            </ul>
            {#if group.slot !== null}
              {@const slot = group.slot}
              {@const reason = slotReason(slot)}
              <Button
                variant="outline"
                class="mt-2 min-h-11"
                disabled={disabled || !!reason}
                aria-describedby={reason
                  ? `original-slot-reason-${team.id}-${slot}`
                  : undefined}
                onclick={() => onrestoreslot(slot)}>Restore original set</Button
              >
              {#if reason}<p
                  id={`original-slot-reason-${team.id}-${slot}`}
                  class="provenance mt-2 wrap-anywhere"
                >
                  {reason}
                </p>{/if}
            {/if}
          </div>
        {/each}
        {#if !rows.length}<p class="provenance py-3">
            These versions differ, but no field values changed.
          </p>{/if}
      </section>
    {/if}

    <section
      aria-label="Original provenance"
      class="space-y-3 border-t border-base-300 pt-4"
    >
      <h2 class="text-xl font-extrabold">
        {team.origin === 'custom'
          ? 'Starting team details'
          : "Original team's results & sources"}
      </h2>
      <dl class="grid gap-3 sm:grid-cols-2">
        <div class="min-w-0">
          <dt class="term">
            {team.origin === 'custom' ? 'Starting name' : 'Original name'}
          </dt>
          <dd class="wrap-anywhere">{team.original.name}</dd>
        </div>
        <div>
          <dt class="term">Regulation</dt>
          <dd>{regulationLabel(team.original.regulation)}</dd>
        </div>
        {#if team.original.creator}<div class="min-w-0">
            <dt class="term">Creator</dt>
            <dd class="wrap-anywhere">{team.original.creator}</dd>
          </div>{/if}
        {#if team.original.publishedAt}<div>
            <dt class="term">Published</dt>
            <dd>{team.original.publishedAt}</dd>
          </div>{/if}
      </dl>
      {#if missingMetadata}<p class="provenance">
          Some original metadata was not retained when this team was saved.
        </p>{/if}
      {#if team.original.pasteUrl}
        {#if isPasteUrl(team.original.pasteUrl)}<a
            class="inline-flex min-h-11 link items-center wrap-anywhere"
            href={team.original.pasteUrl}
            rel="external noreferrer"
            target="_blank">Open original paste</a
          >{:else}<p class="provenance wrap-anywhere">
            Original paste: {team.original.pasteUrl}
          </p>{/if}
      {/if}
      {#if team.original.sheetIds?.length}<p class="provenance wrap-anywhere">
          Source sheet IDs: {team.original.sheetIds.join(', ')}
        </p>{/if}
      {#if team.original.replicaCode || team.original.replicaStatus}
        <div>
          <h3 class="font-bold">Original replica code</h3>
          {#if team.original.replicaCode}<code
              class="font-mono text-sm wrap-anywhere select-all"
              >{team.original.replicaCode}</code
            >{/if}{#if team.original.replicaStatus}<p class="provenance">
              Source status: {team.original.replicaStatus}
            </p>{/if}
          <p class="provenance">
            This code belongs to the original team, not your edited team.
            Availability may change.
          </p>
        </div>
      {/if}
      {#if team.original.reports?.length}
        <ul class="divide-y divide-base-300">
          {#each team.original.reports as report, index (index)}
            {@const result = evidence(
              report,
              team.original.regulation,
              currentRegulation
            )}
            <li class="space-y-1 py-3 wrap-anywhere">
              <p class="font-bold">{report.event || 'Event not listed'}</p>
              <p>
                <span class="stamp" data-grade={evidenceGrade(result.level)}
                  >{result.label}</span
                > <span class="provenance">{result.platform}</span>
              </p>
              {#if report.sourceUrl}{#if safeUrl(report.sourceUrl)}<a
                    class="inline-flex min-h-11 link items-center"
                    href={report.sourceUrl}
                    target="_blank"
                    rel="external noreferrer">Original source {index + 1}</a
                  >{:else}<p class="provenance">{report.sourceUrl}</p>{/if}{/if}
            </li>
          {/each}
        </ul>
      {:else if team.origin !== 'custom'}<p class="provenance">
          No original results were retained.
        </p>{/if}
      {#if team.original.pasteNotes}<p
          class="provenance wrap-anywhere whitespace-pre-wrap"
        >
          {team.original.pasteNotes}
        </p>{/if}
      {#if team.original.pasteError}<p class="provenance wrap-anywhere">
          Some original published details could not be loaded. {team.original
            .pasteError}
        </p>{/if}
    </section>
  </div>
</details>

<style>
  summary:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  h2,
  h3 {
    overflow-wrap: anywhere;
  }
</style>
