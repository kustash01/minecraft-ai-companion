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
 * Gaussian distribution sampler using Box-Muller transform
 */
function gaussianRandom(mean = 0, stdDev = 1) {
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.max(1e-7, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Случайное число в диапазоне по нормальному распределению Гаусса.
 */
export function randomInt(min, max) {
  if (min >= max) return min;
  const mean = (min + max) / 2;
  const sigma = (max - min) / 5;
  const val = Math.round(gaussianRandom(mean, sigma));
  return Math.max(min, Math.min(max, val));
}

/**
 * Случайный элемент массива по распределению Гаусса.
 */
export function randomChoice(array) {
  if (!array || array.length === 0) return null;
  if (array.length === 1) return array[0];
  const mean = (array.length - 1) / 2;
  const sigma = (array.length - 1) / 4.5;
  const idx = Math.max(0, Math.min(array.length - 1, Math.round(gaussianRandom(mean, sigma))));
  return array[idx];
}

/**
 * Ограничение значения в диапазон.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
