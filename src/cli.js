import { config } from '../config/default.js';
import { createLogger } from './utils/logger.js';
import { CompanyOrchestrator } from './agents/company-orchestrator.js';
import { MinecraftAICompanion } from './index.js';

const logger = createLogger('MAIN');

const isCompanyMode = process.argv.includes('--company') || process.env.COMPANY_MODE === 'true';
const runner = isCompanyMode ? new CompanyOrchestrator(config) : new MinecraftAICompanion();

async function shutdown(signal) {
  logger.info(`Получен сигнал ${signal}, корректное завершение...`);
  try {
    await runner.stop();
  } catch (err) {
    logger.warn(`Ошибка при завершении: ${err.message}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

let isLoggingError = false;
process.on('uncaughtException', (error) => {
  if (error?.code === 'EPIPE' || error?.syscall === 'write') return;
  if (isLoggingError) return;
  isLoggingError = true;
  try {
    logger.error(`Необработанное исключение: ${error.stack || error.message}`);
  } catch (_) {}
  isLoggingError = false;
});

process.on('unhandledRejection', (reason) => {
  if (isLoggingError) return;
  isLoggingError = true;
  try {
    logger.error(`Необработанный rejection: ${reason?.stack || reason}`);
  } catch (_) {}
  isLoggingError = false;
});

logger.info(`Режим запуска: ${isCompanyMode ? 'Компания из 6 игроков (--company)' : `Одиночный бот-компаньон (${config.minecraft.username})`}`);

runner.start().catch((error) => {
  logger.error(`Ошибка запуска: ${error.stack || error.message}`);
  process.exitCode = 1;
});
