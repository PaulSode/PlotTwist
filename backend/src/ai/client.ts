import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

export type ToolUseBlock = Anthropic.ToolUseBlock;
export type TextBlock = Anthropic.TextBlock;

/**
 * Build a `system` parameter whose (constant) text is marked as a prompt-cache
 * breakpoint. Prompt caching is GA on the Messages endpoint; the pinned SDK
 * (0.32.1) only exposes `cache_control` types under its beta namespace, so we
 * attach it via a narrow cast — the field is serialized and honored at runtime.
 *
 * Because the cache prefix is `tools → system → messages`, a breakpoint on the
 * system block also caches everything before it (the tool schemas). One
 * breakpoint therefore covers the whole constant prefix of each request.
 */
export function cachedSystem(text: string): Anthropic.MessageCreateParams['system'] {
  return [
    { type: 'text', text, cache_control: { type: 'ephemeral' } },
  ] as unknown as Anthropic.MessageCreateParams['system'];
}
