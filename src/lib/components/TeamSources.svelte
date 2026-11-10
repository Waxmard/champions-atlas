<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy';
  import { Button } from '#lib/components/ui/button/index.js';
  import { copyText } from '#lib/clipboard.js';
  import { notify } from '#lib/notifications.js';
  import { evidence, evidenceGrade, isPasteUrl } from '#lib/catalog.js';
  import type { SavedTeam } from '#lib/workbench.js';

  interface Props {
    team: SavedTeam;
    currentRegulation: string;
  }

  let { team, currentRegulation }: Props = $props();
  let replicaCopyFailed = $state(false);
  async function copyReplica() {
    const ok = await copyText(team.original.replicaCode ?? '');
    replicaCopyFailed = !ok;
    if (ok) notify('Replica code copied.');
  }
  function safeUrl(value: string): boolean {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }
</script>

{#if team.original.reports?.length || team.origin !== 'custom'}
  <div class="min-w-0">
    <h3 class="term">Results & sources</h3>
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
            {#if !result.none}<p>
                <span class="stamp" data-grade={evidenceGrade(result.level)}
                  >{result.label}</span
                > <span class="provenance">{result.platform}</span>
              </p>{/if}
            {#if report.sourceUrl}{#if safeUrl(report.sourceUrl)}<a
                  class="inline-flex min-h-11 link items-center"
                  href={report.sourceUrl}
                  target="_blank"
                  rel="external noreferrer">Original source {index + 1}</a
                >{:else}<p class="provenance">{report.sourceUrl}</p>{/if}{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="provenance">No original results were retained.</p>
    {/if}
  </div>
{/if}
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
{#if team.original.replicaCode || team.original.replicaStatus}
  <div>
    <h3 class="font-bold">Original replica code</h3>
    {#if team.original.replicaCode}<code
        class="font-mono text-sm wrap-anywhere select-all"
        >{team.original.replicaCode}</code
      >{/if}
    {#if team.original.replicaCode && team.original.replicaStatus === '✔'}
      <Button variant="quiet" size="compact" onclick={copyReplica}
        ><Copy aria-hidden="true" />Copy replica code</Button
      >
      {#if replicaCopyFailed}<p role="alert" class="provenance">
          Copy unavailable. Select the code above and copy it.
        </p>{/if}
    {/if}
    {#if team.original.replicaStatus}<p class="provenance">
        Source status: {team.original.replicaStatus}
      </p>{/if}
    <p class="provenance">
      This code belongs to the original team, not your edited team. Availability
      may change.
    </p>
  </div>
{/if}
