import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopilotCommandFactory } from '../../src/cli/CopilotCommandFactory.js';

const FORBIDDEN_FLAGS = [
  '--allow-all',
  '--autopilot',
  '--allow-all-tools',
  '--allow-all-paths',
];

describe('CopilotCommandFactory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('build()', () => {
    it('never produces forbidden flags for copilot-interactive', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/copilot');
      const { args } = CopilotCommandFactory.build('copilot-interactive');
      for (const flag of FORBIDDEN_FLAGS) {
        expect(args).not.toContain(flag);
      }
    });

    it('never produces forbidden flags for gh-copilot-suggest', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/gh');
      const { args } = CopilotCommandFactory.build('gh-copilot-suggest');
      for (const flag of FORBIDDEN_FLAGS) {
        expect(args).not.toContain(flag);
      }
    });

    it('copilot-interactive uses standalone copilot when available', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockImplementation((bin) =>
        bin === 'copilot' ? '/usr/bin/copilot' : null,
      );
      const { command } = CopilotCommandFactory.build('copilot-interactive');
      expect(command).toBe('/usr/bin/copilot');
    });

    it('copilot-interactive falls back to gh when copilot is missing', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockImplementation((bin) =>
        bin === 'gh' ? '/usr/bin/gh' : null,
      );
      const { command } = CopilotCommandFactory.build('copilot-interactive');
      expect(command).toBe('/usr/bin/gh');
    });

    it('throws when neither copilot nor gh is found for copilot-interactive', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue(null);
      expect(() => CopilotCommandFactory.build('copilot-interactive')).toThrow();
    });

    it('gh-copilot-suggest uses gh and adds suggest sub-command', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/local/bin/gh');
      const { command, args } = CopilotCommandFactory.build('gh-copilot-suggest');
      expect(command).toBe('/usr/local/bin/gh');
      expect(args[0]).toBe('suggest');
    });

    it('gh-copilot-suggest throws when gh is not found', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue(null);
      expect(() => CopilotCommandFactory.build('gh-copilot-suggest')).toThrow(/gh CLI not found/);
    });

    it('copilot-interactive args include --no-auto-update', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/copilot');
      const { args } = CopilotCommandFactory.build('copilot-interactive');
      expect(args).toContain('--no-auto-update');
    });

    it('copilot-interactive always includes --yolo', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/copilot');
      const { args } = CopilotCommandFactory.build('copilot-interactive');
      expect(args).toContain('--yolo');
    });

    it('gh-copilot-suggest does not include --yolo', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/gh');
      const { args } = CopilotCommandFactory.build('gh-copilot-suggest');
      expect(args).not.toContain('--yolo');
    });

    it('args include --log-level error for both profiles', () => {
      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/copilot');
      const interactive = CopilotCommandFactory.build('copilot-interactive');
      expect(interactive.args).toContain('--log-level');
      expect(interactive.args).toContain('error');

      vi.spyOn(CopilotCommandFactory, 'findInPath').mockReturnValue('/usr/bin/gh');
      const suggest = CopilotCommandFactory.build('gh-copilot-suggest');
      expect(suggest.args).toContain('--log-level');
      expect(suggest.args).toContain('error');
    });
  });
});
