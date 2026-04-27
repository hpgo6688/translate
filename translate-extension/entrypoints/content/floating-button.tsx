import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

type FloatingButtonOptions = {
  onTranslate: () => void;
};

export async function mountFloatingButton(
  ctx: ContentScriptContext,
  options: FloatingButtonOptions,
): Promise<void> {
  let hiddenForPage = false;

  const ui = await createShadowRootUi(ctx, {
    name: 'translate-floating-button',
    position: 'overlay',
    alignment: 'bottom-right',
    onMount(container) {
      const root: Root = createRoot(container);
      root.render(
        <div style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' }}>
          {hiddenForPage ? null : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={options.onTranslate}>Translate</button>
              <button onClick={() => {
                hiddenForPage = true;
                root.render(<></>);
              }}>×</button>
            </div>
          )}
        </div>,
      );
      return root;
    },
  });

  ui.mount();
}
