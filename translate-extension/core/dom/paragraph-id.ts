import { paragraphId } from '@/utils/normalize';

export type ParagraphWithId = {
  id: string;
  text: string;
  element: HTMLElement;
};

export async function assignParagraphIds(
  paragraphs: Array<{ text: string; element: HTMLElement }>,
): Promise<ParagraphWithId[]> {
  const occurrences = new Map<string, number>();
  const output: ParagraphWithId[] = [];
  for (const paragraph of paragraphs) {
    const baseId = await paragraphId(paragraph.text);
    const count = occurrences.get(baseId) ?? 0;
    occurrences.set(baseId, count + 1);
    output.push({
      id: count === 0 ? baseId : `${baseId}#${count}`,
      text: paragraph.text,
      element: paragraph.element,
    });
  }
  return output;
}
