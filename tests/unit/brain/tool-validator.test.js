import { describe, it, expect } from 'vitest';
import { validateToolCall } from '../../../src/brain/tool-validator.js';

describe('ToolValidator', () => {
  const moveTool = {
    name: 'move_to',
    description: 'Move to coordinates',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        z: { type: 'number' },
      },
      required: ['x', 'y', 'z'],
    },
  };

  const chatTool = {
    name: 'say_in_chat',
    description: 'Send message',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  };

  it('should validate correct tool call', () => {
    const result = validateToolCall(moveTool, { x: 10, y: 64, z: 20 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing required parameter', () => {
    const result = validateToolCall(moveTool, { x: 10, y: 64 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: z');
  });

  it('should detect wrong type', () => {
    const result = validateToolCall(moveTool, { x: 10, y: 64, z: 'not a number' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('number'))).toBe(true);
  });

  it('should handle missing tool definition', () => {
    const result = validateToolCall(null, { x: 10 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('missing');
  });

  it('should validate string parameter', () => {
    const result = validateToolCall(chatTool, { message: 'hello' });
    expect(result.valid).toBe(true);
  });

  it('should detect wrong string type', () => {
    const result = validateToolCall(chatTool, { message: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('string'))).toBe(true);
  });

  it('should allow extra parameters', () => {
    const result = validateToolCall(chatTool, { message: 'hello', extra: true });
    expect(result.valid).toBe(true);
  });

  it('should handle tool with no parameters', () => {
    const noParamTool = {
      name: 'stop',
      parameters: { type: 'object', properties: {} },
    };
    const result = validateToolCall(noParamTool, {});
    expect(result.valid).toBe(true);
  });
});
