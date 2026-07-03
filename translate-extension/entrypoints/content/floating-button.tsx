import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

import { createFloatingProviderSetupNotice } from '@/entrypoints/content/provider-setup-ui';

type FloatingButtonOptions = {
  onTranslate: () => void;
  isProviderConfigured: () => boolean;
};

export async function mountFloatingButton(
  ctx: ContentScriptContext,
  options: FloatingButtonOptions,
): Promise<{ refresh: () => void }> {
  let hiddenForPage = false;
  let root: Root | null = null;

  const render = () => {
    if (!root) {
      return;
    }
    if (hiddenForPage) {
      root.render(<></>);
      return;
    }

    if (!options.isProviderConfigured()) {
      root.render(
        <div style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' }}>
          <FloatingProviderSetupNotice
            onDismiss={() => {
              hiddenForPage = true;
              render();
            }}
          />
        </div>,
      );
      return;
    }

    root.render(
      <div style={{ position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={options.onTranslate}>Translate</button>
          <button
            onClick={() => {
              hiddenForPage = true;
              render();
            }}
          >
            ×
          </button>
        </div>
      </div>,
    );
  };

  const ui = await createShadowRootUi(ctx, {
    name: 'translate-floating-button',
    position: 'overlay',
    alignment: 'bottom-right',
    onMount(container) {
      root = createRoot(container);
      render();
      return root;
    },
  });

  ui.mount();
  return { refresh: render };
}

function FloatingProviderSetupNotice({ onDismiss }: { onDismiss: () => void }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const panel = createFloatingProviderSetupNotice();
    const dismissButton = panel.querySelector('button[aria-label="Dismiss"]');
    dismissButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    });
    container.replaceChildren(panel);
    return () => {
      container.replaceChildren();
    };
  }, [onDismiss]);

  return <div ref={containerRef} />;
}
