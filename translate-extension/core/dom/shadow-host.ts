import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';

type ShadowUi = Awaited<ReturnType<typeof createShadowRootUi>>;

const mountedById = new Map<string, ShadowUi>();

export async function mountTranslationShadow(
  ctx: Parameters<typeof createShadowRootUi>[0],
  id: string,
  anchor: HTMLElement,
  content: string,
): Promise<void> {
  const existing = mountedById.get(id);
  if (existing) {
    existing.uiContainer.innerHTML = content;
    return;
  }

  const ui = await createShadowRootUi(ctx, {
    name: `translate-shadow-${id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`,
    position: 'inline',
    anchor,
    onMount(container) {
      container.innerHTML = content;
    },
  });
  ui.mount();
  mountedById.set(id, ui);
}
