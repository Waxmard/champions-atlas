<script lang="ts">
  import MemberCard from '$lib/components/MemberCard.svelte';
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
    onrestore: (revisionId: string | 'original') => void;
    onrestoreslot: (index: number) => void;
  }

  let { team, currentRegulation, disabled, onrestore, onrestoreslot }: Props =
    $props();
  let selection = $state('original');
  let selectionTeamId = $state('');
  $effect(() => {
    if (
      selectionTeamId !== team.id ||
      (selection !== 'original' &&
        !team.history.some(({ id }) => id === selection))
    ) {
      selection = 'original';
      selectionTeamId = team.id;
    }
  });
  const revisionId = $derived(
    selectionTeamId === team.id &&
      team.history.some(({ id }) => id === selection)
      ? selection
      : 'original'
  );
  const selected = $derived(
    team.history.find(({ id }) => id === revisionId) ?? team.original
  );
  const identical = $derived(
    canonicalSnapshot({ name: selected.name, members: selected.members }) ===
      canonicalSnapshot({ name: team.name, members: team.members })
  );
  const rows = $derived.by(() => {
    const result = differences(selected.members, team.members);
    if (selected.name !== team.name)
      result.unshift({
        pokemon: '',
        field: 'Team name',
        before: selected.name,
        after: team.name,
      });
    if (
      canonicalSnapshot(selected.members.map(({ pokemon }) => pokemon)) !==
      canonicalSnapshot(team.members.map(({ pokemon }) => pokemon))
    )
      result.unshift({
        pokemon: '',
        field: 'Roster order',
        before: selected.members.map(({ pokemon }) => pokemon).join(', '),
        after: team.members.map(({ pokemon }) => pokemon).join(', '),
      });
    return result;
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
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));

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
      <label class="term min-w-0 flex-1"
        >Compare with
        <select
          class="select mt-1.5 min-h-11 w-full bg-base-100 text-base-content"
          aria-label="Compare with"
          name="history-version"
          value={revisionId}
          onchange={(event) => {
            selection = event.currentTarget.value;
            selectionTeamId = team.id;
          }}
        >
          <option value="original">Original team</option>
          {#each team.history.toReversed() as revision (revision.id)}
            <option value={revision.id}
              >Before: {revision.label} — {timestamp(revision.savedAt)}</option
            >
          {/each}
        </select>
      </label>
      <Button
        variant="outline"
        class="min-h-11"
        disabled={disabled || identical}
        onclick={() => onrestore(revisionId)}
        >{revisionId === 'original'
          ? 'Restore original'
          : 'Restore this version'}</Button
      >
    </div>
    <div class="provenance space-y-1">
      <p>Restore points show the team before each editing session.</p>
      <p>Original plus the latest 20 restore points are kept.</p>
      {#if !team.history.length}<p>No earlier edits yet.</p>{/if}
    </div>

    {#if identical}
      <p class="value">No changes from this version.</p>
    {:else}
      <section aria-label="Version comparison" class="divide-y divide-base-300">
        {#each rows as row, index (index)}
          {#if row.field === 'Full set'}
            <details class="py-3">
              <summary class="min-h-11 cursor-pointer py-2 font-bold"
                >{row.pokemon}: Full set</summary
              >
              <div class="grid min-w-0 gap-3 sm:grid-cols-2">
                <label class="term min-w-0"
                  >Selected version<textarea
                    readonly
                    aria-label="Selected version"
                    class="textarea mt-1.5 min-h-48 w-full font-mono text-xs"
                    value={row.before}></textarea></label
                >
                <label class="term min-w-0"
                  >Your team<textarea
                    readonly
                    aria-label="Your team"
                    class="textarea mt-1.5 min-h-48 w-full font-mono text-xs"
                    value={row.after}></textarea></label
                >
              </div>
            </details>
          {:else}
            <div class="py-3">
              <p class="font-bold wrap-break-word">
                {row.pokemon ? `${row.pokemon}: ` : ''}{row.field}
              </p>
              <dl class="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
                <div class="min-w-0">
                  <dt class="term">Selected version</dt>
                  <dd class="mt-1 wrap-anywhere">{row.before}</dd>
                </div>
                <div class="min-w-0">
                  <dt class="term">Your team</dt>
                  <dd class="mt-1 wrap-anywhere">{row.after}</dd>
                </div>
              </dl>
            </div>
          {/if}
        {/each}
        {#if !rows.length}<p class="provenance py-3">
            The saved set text or member metadata differs from this version.
          </p>{/if}
      </section>
    {/if}

    <section aria-label="Selected version sets">
      <h2 class="text-xl font-extrabold wrap-break-word">
        {revisionId === 'original'
          ? team.origin === 'custom'
            ? 'Starting team'
            : 'Original team'
          : 'Selected version'}: {selected.name}
      </h2>
      <div class="mt-3 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each selected.members as member, index (index)}
          <div class="plate min-w-0 overflow-hidden" data-original-slot={index}>
            <MemberCard {member} slot={index + 1} editable={false} />
            {#if revisionId === 'original'}
              {@const reason = slotReason(index)}
              <div class="border-t border-base-300 px-4 py-3">
                <Button
                  variant="outline"
                  class="min-h-11"
                  disabled={disabled || !!reason}
                  aria-describedby={reason
                    ? `original-slot-reason-${team.id}-${index}`
                    : undefined}
                  onclick={() => onrestoreslot(index)}
                  >Restore original set</Button
                >
                {#if reason}<p
                    id={`original-slot-reason-${team.id}-${index}`}
                    class="provenance mt-2 wrap-anywhere"
                  >
                    {reason}
                  </p>{/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

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
