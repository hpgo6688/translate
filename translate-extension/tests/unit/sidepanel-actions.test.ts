import { describe, expect, it, vi } from 'vitest';

import { openExtensionSidePanel, requestSidePanelTranslation } from '@/entrypoints/sidepanel/actions';

describe('sidepanel actions', () => {
  it('opens side panel for current window', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    const getCurrent = vi.fn().mockResolvedValue({ id: 9 });

    await openExtensionSidePanel({
      sidePanel: { open },
      windows: { getCurrent },
    });

    expect(getCurrent).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ windowId: 9 });
  });

  it('returns translated text from translation message', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ text: '你好' });

    const result = await requestSidePanelTranslation(sendMessage, {
      sourceLang: 'en',
      targetLang: 'zh-CN',
      providerId: 'deepseek',
      text: 'hello',
    });

    expect(result).toBe('你好');
    expect(sendMessage).toHaveBeenCalledWith('TRANSLATE_TEXT', {
      sourceLang: 'en',
      targetLang: 'zh-CN',
      providerId: 'deepseek',
      text: 'hello',
    });
  });
});
