import { describe, expect, it, vi } from 'vitest';
import { PromptImproverService, promptImproverInternals } from '../../src/prompts/PromptImproverService.js';

describe('PromptImproverService', () => {
  it('builds a single prompt-improver instruction with original prompt and session context', () => {
    const instruction = promptImproverInternals.buildPromptImproverInstruction(
      'corrija esse bug no fluxo de login',
      'Usuario investigando regressao no login apos refactor do backend.',
    );

    expect(instruction).toContain('corrija esse bug no fluxo de login');
    expect(instruction).toContain('Usuario investigando regressao no login apos refactor do backend.');
    expect(instruction).toContain('Retorne apenas o prompt final otimizado');
  });

  it('delegates prompt generation to the configured runner', async () => {
    const runner = vi.fn().mockResolvedValue('prompt melhorado');
    const service = new PromptImproverService(undefined, runner);

    const result = await service.improve('melhore esse prompt', 'contexto curto');

    expect(result).toBe('prompt melhorado');
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0]).toContain('melhore esse prompt');
    expect(runner.mock.calls[0]?.[0]).toContain('contexto curto');
  });

  it('falls back to an empty-session message when there is no interaction history', () => {
    const instruction = promptImproverInternals.buildPromptImproverInstruction('teste', '   ');
    expect(instruction).toContain('Sessão recém iniciada, sem histórico relevante.');
  });
});