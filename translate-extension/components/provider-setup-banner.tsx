import { useTranslation } from 'react-i18next';

import { openOptionsPage } from '@/utils/open-options-page';

type ProviderSetupBannerProps = {
  variant?: 'popup' | 'sidepanel';
};

export function ProviderSetupBanner({ variant = 'popup' }: ProviderSetupBannerProps) {
  const { t } = useTranslation();

  return (
    <div className={`provider-setup-banner provider-setup-banner--${variant}`} role="status">
      <p className="provider-setup-banner__text">{t('providerSetup.banner')}</p>
      <button
        type="button"
        className="provider-setup-banner__action"
        onClick={() => {
          void openOptionsPage('providers');
        }}
      >
        {t('providerSetup.action')}
      </button>
    </div>
  );
}

export function providerSetupErrorMessage(t: (key: string) => string): string {
  return t('providerSetup.error');
}
