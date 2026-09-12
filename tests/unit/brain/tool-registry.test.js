import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/brain/tool-registry.js';

describe('ToolRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register a tool', () => {
    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ success: true }),
    });
    expect(registry.get('test_tool')).toBeDefined();
    expect(registry.get('test_tool').name).toBe('test_tool');
  });

  it('should throw on registering tool without name', () => {
    expect(() => registry.register({ handler: async () => {} }))
      .toThrow();
  });

  it('should throw on registering tool without handler', () => {
    expect(() => registry.register({ name: 'no_handler' }))
      .toThrow();
  });

  it('should get all tools', () => {
    registry.register({ name: 'a', description: 'A', parameters: {}, handler: async () => {} });
    registry.register({ name: 'b', description: 'B', parameters: {}, handler: async () => {} });
    expect(registry.getAll()).toHaveLength(2);
  });

  it('should generate function declarations', () => {
    registry.register({
      name: 'move_to',
      description: 'Move to coords',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
        },
        required: ['x', 'y', 'z'],
      },
      handler: async () => ({}),
    });

    const declarations = registry.getFunctionDeclarations();
    expect(declarations).toHaveLength(1);
    expect(declarations[0].name).toBe('move_to');
    expect(declarations[0].parameters.required).toContain('x');
    // handler should NOT be in declarations
    expect(declarations[0].handler).toBeUndefined();
  });

  it('should execute a tool', async () => {
    registry.register({
      name: 'greet',
      description: 'Greet',
      parameters: {},
      handler: async (args) => ({ message: `Hello ${args.name}` }),
    });

    const result = await registry.execute('greet', { name: 'World' });
    expect(result.message).toBe('Hello World');
  });

  it('should throw on executing unknown tool', async () => {
    await expect(registry.execute('unknown', {})).rejects.toThrow('Tool not found');
  });

  it('should timeout long running tools', async () => {
    registry.register({
      name: 'slow_tool',
      description: 'Slow',
      parameters: {},
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { done: true };
      },
    });

    await expect(registry.execute('slow_tool', {}, 100)).rejects.toThrow('timed out');
  });
});
