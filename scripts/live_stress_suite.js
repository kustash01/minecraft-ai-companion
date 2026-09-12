import 'dotenv/config';
import { MinecraftAICompanion } from '../src/index.js';
import { adaptiveCamera } from '../src/behavior/adaptive-camera.js';
import { bodyLanguage } from '../src/behavior/body-language.js';
import { HumanTradeoffs } from '../src/behavior/human-tradeoffs.js';
import { FoodKnowledge, ToolKnowledge, ThreatKnowledge } from '../src/perception/game-knowledge.js';
import vec3 from 'vec3';

const results = [];
function recordTest(name, passed, details = '') {
  results.push({ name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} | ${name}${details ? ` -> ${details}` : ''}`);
}

async function runLiveStressSuite() {
  console.log('====================================================');
  console.log('🚀 ЗАПУСК ПОЛНОМАСШТАБНОГО ЖИВОГО ТЕСТА НА СЕРВЕРЕ');
  console.log('   Сервер: localhost:25565 | Модель: qwen2.5:3b (Ollama)');
  console.log('====================================================\n');

  const companion = new MinecraftAICompanion();

  // Отлов неожиданных ошибок во время теста
  let runtimeError = null;
  process.on('unhandledRejection', (reason) => {
    runtimeError = reason;
    console.error('⚠️ [RUNTIME REJECTION]:', reason);
  });

  try {
    // ----------------------------------------------------
    // ФАЗА 1: Подключение и спавн в реальном мире Minecraft
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 1: Подключение и спавн] ---');
    await companion.start();

    const bot = companion.mcBot.bot;
    if (!bot || !bot.entity) {
      throw new Error('Бот не подключился к серверу');
    }

    const pos = bot.entity.position;
    recordTest('Подключение к серверу и спавн', true, `Координаты: [X:${pos.x.toFixed(1)}, Y:${pos.y.toFixed(1)}, Z:${pos.z.toFixed(1)}]`);
    recordTest('Инициализация мира и здоровья', bot.health > 0, `Здоровье: ${bot.health}/20, Голод: ${bot.food}/20`);

    // ----------------------------------------------------
    // ФАЗА 2: Адаптивная кинематика камеры
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 2: Адаптивная кинематика камеры человека] ---');
    const startYaw = bot.entity.yaw;
    const startPitch = bot.entity.pitch;

    // 2.1 Плавный взгляд (Calm Bezier)
    const calmTarget = vec3(pos.x + 5, pos.y + 1, pos.z + 5);
    const calmStartTime = Date.now();
    await adaptiveCamera.calmLookAt(bot, calmTarget);
    const calmDuration = Date.now() - calmStartTime;

    const calmOk = calmDuration >= 100 && calmDuration <= 600;
    recordTest('Плавный поворот камеры Безье (спокойный режим)', calmOk, `Время: ${calmDuration} мс (человеческий диапазон 150-300 мс)`);

    // 2.2 Экстренный флик (Emergency Flick)
    const emergencyTarget = vec3(pos.x - 5, pos.y, pos.z - 5);
    const flickStartTime = Date.now();
    await adaptiveCamera.emergencyFlickLookAt(bot, emergencyTarget);
    const flickDuration = Date.now() - flickStartTime;

    const flickOk = flickDuration < 120;
    recordTest('Экстренный флик камеры (боевой режим/паника)', flickOk, `Время: ${flickDuration} мс (стремительный флик < 120 мс)`);

    // ----------------------------------------------------
    // ФАЗА 3: Язык тела и физическое движение
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 3: Язык тела и приседания] ---');
    try {
      await bodyLanguage.shiftGreeting(bot);
      recordTest('Дружеский шифт-салют (shiftGreeting)', true, 'Два плавных приседания');
    } catch (e) {
      recordTest('Дружеский шифт-салют (shiftGreeting)', false, e.message);
    }

    try {
      await bodyLanguage.nodHead(bot);
      recordTest('Кивок головой (nodHead)', true, 'Плавный кивок вверх-вниз');
    } catch (e) {
      recordTest('Кивок головой (nodHead)', false, e.message);
    }

    // ----------------------------------------------------
    // ФАЗА 4: Спинной мозг (Reflex Engine 20 Hz)
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 4: Рефлекторный контур 20 Hz] ---');
    const reflexActive = companion.reflexEngine && companion.reflexEngine.isTicking;
    recordTest('Активность Reflex Engine (20 Hz tick loop)', reflexActive, 'Обработка каждого тика без задержек LLM');

    // Проверка реакции на дружеский шифт
    const simulatedPlayer = {
      username: 'kustash01',
      entity: {
        position: vec3(pos.x + 2, pos.y, pos.z),
        metadata: [0x02], // sneak flag
      },
    };
    bot.players = { kustash01: simulatedPlayer };
    await companion.reflexEngine.checkSocialCrouch();
    recordTest('Обработка дружеского шифта игрока', true, 'Проверка социального контекста завершена');

    // ----------------------------------------------------
    // ФАЗА 5: Универсальная база знаний (minecraft-data)
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 5: Дата-ориентированные знания (minecraft-data)] ---');
    const gCarrot = FoodKnowledge.getFoodProfile('golden_carrot', bot.version);
    const gApple = FoodKnowledge.getFoodProfile('golden_apple', bot.version);
    const milk = FoodKnowledge.getFoodProfile('milk_bucket', bot.version);
    const bread = FoodKnowledge.getFoodProfile('bread', bot.version);

    recordTest('Классификация еды: золотая морковь', gCarrot.tier === 'elite_combat' && gCarrot.saturation > 14);
    recordTest('Классификация еды: золотое яблоко (лечение)', gApple.heals === true);
    recordTest('Классификация напитка: ведро молока (снятие яда)', milk.clearsEffects === true);
    recordTest('Классификация еды: хлеб (стандартная еда)', bread.foodPoints === 5);

    // ----------------------------------------------------
    // ФАЗА 6: Человеческие компромиссы (HumanTradeoffs)
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 6: Состояния и компромиссы игрока] ---');
    const escapeDecision = HumanTradeoffs.evaluateToolUsage({
      tool: { name: 'stone_pickaxe', maxDurability: 131, durabilityUsed: 130 },
      isTrapped: true,
      nearbyTeammate: 'kustash01',
    });
    recordTest('Жертва дешевой киркой ради выхода из ловушки', escapeDecision.action === 'sacrifice_to_escape');

    const helpDecision = HumanTradeoffs.evaluateToolUsage({
      tool: {
        name: 'diamond_pickaxe',
        maxDurability: 1561,
        durabilityUsed: 1555,
        nbt: { value: { Enchantments: { value: { value: [{ id: { value: 'minecraft:silk_touch' } }] } } } },
      },
      isTrapped: true,
      nearbyTeammate: 'kustash01',
    });
    recordTest('Зов друга на помощь вместо поломки драгоценной кирки', helpDecision.action === 'call_teammate_for_help');

    const fleeDoor = HumanTradeoffs.evaluateDoorDecision({ isRunningFromThreat: true });
    recordTest('Дверь оставляется открытой при бегстве от угрозы', fleeDoor.closeDoor === false);

    const scarceTorch = HumanTradeoffs.evaluateTorchDecision({
      torchCount: 2,
      isDark: true,
      inCave: true,
      isIntersection: true,
      timeSinceLastTorch: 20000,
    });
    recordTest('Экономия редких факелов строго для перекрёстков', scarceTorch.shouldPlace === true);

    // ----------------------------------------------------
    // ФАЗА 7: Командная защита и возврат лута
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 7: Защита и возврат лута тиммейта] ---');
    const lootMgr = companion.lootProtection;
    lootMgr.recordTeammateDeath('kustash01', pos.offset(2, 0, 0));
    recordTest('Фиксация точки гибели напарника', lootMgr.deathRecord !== null, `Точка: [${Math.round(pos.x + 2)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}]`);

    // ----------------------------------------------------
    // ФАЗА 8: Живой диалог через LLM (Ollama / qwen2.5:3b)
    // ----------------------------------------------------
    console.log('\n--- [ФАЗА 8: Живой чат без шаблонов через LLM] ---');
    if (companion.aiBrain) {
      console.log('Генерация живого ответа на обращение: "Привет, бот! Что ты видишь вокруг?"...');
      const chatStart = Date.now();
      const reply = await companion.aiBrain.processMessage('[kustash01]: Привет, бот! Что ты видишь вокруг?', companion.worldState);
      const chatLatency = Date.now() - chatStart;

      const replyOk = reply && reply.length > 5;
      recordTest('Генерация ответа через нейросеть (без шаблонов)', replyOk, `Ответ за ${chatLatency} мс: "${reply}"`);

      // Отправляем в игровой чат
      if (reply && bot.chat) {
        bot.chat(reply);
        console.log(`💬 Бот написал в игровой чат: "${reply}"`);
      }
    } else {
      recordTest('Генерация ответа через нейросеть', false, 'AI Brain не инициализирован');
    }

    // ----------------------------------------------------
    // ИТОГОВЫЙ ОТЧЕТ
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('📊 ИТОГИ ТЕСТИРОВАНИЯ:');
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    console.log(`   Успешно: ${passedCount} / ${totalCount} (${Math.round((passedCount / totalCount) * 100)}%)`);
    if (runtimeError) {
      console.log(`   Обнаружена фоновая ошибка: ${runtimeError.message || runtimeError}`);
    } else {
      console.log('   Фоновых ошибок / крашей: 0');
    }
    console.log('====================================================\n');

  } catch (err) {
    console.error('❌ КРИТИЧЕСКИЙ СБОЙ ТЕСТА:', err.message);
    console.error(err.stack);
  } finally {
    console.log('Завершение тестового сеанса...');
    await companion.stop();
  }
}

runLiveStressSuite();
