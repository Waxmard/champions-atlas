<script lang="ts">
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import { Button } from '#lib/components/ui/button/index.js';
  import { openHelp, type HelpTopic } from '#lib/help.svelte.js';

  interface Props {
    topic?: HelpTopic | null;
    label: string;
    class?: string;
  }

  let {
    topic = null,
    label,
    class: className = 'size-7 p-0 max-md:size-7',
  }: Props = $props();
</script>

<Button
  variant="quiet"
  size="icon-compact"
  class={className}
  aria-label={label}
  aria-haspopup="dialog"
  onpointerdown={(event) => event.preventDefault()}
  onclick={() => openHelp(topic)}
>
  <CircleQuestionMark class="size-4" aria-hidden="true" />
</Button>
