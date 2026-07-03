import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChangeRecord = Record<string, { oldValue: unknown; newValue: unknown }>;
type ChangeListener = (changes: ChangeRecord, areaName: string) => void;

function createStorageArea(initial: Record<string, unknown>) {
  const state = new Map(Object.entries(initial));
  return {
    get(keys?: string | string[] | Record<string, unknown>) {
      if (!keys) {
        return Promise.resolve(Object.fromEntries(state.entries()));
      }
      const targetKeys = Array.isArray(keys)
        ? keys
        : typeof keys === 'string'
          ? [keys]
          : Object.keys(keys);
      const result: Record<string, unknown> = {};
      for (const key of targetKeys) {
        result[key] = state.has(key) ? state.get(key) : null;
      }
      return Promise.resolve(result);
    },
    set(values: Record<string, unknown>) {
      for (const [key, value] of Object.entries(values)) {
        state.set(key, value);
      }
      return Promise.resolve();
    },
    remove(keys: string | string[]) {
      const targetKeys = Array.isArray(keys) ? keys : [keys];
      for (const key of targetKeys) {
        state.delete(key);
      }
      return Promise.resolve();
    },
    clear() {
      state.clear();
      return Promise.resolve();
    },
    _state: state,
  };
}

function createChromeMock() {
  const listeners = new Set<ChangeListener>();
  const localArea = createStorageArea({});
  const syncArea = createStorageArea({
    providerConfigs: {
      google: { enabled: false, requiresKey: false },
    },
  });

  const onChanged = {
    addListener(listener: ChangeListener) {
      listeners.add(listener);
    },
    removeListener(listener: ChangeListener) {
      listeners.delete(listener);
    },
  };

  const emit = (changes: ChangeRecord, areaName: string) => {
    for (const listener of listeners) {
      listener(changes, areaName);
    }
  };

  return {
    storage: {
      local: {
        ...localArea,
        async set(values: Record<string, unknown>) {
          const old: ChangeRecord = {};
          for (const [key, value] of Object.entries(values)) {
            old[key] = {
              oldValue: localArea._state.get(key),
              newValue: value,
            };
          }
          await localArea.set(values);
          emit(old, 'local');
        },
      },
      sync: {
        ...syncArea,
        async set(values: Record<string, unknown>) {
          const old: ChangeRecord = {};
          for (const [key, value] of Object.entries(values)) {
            old[key] = {
              oldValue: syncArea._state.get(key),
              newValue: value,
            };
          }
          await syncArea.set(values);
          emit(old, 'sync');
        },
      },
      onChanged,
    },
  };
}

async function collect(iterable: AsyncIterable<{ id: string; text: string; done: boolean }>) {
  const chunks: Array<{ id: string; text: string; done: boolean }> = [];
  for await (const item of iterable) {
    chunks.push(item);
  }
  return chunks;
}

describe('providers and keystore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as { chrome?: unknown }).chrome = createChromeMock();
  });

  it('google provider supports auto source language', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([[['你好']]])));

    const { googleProvider } = await import('@/core/translators/google');
    const chunks = await collect(
      googleProvider.translate(
        [{ id: '1', text: 'hello' }],
        { sourceLang: 'auto', targetLang: 'zh-CN', signal: new AbortController().signal },
      ),
    );

    expect(chunks[0]).toEqual({ id: '1', text: '你好', done: true });
    const firstArg = fetchSpy.mock.calls[0]?.[0];
    expect(firstArg).toBeInstanceOf(URL);
    if (!(firstArg instanceof URL)) {
      throw new Error('Expected fetch to be called with URL');
    }
    expect(firstArg.searchParams.get('sl')).toBe('auto');
  });

  it('deepl provider throws PROVIDER_KEY_MISSING when key not configured', async () => {
    const { deeplFreeProvider } = await import('@/core/translators/deepl');
    const iterator = deeplFreeProvider.translate(
      [{ id: '1', text: 'hello' }],
      { sourceLang: 'en', targetLang: 'de', signal: new AbortController().signal },
    )[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'PROVIDER_KEY_MISSING',
    });
  });

  it('deepseek provider throws PROVIDER_KEY_MISSING when key not configured', async () => {
    const { deepseekProvider } = await import('@/core/translators/deepseek');
    const iterator = deepseekProvider.translate(
      [{ id: '1', text: 'hello' }],
      { sourceLang: 'en', targetLang: 'zh-CN', signal: new AbortController().signal },
    )[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'PROVIDER_KEY_MISSING',
    });
  });

  it('deepseek provider calls Anthropic-compatible messages API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '你好' }],
        }),
      ),
    );
    const { deepseekProvider } = await import('@/core/translators/deepseek');
    const chunks = await collect(
      deepseekProvider.translate(
        [{ id: '1', text: 'hello' }],
        {
          sourceLang: 'en',
          targetLang: 'zh-CN',
          signal: new AbortController().signal,
          apiKey: 'sk-test',
        },
      ),
    );
    expect(chunks[0]).toEqual({ id: '1', text: '你好', done: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.deepseek.com/anthropic/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody.model).toBe('deepseek-v4-pro');
  });

  it('provider translate honors abort signal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const { googleProvider } = await import('@/core/translators/google');
    const controller = new AbortController();
    const pending = collect(
      googleProvider.translate(
        [{ id: '1', text: 'hello' }],
        { sourceLang: 'en', targetLang: 'zh-CN', signal: controller.signal },
      ),
    );
    controller.abort();
    await expect(pending).rejects.toThrow(/Abort/);
  });

  it('fails unlock with wrong master password', async () => {
    const { masterPasswordManager } = await import('@/core/keystore/master-password');
    const { providerKeyStore } = await import('@/core/keystore/provider-keys');

    await masterPasswordManager.setup('correct-password');
    await providerKeyStore.setProviderKey('deepl', 'secret-key');
    masterPasswordManager.lock();

    await expect(masterPasswordManager.unlock('wrong-password')).rejects.toThrow(
      'Incorrect password',
    );
  });

  it('applies provider config changes via storage onChanged within 1 second', async () => {
    const { providerKeyStore } = await import('@/core/keystore/provider-keys');
    await providerKeyStore.init();
    expect(providerKeyStore.getProviderConfig('google')?.enabled).toBe(false);

    await (globalThis as unknown as { chrome: ReturnType<typeof createChromeMock> }).chrome.storage.sync.set(
      {
        providerConfigs: {
          google: { enabled: true, requiresKey: false },
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(providerKeyStore.getProviderConfig('google')?.enabled).toBe(true);
    providerKeyStore.dispose();
  });

  it('llm provider throws config missing when endpoint/model/key absent', async () => {
    const { liteLlmProvider } = await import('@/core/translators/litellm');
    const iterator = liteLlmProvider.translate(
      [{ id: '1', text: 'hello' }],
      { sourceLang: 'en', targetLang: 'zh-CN', signal: new AbortController().signal },
    )[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toMatchObject({
      code: 'PROVIDER_KEY_MISSING',
    });
  });

  it('llm provider returns translated text when LiteLLM responds correctly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '你好' } }],
        }),
      ),
    );
    const { liteLlmProvider } = await import('@/core/translators/litellm');
    const chunks = await collect(
      liteLlmProvider.translate(
        [{ id: '1', text: 'hello' }],
        {
          sourceLang: 'en',
          targetLang: 'zh-CN',
          signal: new AbortController().signal,
          providerConfig: {
            endpoint: 'https://litellm.example.com',
            apiKey: 'token',
            model: 'gpt-5.4-mini',
            temperature: 0.2,
            maxTokens: 256,
            timeoutMs: 20000,
          },
        },
      ),
    );
    expect(chunks[0]).toEqual({ id: '1', text: '你好', done: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://litellm.example.com/chat/completions',
      expect.any(Object),
    );
  });

  it('llm provider normalizes endpoints ending with models', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'bonjour' } }],
        }),
      ),
    );
    const { liteLlmProvider } = await import('@/core/translators/litellm');
    await collect(
      liteLlmProvider.translate(
        [{ id: '1', text: 'hello' }],
        {
          sourceLang: 'en',
          targetLang: 'fr',
          signal: new AbortController().signal,
          providerConfig: {
            endpoint: 'https://litellm.cmex.corp/models',
            apiKey: 'token',
            model: 'claude-sonnet-4-5',
            temperature: 0.2,
            maxTokens: 256,
            timeoutMs: 20000,
          },
        },
      ),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://litellm.cmex.corp/chat/completions',
      expect.any(Object),
    );
  });
});
