/**
 * Human-like behavior system
 * 
 * Полная система имитации человеческого поведения для ботов Minecraft.
 * Включает в себя:
 * - Естественные ответы без шаблонов
 * - Вероятностные реакции на события
 * - Имитация печати с опечатками
 * - Система настроений
 * - Личные цели и инициатива
 * - Человеческие ошибки и несовершенства
 * - Случайные AFK
 */

export { HumanBehaviorController } from './human-behavior-controller.js';
export { ResponseGenerator } from './response-generator.js';
export { ProbabilisticReactions } from './probabilistic-reactions.js';
export { TypingSimulator } from './typing-simulator.js';
export { MoodSystem } from './mood-system.js';
export { PersonalGoalsSystem } from './personal-goals.js';
export { HumanImperfections } from './human-imperfections.js';
export { AFKSystem } from './afk-system.js';
