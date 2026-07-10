import { describe, expect, it } from 'vitest';
import { BrowserCommandSchema } from '../src/schemas/browserCommands';
import { validateMutations } from '../src/schemas/validate';

const evidenceHash = `sha256:${'a'.repeat(64)}`;
const idempotencyKey = `sha256:${'b'.repeat(64)}`;

function browserCommand(operation: 'navigate' | 'snapshot' | 'screenshot' | 'read', args: Record<string, unknown>) {
  return {
    schema_version: 'talos_browser_command_v1',
    command_id: 'bc_1',
    run_id: '0190f2f1-7a4b-7abc-8def-0123456789ab',
    node_id: 'browser_1',
    browser_session_id: '0190f2f1-7a4b-7abc-8def-0123456789ac',
    operation,
    arguments: args,
    observation_request: [],
    risk: 'read',
    expected_evidence_hash: operation === 'read' ? evidenceHash : null,
    idempotency_key: idempotencyKey,
  };
}

describe('BE2-0 browser read command contract', () => {
  it('accepts a canonical navigate command in the read-only subset', () => {
    const result = BrowserCommandSchema.safeParse({
      ...browserCommand('navigate', { url: 'https://example.com' }),
      observation_request: ['snapshot'],
    });

    expect(result.success).toBe(true);
  });

  it('rejects state-changing and unknown operations', () => {
    const result = BrowserCommandSchema.safeParse({
      ...browserCommand('snapshot', {}),
      operation: 'click',
      arguments: { ref: 'r1' },
    });

    expect(result.success).toBe(false);
  });

  it('requires Browse mode and the server operation allowlist', () => {
    const mutation = [
      { action: 'SPAWN_NODE', node_id: 'browser_1', node_type: 'BROWSER_COMMAND' },
      {
        action: 'MUTATE_PAYLOAD',
        node_id: 'browser_1',
        payload: {
          ...browserCommand('navigate', { url: 'https://example.com' }),
        },
      },
    ];

    const disabled = validateMutations(mutation, { browser_1: 'BROWSER_COMMAND' }, ['BROWSER_COMMAND'], ['navigate'], false);
    expect(disabled.valid).toBe(false);
    expect(disabled.errors?.[0].message).toContain('Browse mode');

    const denied = validateMutations(mutation, { browser_1: 'BROWSER_COMMAND' }, ['BROWSER_COMMAND'], ['snapshot'], true);
    expect(denied.valid).toBe(false);
    expect(denied.errors?.at(-1)?.message).toContain('operation');
  });

  it('rejects unknown approval and capability claims', () => {
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), approval: true }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), capability: 'browser.write' }).success).toBe(false);
  });

  it('enforces canonical IDs and SHA-256 formats', () => {
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), run_id: 'run_1' }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), browser_session_id: 'session_1' }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), idempotency_key: 'sha256:command-1' }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('read', { ref: 'r1' }), expected_evidence_hash: 'stale' }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('read', { ref: 'r1' }), expected_evidence_hash: 'a'.repeat(64) }).success).toBe(false);
  });

  it('returns a validation fault for malformed URLs instead of throwing', () => {
    expect(() => BrowserCommandSchema.safeParse(browserCommand('navigate', { url: 'https://example.com:99999' }))).not.toThrow();
    expect(BrowserCommandSchema.safeParse(browserCommand('navigate', { url: 'https://example.com:99999' })).success).toBe(false);
  });

  it('uses Unicode code points for bounded read arguments', () => {
    expect(BrowserCommandSchema.safeParse(browserCommand('read', { query: '😀'.repeat(300) })).success).toBe(true);
    expect(BrowserCommandSchema.safeParse(browserCommand('read', { query: '😀'.repeat(513) })).success).toBe(false);
  });

  it('requires read to name an exact source evidence hash', () => {
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('read', { ref: 'r1' }), expected_evidence_hash: null }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse({ ...browserCommand('snapshot', {}), expected_evidence_hash: evidenceHash }).success).toBe(false);
    expect(BrowserCommandSchema.safeParse(browserCommand('read', {})).success).toBe(false);
    expect(BrowserCommandSchema.safeParse(browserCommand('read', { ref: 12 })).success).toBe(false);
  });
});
