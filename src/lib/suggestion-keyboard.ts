const rows = (section: Element | null) => [
  ...(section?.querySelectorAll<HTMLElement>('[data-suggestion]') ?? []),
];

export function handleSuggestionKeydown(
  event: KeyboardEvent,
  section: Element | null,
  inputId: string,
  close: () => void
): void {
  const items = rows(section);
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLElement);
  const focus = (index: number) => {
    event.preventDefault();
    items[Math.min(Math.max(index, 0), items.length - 1)]?.focus();
  };
  switch (event.key) {
    case 'ArrowDown':
      focus(current + 1);
      break;
    case 'ArrowUp':
      focus(current < 0 ? items.length - 1 : current - 1);
      break;
    case 'Home':
      focus(0);
      break;
    case 'End':
      focus(items.length - 1);
      break;
    case 'Escape':
      event.preventDefault();
      document.getElementById(inputId)?.focus();
      close();
      break;
  }
}
