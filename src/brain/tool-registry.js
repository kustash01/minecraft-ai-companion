import logger from '../utils/logger.js';

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(toolDef) {
    if (!toolDef.name || !toolDef.handler) {
      throw new Error('Tool must have a name and a handler');
    }
    this.tools.set(toolDef.name, toolDef);
    logger.info(`Registered tool: ${toolDef.name}`);
  }

  get(name) {
    return this.tools.get(name);
  }

  getAll() {
    return Array.from(this.tools.values());
  }

  getFunctionDeclarations() {
    return this.getAll().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  async execute(name, args, timeoutMs = 30000) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      return await Promise.race([tool.handler(args), timeoutPromise]);
    } finally {
      clearTimeout(timer);
    }
  }
}
