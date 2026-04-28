import { z } from 'zod';

export const liteLlmConfigSchema = z.object({
  endpoint: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(1.5).default(0.2),
  maxTokens: z.number().int().min(32).max(4096).default(1024),
  timeoutMs: z.number().int().min(1000).max(60000).default(20000),
});

export type LiteLlmConfig = z.infer<typeof liteLlmConfigSchema>;

export const liteLlmDefaults: Pick<LiteLlmConfig, 'temperature' | 'maxTokens' | 'timeoutMs'> = {
  temperature: 0.2,
  maxTokens: 1024,
  timeoutMs: 20000,
};

export function normalizeLiteLlmConfig(input: unknown): LiteLlmConfig | null {
  const parsed = liteLlmConfigSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }
  return null;
}
