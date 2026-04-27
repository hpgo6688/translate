import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: 'Simplified Chinese (简体中文)' },
  { value: 'zh-TW', label: 'Traditional Chinese (Taiwan) (繁體中文-台灣)' },
  { value: 'zh-HK', label: 'Traditional Chinese (Hong Kong) (繁體中文-香港)' },
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'ko', label: 'Korean (한국어)' },
  { value: 'es', label: 'Spanish (Español)' },
  { value: 'de', label: 'German (Deutsch)' },
];

type LanguageSelectProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: 'source' | 'target';
  dropdownAlign?: 'left' | 'right';
};

export function LanguageSelect({
  value,
  onChange,
  mode = 'source',
  dropdownAlign = 'left',
}: LanguageSelectProps) {
  const options = mode === 'source' ? LANGUAGE_OPTIONS : LANGUAGE_OPTIONS.filter((item) => item.value !== 'auto');
  return <SearchableSelect value={value} options={options} dropdownAlign={dropdownAlign} onChange={onChange} />;
}
