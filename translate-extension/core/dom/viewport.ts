export function observeInViewport(
  elements: HTMLElement[],
  onVisible: (element: HTMLElement) => void,
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          onVisible(entry.target as HTMLElement);
        }
      }
    },
    {
      rootMargin: '200px',
    },
  );

  for (const element of elements) {
    observer.observe(element);
  }

  return () => observer.disconnect();
}
