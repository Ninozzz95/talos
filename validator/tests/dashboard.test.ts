import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildServer } from '../src/server.js';

describe('legacy dashboard artifact', () => {
  const html = readFileSync(resolve(__dirname, '../src/dashboard.html'), 'utf8');

  it('uses the deterministic comparison endpoint instead of the legacy two-mode benchmark endpoint', () => {
    expect(html).toContain('/benchmark/compare');
    expect(html).not.toContain("fetch('/benchmark',");
  });

  it('renders AVM ON, AVM OFF Direct, and Tool Agent comparison modes', () => {
    expect(html).toContain('AVM ON');
    expect(html).toContain('AVM OFF Direct');
    expect(html).toContain('Tool Agent');
  });

  it('integrates file ingestion in the existing benchmark dashboard', () => {
    expect(html).toContain('Upload file');
    expect(html).toContain('Run AVM comparison');
    expect(html).toContain('/api/files/ingest');
    expect(html).toContain('/api/benchmarks/compare');
    expect(html).toContain('control_plane_url');
  });

  it('renders enterprise evidence metrics from benchmark reports', () => {
    expect(html).toContain('Enterprise risk');
    expect(html).toContain('Contract violations');
    expect(html).toContain('Recovery score');
    expect(html).toContain('Determinism');
  });
});

describe('dashboard route canonicalization', () => {
  it('redirects the validator dashboard route to the dedicated Talos chat route', async () => {
    const server = buildServer();

    const response = await server.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('http://127.0.0.1:8001/chat');
    expect(response.body).not.toContain('AVM BENCHMARK LAB');
  });
});
