import fs from 'fs';
import path from 'path';

export interface RuleEntry {
  id: string;
  ruleName: string;
  localPort: number;
  publicPort: number;
  protocol: 'tcp' | 'udp';
  description: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
}

interface StateFile {
  rules: RuleEntry[];
}

/**
 * Persists open-rule state to a JSON file with atomic writes.
 * Thread-safe for single-process use (no concurrent writes on same file).
 */
export class RuleStateStore {
  private readonly filePath: string;
  private rules: Map<string, RuleEntry> = new Map();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.load();
  }

  private load(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as StateFile;
      this.rules = new Map(data.rules.map((r) => [r.id, r]));
    } catch {
      console.warn('[state] Failed to load state file; starting with empty state.');
      this.rules = new Map();
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: StateFile = { rules: Array.from(this.rules.values()) };
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }

  add(entry: RuleEntry): void {
    this.rules.set(entry.id, entry);
    this.save();
  }

  remove(id: string): void {
    this.rules.delete(id);
    this.save();
  }

  getAll(): RuleEntry[] {
    return Array.from(this.rules.values());
  }

  getExpired(): RuleEntry[] {
    const now = Date.now();
    return this.getAll().filter((r) => new Date(r.expiresAt).getTime() <= now);
  }

  getActive(): RuleEntry[] {
    const now = Date.now();
    return this.getAll().filter((r) => new Date(r.expiresAt).getTime() > now);
  }

  /** Returns the active rule for a given publicPort, or undefined if none. */
  findByPort(publicPort: number): RuleEntry | undefined {
    return this.getActive().find((r) => r.publicPort === publicPort);
  }

  findById(id: string): RuleEntry | undefined {
    return this.rules.get(id);
  }
}
