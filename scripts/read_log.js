import fs from 'fs';
const content = fs.readFileSync('C:/Users/kustash01/.gemini/antigravity/brain/b31ed356-bfed-4efa-9b98-8fb5e799ba1d/.system_generated/tasks/task-2316.log', 'utf8');
const lines = content.split('\n');
for (const line of lines) {
  if (line.includes('[AI]') || line.includes('kustash01') || line.includes('[ACTION]') || line.includes('[TOOL')) {
    console.log(line);
  }
}
