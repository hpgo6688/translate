import { franc } from 'franc-min';

const ISO3_TO_BCP47: Record<string, string> = {
  cmn: 'zh-CN',
  eng: 'en',
  jpn: 'ja',
  kor: 'ko',
  fra: 'fr',
  spa: 'es',
  deu: 'de',
  rus: 'ru',
  ita: 'it',
  por: 'pt',
};

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export function detect(text: string): string | 'und' {
  const cleaned = text.trim();
  if (!cleaned) {
    return 'und';
  }
  const code = franc(cleaned, { minLength: 4 });
  if (code === 'und') {
    return 'und';
  }
  return ISO3_TO_BCP47[code] ?? code;
}
