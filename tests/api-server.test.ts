import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AthenaRESTServer } from '../src/api/server.js';
import { AthenaHub } from '../src/orchestrator/hub.js';

describe('AthenaRESTServer Test Suite', () => {
  let server: AthenaRESTServer;
  let hub: AthenaHub;
  const testPort = 3199;

  beforeEach(async () => {
    delete process.env.ATHENA_API_KEY;
    process.env.API_PORT = String(testPort);
    hub = new AthenaHub();
    server = new AthenaRESTServer(testPort);
    server.start(hub);
    // Give server a moment to bind
    await new Promise((r) => setTimeout(r, 100));
  });

  afterEach(async () => {
    await server.stop();
  });

  it('GET /api/status returns 200 with full system status and 4 sub-agent details', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.executionMode).toBeDefined();
    expect(data.primaryVenue).toContain('Robinhood Chain L2');
    expect(Array.isArray(data.subAgents)).toBe(true);
    expect(data.subAgents.length).toBe(4);
    expect(data.connectedApiKeys).toBeDefined();
  });

  it('GET /api/calls returns signal call ledger items', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/calls`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(Array.isArray(data.calls)).toBe(true);
  });

  it('GET /api/positions returns open tokens, LP, and NFT positions', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/positions`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.tokens).toBeDefined();
    expect(data.lpPositions).toBeDefined();
    expect(data.nftPositions).toBeDefined();
  });

  it('GET /api/executions returns trade journal summary & entries', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/executions`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.analytics).toBeDefined();
    expect(Array.isArray(data.entries)).toBe(true);
  });

  it('POST /api/agents/toggle toggles sub-agent active state', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/agents/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'alpha-robinhood', active: true }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.domain).toBe('alpha-robinhood');
    expect(data.active).toBe(true);
    expect(hub.isAgentActive('alpha-robinhood')).toBe(true);
  });

  it('Enforces ATHENA_API_KEY authentication guard when set', async () => {
    process.env.ATHENA_API_KEY = 'secret_key_123';

    // 1. Without header -> 401
    const unauthRes = await fetch(`http://localhost:${testPort}/api/status`);
    expect(unauthRes.status).toBe(401);

    // 2. With valid header -> 200
    const authRes = await fetch(`http://localhost:${testPort}/api/status`, {
      headers: { 'X-Athena-Api-Key': 'secret_key_123' },
    });
    expect(authRes.status).toBe(200);
  });
});
