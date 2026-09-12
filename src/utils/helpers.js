/**
 * Утилиты общего назначения.
 */

/**
 * Задержка выполнения.
 * @param {number} ms - миллисекунды
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Случайное число в диапазоне.
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Случайный элемент массива.
 */
export function randomChoice(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Ограничение значения в диапазон.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
