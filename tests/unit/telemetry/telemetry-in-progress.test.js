import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryCollector } from '../../../src/utils/telemetry.js';

describe('TelemetryCollector In-Progress & Percentile Tests', () => {
  let collector;

  beforeEach(() => {
    collector = new TelemetryCollector();
  });

  it('correctly calculates in-progress local mode time in snapshot', async () => {
    collector.enterLocalMode('Sam');
    await new Promise(r => setTimeout(r, 50));

    const snap = collector.getSnapshot();
    expect(snap.activeLocalAgents).toBe(1);
    expect(snap.localModeTime).toBeGreaterThanOrEqual(40);

    collector.leaveLocalMode('Sam');
    const snapAfter = collector.getSnapshot();
    expect(snapAfter.activeLocalAgents).toBe(0);
    expect(snapAfter.localModeTime).toBeGreaterThanOrEqual(40);
  });

  it('correctly calculates P95 and P99 latencies', () => {
    for (let i = 1; i <= 100; i++) {
      collector.recordChatLatency(i * 10); // 10ms to 1000ms
    }

    const snap = collector.getSnapshot();
    expect(snap.p95Latency).toBe(950);
    expect(snap.p99Latency).toBe(990);
    expect(snap.avgLatency).toBe(505);
  });
});
