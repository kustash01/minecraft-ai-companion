import { createLogger } from './logger.js';

const logger = createLogger('TELEMETRY');

export class TelemetryCollector {
  constructor() {
    this.metrics = {
      playerCommandLatencyMs: [],
      chatEventLatencyMs: [],
      activeLLMRequests: 0,
      activeRequests: 0,
      queuedRequests: 0,
      completedRequests: 0,
      timedOutRequests: 0,
      timeouts: 0,
      cancelledRequests: 0,
      rateLimit429Count: 0,
      HTTP429: 0,
      HTTP400: 0,
      latencyMs: [],
      localModeStartedAt: new Map(),
      localModeTimeMs: 0,
      recoveryCount: 0,
      duplicateMessageCount: 0,
      repeatedActionCount: 0,
      totalLLMCalls: 0,
      successfulLLMCalls: 0,
      startTime: Date.now(),
    };
  }

  recordCommandLatency(durationMs) {
    this.metrics.playerCommandLatencyMs.push(durationMs);
    if (this.metrics.playerCommandLatencyMs.length > 50) {
      this.metrics.playerCommandLatencyMs.shift();
    }
  }

  recordChatLatency(durationMs) {
    this.metrics.chatEventLatencyMs.push(durationMs);
    if (this.metrics.chatEventLatencyMs.length > 50) {
      this.metrics.chatEventLatencyMs.shift();
    }
    this.metrics.latencyMs.push(durationMs);
    if (this.metrics.latencyMs.length > 200) this.metrics.latencyMs.shift();
  }

  enterLocalMode(agentName = 'unknown') {
    if (!this.metrics.localModeStartedAt.has(agentName)) {
      this.metrics.localModeStartedAt.set(agentName, Date.now());
    }
  }

  leaveLocalMode(agentName = 'unknown') {
    const started = this.metrics.localModeStartedAt.get(agentName);
    if (started) {
      this.metrics.localModeTimeMs += Date.now() - started;
      this.metrics.localModeStartedAt.delete(agentName);
    }
  }

  increment(metricName, amount = 1) {
    if (this.metrics[metricName] !== undefined) {
      this.metrics[metricName] += amount;
    }
  }

  decrement(metricName, amount = 1) {
    if (this.metrics[metricName] !== undefined) {
      this.metrics[metricName] = Math.max(0, this.metrics[metricName] - amount);
    }
  }

  getAverageLatency(metricArrayName) {
    const arr = this.metrics[metricArrayName];
    if (!arr || arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round(sum / arr.length);
  }

  getSnapshot() {
    const sorted = [...this.metrics.latencyMs].sort((a, b) => a - b);
    const p95Latency = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
    const p99Latency = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)] : 0;

    let totalLocalModeMs = this.metrics.localModeTimeMs;
    const now = Date.now();
    for (const start of this.metrics.localModeStartedAt.values()) {
      totalLocalModeMs += (now - start);
    }

    return {
      uptimeSeconds: Math.round((Date.now() - this.metrics.startTime) / 1000),
      avgCommandLatencyMs: this.getAverageLatency('playerCommandLatencyMs'),
      avgChatLatencyMs: this.getAverageLatency('chatEventLatencyMs'),
      activeLLMRequests: this.metrics.activeLLMRequests,
      activeRequests: this.metrics.activeRequests,
      queuedRequests: this.metrics.queuedRequests,
      completedRequests: this.metrics.completedRequests,
      timedOutRequests: this.metrics.timedOutRequests,
      timeouts: this.metrics.timeouts,
      cancelledRequests: this.metrics.cancelledRequests,
      rateLimit429Count: this.metrics.rateLimit429Count,
      HTTP429: this.metrics.HTTP429,
      HTTP400: this.metrics.HTTP400,
      avgLatency: this.getAverageLatency('latencyMs'),
      p95Latency,
      p99Latency,
      localModeTime: totalLocalModeMs,
      activeLocalAgents: this.metrics.localModeStartedAt.size,
      recoveryCount: this.metrics.recoveryCount,
      duplicateMessageCount: this.metrics.duplicateMessageCount,
      repeatedActionCount: this.metrics.repeatedActionCount,
      totalLLMCalls: this.metrics.totalLLMCalls,
      successfulLLMCalls: this.metrics.successfulLLMCalls,
    };
  }
}

export const telemetry = new TelemetryCollector();
