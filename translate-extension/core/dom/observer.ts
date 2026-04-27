export function observeDomChanges(
  root: Node,
  onMutation: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver((mutations) => {
    const hasUsefulChange = mutations.some((mutation) => {
      const target = mutation.target as Element | null;
      return !target?.closest('[data-translation-wrapper]');
    });
    if (!hasUsefulChange) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => onMutation(), 200);
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    observer.disconnect();
  };
}
