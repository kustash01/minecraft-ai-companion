/**
 * Система Максимальной Человекоподобности - Главный экспорт
 */

// Главный контроллер
export { MaximalHumanController, createMaximalHumanController } from './maximal-human-controller.js';

// Подсистемы
export { AdvancedNaturalSpeech } from './advanced-natural-speech.js';
export { ContextualMemorySystem } from './contextual-memory-system.js';
export { DynamicEmotionalSystem } from './dynamic-emotional-system.js';
export { RealisticBehaviorPatterns } from './realistic-behavior-patterns.js';
export { NaturalMistakeSystem } from './natural-mistake-system.js';

// Старые системы (для совместимости)
export { TypingSimulator } from './typing-simulator.js';
export { HumanImperfections } from './human-imperfections.js';
export { ResponseGenerator } from './response-generator.js';
