import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
});

export type ToolUseBlock = Anthropic.ToolUseBlock;
export type TextBlock = Anthropic.TextBlock;
