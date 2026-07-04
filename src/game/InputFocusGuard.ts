export function isTextEntryActive(): boolean {
  const active = document.activeElement;
  if (!active) {
    return false;
  }

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    return true;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    return true;
  }

  return active instanceof HTMLElement && Boolean(active.closest?.('[data-game-text-input]'));
}

export function stopGameHotkeysDuringTextEntry(root: HTMLElement = document.body): void {
  root.addEventListener(
    'keydown',
    (event) => {
      if (isTextEntryActive()) {
        event.stopPropagation();
      }
    },
    true,
  );
  root.addEventListener(
    'keyup',
    (event) => {
      if (isTextEntryActive()) {
        event.stopPropagation();
      }
    },
    true,
  );
}

export function blurActiveTextEntry(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && isTextEntryActive()) {
    active.blur();
  }
}
