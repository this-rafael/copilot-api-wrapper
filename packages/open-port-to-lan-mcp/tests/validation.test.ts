import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Mirrors the schemas in tools.ts so we can validate boundary values independently
function makeValidator(min: number, max: number) {
  return z.object({
    port: z.number().int().min(1).max(65535),
    durationSeconds: z.number().int().min(min).max(max),
    protocol: z.enum(['tcp', 'udp']).default('tcp'),
    description: z.string().max(120).optional(),
  });
}

const schema = makeValidator(60, 3600);

describe('open-port-to-lan input validation', () => {
  it('accepts a valid minimal input', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 300 });
    expect(r.success).toBe(true);
    expect(r.data?.protocol).toBe('tcp');
  });

  it('defaults protocol to tcp', () => {
    const r = schema.safeParse({ port: 3000, durationSeconds: 120 });
    expect(r.success).toBe(true);
    expect(r.data?.protocol).toBe('tcp');
  });

  it('accepts udp protocol', () => {
    const r = schema.safeParse({ port: 5005, durationSeconds: 120, protocol: 'udp' });
    expect(r.success).toBe(true);
    expect(r.data?.protocol).toBe('udp');
  });

  it('rejects port 0', () => {
    const r = schema.safeParse({ port: 0, durationSeconds: 300 });
    expect(r.success).toBe(false);
  });

  it('rejects port above 65535', () => {
    const r = schema.safeParse({ port: 70000, durationSeconds: 300 });
    expect(r.success).toBe(false);
  });

  it('accepts port 1 (minimum)', () => {
    const r = schema.safeParse({ port: 1, durationSeconds: 60 });
    expect(r.success).toBe(true);
  });

  it('accepts port 65535 (maximum)', () => {
    const r = schema.safeParse({ port: 65535, durationSeconds: 60 });
    expect(r.success).toBe(true);
  });

  it('rejects TTL below minimum', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 30 });
    expect(r.success).toBe(false);
  });

  it('rejects TTL above maximum', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 9999 });
    expect(r.success).toBe(false);
  });

  it('accepts TTL at minimum boundary', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 60 });
    expect(r.success).toBe(true);
  });

  it('accepts TTL at maximum boundary', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 3600 });
    expect(r.success).toBe(true);
  });

  it('rejects protocol value other than tcp/udp', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 300, protocol: 'http' });
    expect(r.success).toBe(false);
  });

  it('accepts optional description', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 300, description: 'dev API' });
    expect(r.success).toBe(true);
    expect(r.data?.description).toBe('dev API');
  });

  it('rejects description longer than 120 characters', () => {
    const r = schema.safeParse({ port: 8080, durationSeconds: 300, description: 'x'.repeat(121) });
    expect(r.success).toBe(false);
  });
});
