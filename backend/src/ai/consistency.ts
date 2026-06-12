/**
 * Consistency analysis.
 *
 * Called for each pair of conflicting claims found during bible merge.
 * Uses Opus (the smartest model) because the question is genuinely subtle:
 *   - "Liora has blue eyes in ch.2 and brown eyes in ch.14" → contradiction
 *   - "Liora has blue eyes in ch.2 and grey-blue eyes in ch.14" → not a contradiction
 *   - "Aldwin is calm in ch.5 and furious in ch.12" → not a contradiction (state, not trait)
 *
 * Returns a verdict the orchestrator uses to decide whether to surface an Inconsistency
 * record to the author.
 */

import { anthropic, cachedSystem } from './client.js';
import { config } from '../config.js';
import { CONSISTENCY_SYSTEM, CONSISTENCY_TOOL } from './prompts.js';

export interface ConsistencyVerdict {
  classification: 'factual' | 'possible_evolution' | 'ambiguous' | 'extraction_error';
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  reasoning: string;
  shouldFlag: boolean;
}

export async function analyzeConflict(args: {
  entityName: string;
  entityType: 'character' | 'location' | 'object' | 'event' | 'timeline';
  attributeKey: string;
  claimA: { chapterRef: string; quote: string; value: string; factuality: string };
  claimB: { chapterRef: string; quote: string; value: string; factuality: string };
  /** Optional: intervening plot context the orchestrator deems relevant. */
  context?: string;
}): Promise<ConsistencyVerdict> {
  const userMessage = `ENTITY: ${args.entityName} (${args.entityType})
ATTRIBUTE: ${args.attributeKey}

CLAIM A — ${args.claimA.chapterRef}
  value: ${args.claimA.value}
  factuality: ${args.claimA.factuality}
  quote: "${args.claimA.quote}"

CLAIM B — ${args.claimB.chapterRef}
  value: ${args.claimB.value}
  factuality: ${args.claimB.factuality}
  quote: "${args.claimB.quote}"
${args.context ? `\nINTERVENING CONTEXT\n${args.context}` : ''}

Use the evaluate_contradiction tool.`;

  const response = await anthropic.messages.create({
    model: config.models.consistency,
    max_tokens: 1024,
    system: cachedSystem(CONSISTENCY_SYSTEM),
    tools: [CONSISTENCY_TOOL],
    tool_choice: { type: 'tool', name: 'evaluate_contradiction' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Consistency analysis failed: no tool_use block.');
  }

  return toolUse.input as ConsistencyVerdict;
}
