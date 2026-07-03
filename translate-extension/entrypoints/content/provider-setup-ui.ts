import { openOptionsPage } from '@/utils/open-options-page';

type ProviderSetupCopy = {
  appName: string;
  banner: string;
  action: string;
  error: string;
};

const providerSetupCopy = {
  en: {
    appName: 'Translate Extension',
    banner: 'Configure a translation provider to get started.',
    action: 'Open settings',
    error: 'Translation provider is not configured. Please add an API key in settings.',
  },
  zh: {
    appName: '翻译扩展',
    banner: '请先配置翻译服务提供商。',
    action: '打开设置',
    error: '尚未配置翻译服务提供商，请在设置中添加 API Key。',
  },
} satisfies Record<'en' | 'zh', ProviderSetupCopy>;

function resolveLanguage(): 'en' | 'zh' {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getProviderSetupCopy(): ProviderSetupCopy {
  return providerSetupCopy[resolveLanguage()];
}

export function openProviderSettingsPage(): void {
  void openOptionsPage('providers');
}

function createProviderSetupTitle(copy: ProviderSetupCopy): HTMLParagraphElement {
  const title = document.createElement('p');
  title.textContent = copy.appName;
  title.style.margin = '0';
  title.style.fontSize = '14px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.3';
  title.style.color = '#78350f';
  return title;
}

export function fillProviderSetupBody(body: HTMLElement): void {
  const copy = getProviderSetupCopy();
  body.replaceChildren();

  const title = createProviderSetupTitle(copy);
  title.style.margin = '0 0 10px';
  title.style.fontSize = '18px';

  const message = document.createElement('p');
  message.textContent = copy.error;
  message.style.margin = '0 0 14px';
  message.style.fontSize = '16px';
  message.style.lineHeight = '1.5';
  message.style.fontWeight = '500';
  message.style.color = '#92400e';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = copy.action;
  button.style.border = 'none';
  button.style.borderRadius = '10px';
  button.style.padding = '8px 14px';
  button.style.fontSize = '13px';
  button.style.fontWeight = '600';
  button.style.cursor = 'pointer';
  button.style.background = '#f5b942';
  button.style.color = '#1a1408';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProviderSettingsPage();
  });

  body.append(title, message, button);
}

export function createFloatingProviderSetupNotice(): HTMLDivElement {
  const copy = getProviderSetupCopy();
  const panel = document.createElement('div');
  panel.setAttribute('data-translate-provider-setup', 'true');
  panel.style.width = '240px';
  panel.style.padding = '12px 14px';
  panel.style.borderRadius = '14px';
  panel.style.background = '#fff7ed';
  panel.style.border = '1px solid #f59e0b';
  panel.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.18)';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '10px';

  const title = createProviderSetupTitle(copy);

  const message = document.createElement('p');
  message.textContent = copy.banner;
  message.style.margin = '0';
  message.style.fontSize = '13px';
  message.style.lineHeight = '1.45';
  message.style.color = '#92400e';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '8px';

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.textContent = copy.action;
  settingsButton.style.border = 'none';
  settingsButton.style.borderRadius = '8px';
  settingsButton.style.padding = '6px 10px';
  settingsButton.style.fontSize = '12px';
  settingsButton.style.fontWeight = '600';
  settingsButton.style.cursor = 'pointer';
  settingsButton.style.background = '#f5b942';
  settingsButton.style.color = '#1a1408';
  settingsButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProviderSettingsPage();
  });

  const dismissButton = document.createElement('button');
  dismissButton.type = 'button';
  dismissButton.textContent = '×';
  dismissButton.setAttribute('aria-label', 'Dismiss');
  dismissButton.style.width = '28px';
  dismissButton.style.height = '28px';
  dismissButton.style.border = 'none';
  dismissButton.style.borderRadius = '9999px';
  dismissButton.style.background = '#fde68a';
  dismissButton.style.color = '#92400e';
  dismissButton.style.fontSize = '16px';
  dismissButton.style.cursor = 'pointer';

  actions.append(settingsButton, dismissButton);
  panel.append(title, message, actions);
  return panel;
}
