import { CompanyOrchestrator } from './src/agents/company-orchestrator.js';
import { createLogger } from './src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('FRIENDS_MODE');

/**
 * РЕЖИМ "ДРУЗЬЯ" — Максимальная человечность
 *
 * Отличия от CompanyOrchestrator (рабочий режим):
 * - Боты не работают автономно над задачами
 * - Они живут рядом с тобой и реагируют на мир
 * - Говорят редко и естественно
 * - Помнят тебя и ваши приключения
 * - У каждого своя личность
 */

async function startFriendsMode() {
  logger.info('🎮 Запуск режима ДРУЗЕЙ...');
  logger.info('');
  logger.info('Твои друзья:');
  logger.info('  Sam  — спокойный и наблюдательный');
  logger.info('  Max  — методичный и собранный');
  logger.info('  Jack — легко увлекается');
  logger.info('  Ryan — трудолюбивый и терпеливый');
  logger.info('  Alex — креативный и внимательный');
  logger.info('  Leo  — надёжный и уверенный');
  logger.info('');

  const config = {
    minecraft: {
      host: process.env.MC_HOST || 'localhost',
      port: parseInt(process.env.MC_PORT, 10) || 25565,
      version: process.env.MC_VERSION || '1.20.1',
      auth: process.env.MC_AUTH || 'offline',
    },
    ai: {
      provider: process.env.AI_PROVIDER || 'anthropic',
      model: process.env.AI_MODEL || 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    bot: {
      owner: process.env.BOT_OWNER || 'kustash01',
    },
    friends: {
      // НАСТРОЙКИ ЧЕЛОВЕЧНОСТИ

      // Разговорчивость (0.05 = очень молчаливые, 0.25 = разговорчивые)
      chattiness: 0.12, // 12% событий вызывают реплику

      // Добавлять опечатки (true/false)
      enableTypos: true,

      // Паузы перед ответом (реалистичные задержки печати)
      naturalTyping: true,

      // Использу��ть память о прошлых встречах
      rememberPlayer: true,

      // Автономная жизнь (гуляют, строят, добывают — но не как работники)
      autonomousLife: true,
    },
  };

  logger.info('📋 Конфигурация:');
  logger.info(`   Сервер: ${config.minecraft.host}:${config.minecraft.port}`);
  logger.info(`   Версия: ${config.minecraft.version}`);
  logger.info(`   AI: ${config.ai.provider} (${config.ai.model})`);
  logger.info(`   Разговорчивость: ${config.friends.chattiness * 100}%`);
  logger.info(`   Опечатки: ${config.friends.enableTypos ? 'да' : 'нет'}`);
  logger.info(`   Естественные паузы: ${config.friends.naturalTyping ? 'да' : 'нет'}`);
  logger.info('');

  // Создаём компанию (используем существующую систему, но в режиме "друзей")
  const company = new CompanyOrchestrator({
    agents: ['Sam', 'Max', 'Jack', 'Ryan', 'Alex', 'Leo'],
    baseConfig: config,
    mode: 'friends', // Специальный режим
  });

  // Настройка обработчиков
  company.on('agent:ready', ({ name }) => {
    logger.info(`✅ ${name} подключился к миру`);
  });

  company.on('agent:chat', ({ name, message }) => {
    logger.info(`💬 ${name}: ${message}`);
  });

  company.on('agent:action', ({ name, action }) => {
    logger.debug(`🎬 ${name} делает: ${action}`);
  });

  company.on('error', (err) => {
    logger.error(`❌ Ошибка: ${err.message}`);
  });

  try {
    await company.start();
    logger.info('');
    logger.info('🎉 Твои друзья в игре! Заходи на сервер и поздоровайся с ними.');
    logger.info('');
    logger.info('💡 Советы:');
    logger.info('   - Они не будут отвечать на каждое сообщение (как реальные люди)');
    logger.info('   - Дай им время подумать перед ответом');
    logger.info('   - Если молчат — это нормально, не все события требуют комментария');
    logger.info('   - Упомяни их по имени чтобы привлечь внимание');
    logger.info('   - Они помнят прошлые встречи с тобой');
    logger.info('');
    logger.info('Нажми Ctrl+C чтобы остановить.');

  } catch (err) {
    logger.error(`❌ Не удалось запустить режим друзей: ${err.message}`);
    logger.error(err.stack);
    process.exit(1);
  }
}

// Обработка выхода
process.on('SIGINT', async () => {
  logger.info('');
  logger.info('👋 Твои друзья покидают мир...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('');
  logger.info('👋 Твои друзья покидают мир...');
  process.exit(0);
});

// Запуск
startFriendsMode().catch((err) => {
  logger.error('Критическая ошибка:', err);
  process.exit(1);
});
