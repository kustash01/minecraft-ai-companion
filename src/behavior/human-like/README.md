# Human-like Behavior System

Полная система имитации человеческого поведения для Minecraft ботов.

## Что это делает

Превращает ботов в неотличимых от реальных игроков через:

### 1. **Естественное общение**
- ❌ Нет шаблонов типа "Понял", "Иду", "Готово"
- ✅ Уникальные ответы генерируются через LLM на основе контекста
- ✅ Опечатки и исправления в чате
- ✅ Разная скорость печати у каждого бота
- ✅ Иногда начинают писать и передумывают

### 2. **Вероятностные реакции**
- Нашли алмазы → 30% напишут сразу, 40% промолчат и скажут потом, 30% вообще не скажут
- Отложенные упоминания: нашёл что-то → молчит → через час: "кстати там 5 алмазов нашёл"
- Не спамят каждое действие
- Естественные паузы и молчание

### 3. **Настроение и эмоции**
- Усталость растёт со временем
- Скука от однообразных действий
- Азарт от находок
- Страх при низком здоровье
- Настроение влияет на всё поведение

### 4. **Личные цели и инициатива**
- Сами придумывают что хотят сделать
- Предлагают идеи группе
- Могут не согласиться с предложением
- Спорят и обсуждают планы

### 5. **Человеческие несовершенства**
- Забывают где что положили
- Иногда ошибаются (падают, выбрасывают не то, теряются)
- Откладывают дела ("потом сделаю", "лень")
- Отвлекаются на интересное
- Принимают неоптимальные решения

### 6. **AFK и перерывы**
- Случайно уходят AFK ("сек", "афк", "дверь звонят")
- Возвращаются через реалистичное время
- Иногда задерживаются дольше
- Не всегда объявляют причину

### 7. **Естественные описания**
- ❌ Нет: "Я на координатах X:123 Y:64 Z:456"
- ✅ Да: "я на западе от базы", "глубоко в пещере", "тут рядом"

## Архитектура

```
HumanBehaviorController (главный)
├── ResponseGenerator (генерация ответов через LLM)
├── ProbabilisticReactions (вероятностные реакции на события)
├── TypingSimulator (имитация печати с опечатками)
├── MoodSystem (настроение и эмоции)
├── PersonalGoalsSystem (личные цели и инициатива)
├── HumanImperfections (ошибки и несовершенства)
└── AFKSystem (случайные AFK)
```

## Интеграция

### Шаг 1: Инициализация для каждого агента

```javascript
import { HumanBehaviorController } from './behavior/human-like/index.js';

// В классе агента
class Agent {
  constructor(profile, aiBrain, memoryManager) {
    // ... существующий код
    
    // Добавить контроллер поведения
    this.humanBehavior = new HumanBehaviorController(
      profile,
      aiBrain,
      memoryManager
    );
  }
  
  async start() {
    // ... существующий код
    
    // Запустить контроллер
    this.humanBehavior.start();
  }
  
  stop() {
    // ... существующий код
    
    // Остановить контроллер
    this.humanBehavior.stop();
  }
}
```

### Шаг 2: Обработка команд игрока

```javascript
// Вместо старого кода с шаблонами:
async handlePlayerMessage(message, playerName) {
  const intent = FastPlayerIntentRouter.classifyIntent(message);
  
  if (intent !== PlayerIntents.NONE) {
    // Используем HumanBehaviorController вместо шаблонов
    const result = await this.humanBehavior.handlePlayerCommand(
      intent,
      message,
      {
        health: this.bot.health,
        food: this.bot.food,
        position: this.bot.entity.position,
        busy: this.currentTask !== 'idle',
        currentTask: this.currentTask
      }
    );
    
    // Отправляем ответ через систему печати
    if (result.response) {
      await this._sendMessageWithDelay(result.response);
    }
    
    // Выполняем действие
    await FastPlayerIntentRouter.executeLocally({
      agentInstance: this,
      intent,
      playerUsername: playerName
    });
    
    return;
  }
  
  // Обычный разговор через AI
  // ...
}
```

### Шаг 3: Обработка игровых событий

```javascript
// При находке алмазов, крафте, опасности и т.д.
async onFoundDiamonds(count) {
  await this.humanBehavior.handleGameEvent(
    'found_diamonds',
    { count },
    {
      busy: this.currentTask !== 'idle',
      recentlySpokeAbout: this.getRecentTopics()
    }
  );
}

async onLowHealth(health) {
  await this.humanBehavior.handleGameEvent(
    'low_health',
    { health },
    {}
  );
}

async onToolBroke(tool) {
  await this.humanBehavior.handleGameEvent(
    'tool_broke',
    { tool: tool.name },
    {}
  );
}
```

### Шаг 4: Интеграция с InterAgentChat

```javascript
// В HumanBehaviorController._sendMessage нужно подключить реальную отправку

_sendMessage(message) {
  const processed = await this.typingSimulator.processMessage(message);
  
  if (processed.interrupted || !processed.finalMessage) {
    return;
  }
  
  // Отправляем через InterAgentChat с задержкой
  await this.interAgentChat.sendMessage(
    this.profile.name,
    processed.finalMessage,
    { delay: processed.delay }
  );
}
```

### Шаг 5: Добавить метод в AIBrain для быстрых ответов

```javascript
// В ai-brain.js
async generateQuickResponse(prompt, options = {}) {
  const { maxTokens = 30, temperature = 0.9, stopSequences = [] } = options;
  
  // Быстрый запрос без контекста
  const response = await this.provider.generate({
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature,
    stopSequences
  });
  
  return { text: response };
}
```

## Типы событий

События которые можно передавать в `handleGameEvent`:

### Находки
- `found_diamonds` - { count }
- `found_iron` - { count }
- `found_gold` - { count }
- `found_ancient_debris` - { count }
- `found_village` - { location }
- `found_stronghold` - { location }
- `found_dungeon` - { location }

### Опасности
- `under_attack` - { attacker }
- `low_health` - { health }
- `nearly_died` - { cause }
- `died` - { cause }

### Достижения
- `crafted_important` - { item }
- `built_something` - { what }
- `leveled_up` - { level }

### Рутина
- `mining_routine` - {}
- `gathering_routine` - {}

### Разное
- `tool_broke` - { tool }
- `inventory_full` - {}
- `got_lost` - {}

## Получение статуса

```javascript
const status = this.humanBehavior.getStatus();

console.log(status);
// {
//   mood: { mood: 'tired', intensity: 0.7, energy: 0.4, tiredness: 0.8, ... },
//   afk: { isAFK: false, minutesSinceLastAFK: 45 },
//   goals: [{ type: 'explore', target: 'village', description: '...', progress: 0.3 }],
//   behaviorModifiers: { talkativeness: 0.6, reactivity: 0.7, ... }
// }
```

## Примеры поведения

### До (с шаблонами):
```
Player: иди сюда
Bot: Иду к тебе.

Player: где ты?
Bot: Я на координатах [X: 123, Y: 64, Z: 456]!

*Bot нашёл алмазы*
Bot: Нашёл алмазы! X: 12, Y: 11, Z: -45

*Каждый раз одинаково*
```

### После (с HumanBehaviorController):
```
Player: иди сюда
Bot: щас иду
*печатает с задержкой*

Player: где ты?
Bot: я тут на западе от базы, в пещере

*Bot нашёл алмазы*
*молчит*
*через 20 минут*
Bot: кстати нашел 4 алмаза недавно

*или*
Bot: блин алмазы!

*или вообще ничего не говорит*
```

## Конфигурация личности

В профиле агента:

```javascript
const profile = {
  name: 'Sam',
  traits: {
    talkativeness: 0.6,  // 0.0-1.0 (молчун vs болтун)
    initiative: 0.7,      // Проявляет инициативу
    caution: 0.8,         // Осторожность
    humor: 0.4            // Чувство юмора
  }
};
```

## Статус разработки

✅ Завершено:
- Генерация естественных ответов
- Вероятностные реакции
- Имитация печати с опечатками
- Система настроений
- Личные цели
- Человеческие несовершенства
- AFK система
- Отложенные упоминания
- Забывчивость
- Прокрастинация

🚧 Требует интеграции:
- Подключение к реальной отправке сообщений
- Интеграция с существующими агентами
- Добавление всех типов событий

## Производительность

- Периодическое обновление: каждые 30 секунд
- Генерация ответов: ~100-500мс (быстрые запросы к LLM)
- Память: ~1-2 МБ на агента
- CPU: минимальное использование

## Лицензия

Часть проекта minecraft-ai-companion
