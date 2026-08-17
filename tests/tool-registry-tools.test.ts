import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../src/orchestrator/tool-registry.js';
import { OpenCatHub } from '../src/orchestrator/hub.js';

describe('ToolRegistry — architecture tools', () => {
  it('start_all_agents / stop_all_agents change hub state', async () => {
    const hub = new OpenCatHub();
    const reg = new ToolRegistry();
    reg.attachOrchestrator(hub);

    const start = await reg.executeToolCall('start_all_agents', {});
    expect(start.success).toBe(true);
    expect(hub.getActiveDomains().length).toBeGreaterThan(0);

    const stop = await reg.executeToolCall('stop_all_agents', {});
    expect(stop.success).toBe(true);
    expect(hub.getActiveDomains().length).toBe(0);
  });

  it('read_file blocks .env and traversal', async () => {
    const reg = new ToolRegistry();
    const blocked = await reg.executeToolCall('read_file', { path: '.env' });
    expect(blocked.success).toBe(false);

    const traversal = await reg.executeToolCall('read_file', { path: '../../etc/passwd' });
    expect(traversal.success).toBe(false);
  });

  it('read_file reads a real project file', async () => {
    const reg = new ToolRegistry();
    const res = await reg.executeToolCall('read_file', { path: 'package.json' });
    expect(res.success).toBe(true);
    expect(res.data.content).toContain('"name":');
  });

  it('list_directory blocks node_modules and lists project root', async () => {
    const reg = new ToolRegistry();
    const blocked = await reg.executeToolCall('list_directory', { path: 'node_modules' });
    expect(blocked.success).toBe(false);

    const res = await reg.executeToolCall('list_directory', { path: 'src' });
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data.entries)).toBe(true);
  });
});
