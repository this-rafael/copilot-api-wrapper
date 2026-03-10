import { execSync } from 'child_process';

/**
 * When running outside Windows (dev/CI), netsh calls are replaced by console logs.
 */
const DRY_RUN = process.platform !== 'win32';

function runNetsh(args: string): void {
  if (DRY_RUN) {
    console.log(`[firewall/dry-run] netsh ${args}`);
    return;
  }
  execSync(`netsh ${args}`, { stdio: 'pipe' });
}

/** Sanitises a rule name so it cannot inject extra netsh arguments. */
function safeRuleName(name: string): string {
  // Strip double-quotes and pipe characters – only these can break the command
  return name.replace(/["|\r\n]/g, '');
}

export interface AddRuleParams {
  ruleName: string;
  port: number;
  protocol: 'tcp' | 'udp';
}

/**
 * Adds an inbound Windows Firewall allow rule for the given port.
 * Requires Administrator privileges (already enforced at server startup).
 */
export function addFirewallRule(params: AddRuleParams): void {
  const { port, protocol } = params;
  const name = safeRuleName(params.ruleName);
  runNetsh(
    `advfirewall firewall add rule ` +
      `name="${name}" dir=in action=allow protocol=${protocol} localport=${port} enable=yes`,
  );
}

/**
 * Removes a Windows Firewall rule by exact name.
 * Never throws — logs a warning if the deletion fails.
 */
export function removeFirewallRule(ruleName: string): void {
  const name = safeRuleName(ruleName);
  try {
    runNetsh(`advfirewall firewall delete rule name="${name}"`);
  } catch (err) {
    console.warn(`[firewall] Failed to remove rule "${name}": ${(err as Error).message}`);
  }
}

/**
 * Returns true if a firewall rule with the given name currently exists.
 * Always returns false in dry-run mode.
 */
export function ruleExists(ruleName: string): boolean {
  if (DRY_RUN) return false;
  const name = safeRuleName(ruleName);
  try {
    execSync(`netsh advfirewall firewall show rule name="${name}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
