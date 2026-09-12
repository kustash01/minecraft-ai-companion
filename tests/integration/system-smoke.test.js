import { describe, it, expect } from 'vitest';
import { createMockBot } from '../mocks/mock-bot.js';
import { MockAIProvider } from '../mocks/mock-ai.js';
import { ToolRegistry } from '../../src/brain/tool-registry.js';
import { ContextManager } from '../../src/brain/context-manager.js';
import { AIBrain } from '../../src/brain/ai-brain.js';
import { WorldState } from '../../src/perception/world-state.js';
import { registerAllTools } from '../../src/tools/index.js';
import { config } from '../../config/default.js';
import { getSystemPrompt } from '../../config/personality.js';

describe('System Integration Smoke Test', () => {
  it('should initialize and wire all components with mock bot', async () => {
    const mockBot = createMockBot();
    const provider = new MockAIProvider();
    const registry = new ToolRegistry();
    const worldState = new WorldState();
    const contextManager = new ContextManager(config);
    const aiBrain = new AIBrain(config, registry, contextManager, provider);

    // Register all tools
    registerAllTools(registry, {
      bot: mockBot,
      worldState,
      mcBot: { bot: mockBot, isConnected: () => true },
    });

    const tools = registry.getAll();
    expect(tools.length).toBeGreaterThan(10);

    // Test function declarations generation
    const declarations = registry.getFunctionDeclarations();
    expect(declarations.length).toBe(tools.length);

    // Update world state
    worldState.forceUpdate(mockBot);
    expect(worldState.health).toBe(20);
    expect(worldState.food).toBe(18);
    expect(worldState.position).toEqual({ x: 100, y: 64, z: 200 });

    // Test system prompt generation
    const prompt = getSystemPrompt(config);
    expect(prompt).toContain(config.minecraft.username || 'GeminiBot');
    expect(prompt).toContain('kustash01');

    // Test tool execution directly from registry
    const posResult = await registry.execute('get_position', {});
    expect(posResult.success).toBe(true);
    expect(posResult.data).toEqual({ x: 100, y: 64, z: 200 });

    const invResult = await registry.execute('get_inventory', {});
    expect(invResult.success).toBe(true);
    expect(invResult.data).toContain('diamond_pickaxe');

    // Test AI Brain query
    provider.addResponse({ text: 'Я готов исследовать мир!', toolCalls: [], raw: {} });
    const reply = await aiBrain.processMessage('Привет, как дела?', worldState);
    expect(reply).toBe('Я готов исследовать мир!');
  });
});
