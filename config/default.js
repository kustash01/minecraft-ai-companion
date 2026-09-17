import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  minecraft: {
    host: process.env.MC_HOST || 'localhost',
    port: parseInt(process.env.MC_PORT || '25565', 10),
    username: process.env.MC_USERNAME || 'GeminiBot',
    version: process.env.MC_VERSION || '1.20.4',
  },
  ai: {
    // The company works locally by default; LLM chat is explicitly opt-in.
    enabled: process.env.AI_ENABLED != null
      ? process.env.AI_ENABLED === 'true'
      : (process.env.AI_PROVIDER || 'ollama').toLowerCase() === 'ollama',
    provider: process.env.AI_PROVIDER || 'ollama',
    // Chat creativity. Lower = calmer, more natural; higher = wilder/cringier.
    // 0.6 keeps replies human without theatrical over-acting.
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.6'),
    model: process.env.AI_MODEL || 'qwen2.5:3b',
    fallbackOnTimeout: process.env.AI_FALLBACK_ON_ERROR !== 'false',
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiCompatibleApiKey: process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY,
    openaiCompatibleBaseUrl: (process.env.AI_PROVIDER || 'ollama').toLowerCase() === 'ollama'
      ? (process.env.OPENAI_COMPATIBLE_BASE_URL || 'http://127.0.0.1:11434/v1')
      : (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://tooken.club/v1'),
    social: {
      maxPublicResponders: parseInt(process.env.SOCIAL_MAX_RESPONDERS || '2', 10),
      initiativeEnabled: process.env.SOCIAL_INITIATIVE_ENABLED !== 'false',
      maxConversationTurns: parseInt(process.env.SOCIAL_MAX_TURNS || '4', 10),
    },
    rateLimit: {
      maxGlobalRPM: parseInt(process.env.AI_MAX_GLOBAL_RPM || '60', 10),
      maxPerAgentRPM: parseInt(process.env.AI_MAX_PER_AGENT_RPM || '15', 10),
    },
    localVision: {
      // Six serialized vision requests otherwise delay every agent's decisions.
      enabled: process.env.LOCAL_VISION_ENABLED === 'true',
      intervalMs: parseInt(process.env.LOCAL_VISION_INTERVAL_MS || '2500', 10),
      horizontalRays: 13,
      verticalRays: 7,
      maxDistance: 18,
      endpoint: process.env.LOCAL_VISION_ENDPOINT || 'http://127.0.0.1:11434/api/chat',
      model: process.env.LOCAL_VISION_MODEL || 'qwen2.5:3b',
      timeoutMs: parseInt(process.env.LOCAL_VISION_TIMEOUT_MS || '12000', 10),
      allowedTools: ['move_to', 'follow_player', 'look_at', 'attack_entity', 'eat_food', 'mine_block', 'collect_nearby_items'],
    },
  },
  bot: {
    owner: process.env.BOT_OWNER || 'kustash01',
    language: process.env.BOT_LANGUAGE || 'ru',
    initiative: process.env.BOT_INITIATIVE || 'balanced',
    voiceEnabled: process.env.VOICE_ENABLED === 'true',
    afkEnabled: process.env.BOT_AFK_ENABLED === 'true',
  },
  ui: {
    viewerEnabled: process.env.VIEWER_ENABLED === 'true',
    port: parseInt(process.env.UI_PORT || '3001', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  }
};
