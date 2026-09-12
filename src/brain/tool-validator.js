export function validateToolCall(toolDef, args) {
  if (!toolDef) {
    return { valid: false, errors: ['Tool definition is missing or tool is unknown.'] };
  }

  const errors = [];
  const parameters = toolDef.parameters || { type: 'object', properties: {} };
  const properties = parameters.properties || {};
  const required = parameters.required || [];

  for (const req of required) {
    if (args[req] === undefined) {
      errors.push(`Missing required parameter: ${req}`);
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const propDef = properties[key];
    if (propDef) {
      const type = typeof value;
      if (propDef.type === 'string' && type !== 'string') {
        errors.push(`Parameter ${key} should be a string`);
      } else if (propDef.type === 'number' && type !== 'number') {
        errors.push(`Parameter ${key} should be a number`);
      } else if (propDef.type === 'boolean' && type !== 'boolean') {
        errors.push(`Parameter ${key} should be a boolean`);
      } else if (propDef.type === 'array' && !Array.isArray(value)) {
        errors.push(`Parameter ${key} should be an array`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
