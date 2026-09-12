import { createLogger } from '../utils/logger.js';

const logger = createLogger('FAST_PLAYER_INTENT');

export const PlayerIntents = {
  STOP: 'STOP',
  FOLLOW: 'FOLLOW',
  WAIT: 'WAIT',
  COME_HERE: 'COME_HERE',
  HELP: 'HELP',
  WHERE_ARE_YOU: 'WHERE_ARE_YOU',
  CALL_NAME: 'CALL_NAME',
  NONE: 'NONE',
};

// Gameplay and speech are separate decisions.  The fast path reports what
// happened to the action; callers may decide later whether a human response
// is appropriate.
export const FastIntentStatus = Object.freeze({
  UNRECOGNIZED: 'unrecognized',
  REJECTED: 'rejected',
  ACCEPTED: 'accepted',
  COMPLETED: 'completed',
  NOOP: 'noop',
  FAILED: 'failed',
});

export const ResponseDisposition = Object.freeze({
  NONE: 'none',
  IMMEDIATE: 'immediate',
  DEFERRED: 'deferred',
});

// ACKNOWLEDGEMENTS removed - responses are now generated dynamically via HumanBehaviorController
// This eliminates robotic template phrases and creates unique, context-aware responses

/**
 * FastPlayerIntentRouter — мгновенное распознавание базовых команд игрока
 * и их прямое исполнение на локальном уровне без ожидания LLM.
 */
export class FastPlayerIntentRouter {
  static isGameplayMutation(intent) {
    return [
      PlayerIntents.STOP,
      PlayerIntents.WAIT,
      PlayerIntents.FOLLOW,
      PlayerIntents.COME_HERE,
      PlayerIntents.HELP,
    ].includes(intent);
  }

  /**
   * Классификация намерения из текста
   * @param {string} content
   * @returns {string} PlayerIntents enum
   */
  static classifyIntent(content) {
    const raw = content.toLowerCase().trim();
    // Очищаем от знаков препинания
    const clean = raw.replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = clean.split(' ');
    const hasStem = (...stems) => words.some((word) => stems.some((stem) => word.startsWith(stem)));
    const isQuestion = /\?|^(куда|где|почему|зачем|когда|кто|что|как)\b/.test(raw);

    // 0. WHERE ARE YOU
    if (
      clean.includes('где ты') ||
      clean.includes('ты где') ||
      clean.includes('где вы') ||
      clean.includes('вы где') ||
      clean.includes('где находишься') ||
      clean.includes('где стоишь') ||
      clean.includes('где бегаешь') ||
      clean.includes('где сейчас') ||
      clean.includes('where are you')
    ) {
      return PlayerIntents.WHERE_ARE_YOU;
    }

    // 1. STOP
    if (
      hasStem('стоп', 'стой', 'останов', 'замри', 'тормоз', 'хватит', 'прекрат', 'отмен') ||
      clean.includes('не двигайся') || clean.includes('не двигайтесь') || clean.includes('хватит идти') ||
      clean.includes('ни с места') || clean.includes('стоим здесь')
    ) {
      return PlayerIntents.STOP;
    }

    // 2. WAIT
    if (hasStem('подожд', 'жди', 'погод', 'посто', 'обожд') || words.includes('сек') || words.includes('минуту') || words.includes('wait')) {
      return PlayerIntents.WAIT;
    }

    // 3. COME HERE
    if (
      clean.includes('иди сюда') ||
      clean.includes('идите сюда') ||
      clean.includes('сюда') ||
      clean.includes('ко мне') ||
      clean.includes('беги сюда') ||
      clean.includes('бегите сюда') ||
      clean.includes('подойди') ||
      clean.includes('подойдите') ||
      clean.includes('подбеги') ||
      clean.includes('подбегите') ||
      clean.includes('подойди ко мне') ||
      clean.includes('быстро сюда') ||
      clean.includes('come here') ||
      clean.includes('соберитесь') ||
      clean.includes('собраться') ||
      clean.includes('вернитесь ко мне') ||
      clean.includes('рядом со мной') ||
      hasStem('подой', 'подбег', 'собер', 'вернит')
    ) {
      return PlayerIntents.COME_HERE;
    }

    // 4. FOLLOW
    if (
      clean.includes('иди за мной') ||
      clean.includes('идите за мной') ||
      clean.includes('следуй за мной') ||
      clean.includes('следуйте за мной') ||
      clean.includes('за мной') ||
      clean.includes('го со мной') ||
      clean.includes('пошли за мной') ||
      clean.includes('пойдём за мной') ||
      clean.includes('пойдем за мной') ||
      clean.includes('идём за мной') ||
      clean.includes('идем за мной') ||
      clean.includes('пошли дальше') ||
      clean.includes('идём дальше') ||
      clean.includes('идем дальше') ||
      clean.includes('follow me') ||
      clean.includes('не отставай') ||
      clean.includes('не отставайте') ||
      clean.includes('держитесь рядом') ||
      clean.includes('держись рядом') ||
      clean.includes('вместе идём') ||
      (!isQuestion && (
        hasStem('пош', 'пойд', 'погнал', 'след', 'идём', 'идем', 'поехал', 'продолж', 'возобнов', 'двиг') ||
        words.includes('вперёд') || words.includes('вперед') || words.includes('follow')
      ))
    ) {
      return PlayerIntents.FOLLOW;
    }

    // 5. HELP
    if (
      clean.includes('на помощь') || clean.includes('помоги мне') || clean.includes('помогите мне') || clean.includes('срочно помощь') ||
      hasStem('помог', 'спас', 'выруч', 'прикр', 'защит') || words.includes('хэлп') || words.includes('хелп') || words.includes('help')
    ) {
      return PlayerIntents.HELP;
    }

    // 6. CALL NAME (Just calling the bot)
    const nameAliases = [
      'сэм', 'сам', 'сээм', 'сээээм', 'эй сэм',
      'макс', 'максим', 'эй макс',
      'джек', 'джеки', 'эй джек',
      'райан', 'райн', 'эй райан',
      'алекс', 'саша', 'эй алекс',
      'лео', 'леон', 'эй лео',
      'ребят', 'парни', 'ребята', 'команда',
    ];
    if (nameAliases.includes(clean) || (clean.startsWith('эй ') && words.length <= 2)) {
      return PlayerIntents.CALL_NAME;
    }

    return PlayerIntents.NONE;
  }

  /**
   * Получить фразу подтверждения в характере персонажа
   * DEPRECATED: Now handled by HumanBehaviorController for dynamic, natural responses
   * This method is kept for backward compatibility but should return null
   * to signal that response generation should be delegated to HumanBehaviorController
   * @param {string} agentName
   * @param {string} intent
   * @returns {null}
   */
  static getAcknowledgement(agentName, intent) {
    // Response generation is now handled by HumanBehaviorController
    // Return null to signal that dynamic generation is needed
    return null;
  }

  /**
   * Мгновенное локальное исполнение команды на боте
   * @param {Object} options
   * @param {Object} [options.agentInstance]
   * @param {Object} [options.movementController]
   * @param {Object} [options.bot]
   * @param {string} options.intent
   * @param {string} options.playerUsername
   * @returns {Promise<{ executed: boolean, ack: string }>}
   */
  static async executeLocally({ agentInstance = null, movementController = null, bot = null, intent, playerUsername }) {
    const activeBot = bot || agentInstance?.mcBot?.bot;
    const activeMovement = movementController || agentInstance?.movementController;
    const agentName = agentInstance?.name || activeBot?.username || 'CompanionBot';
    const actionId = `${agentName}:fast:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const generation = agentInstance?.activeGeneration ?? null;

    if ((!agentInstance && !activeMovement && !activeBot) || intent === PlayerIntents.NONE) {
      return {
        actionId,
        generation,
        executed: false,
        status: intent === PlayerIntents.NONE ? FastIntentStatus.UNRECOGNIZED : FastIntentStatus.REJECTED,
        responseDisposition: ResponseDisposition.NONE,
        ack: null,
        outcome: null,
        error: (agentInstance || activeMovement || activeBot) ? null : 'MISSING_AGENT',
      };
    }

    // A live AgentInstance owns the runtime lifecycle. Keep the direct
    // branch below only for isolated compatibility tests and lightweight
    // adapters that do not expose the runtime facade.
    if (typeof agentInstance?.submitFastIntent === 'function') {
      return agentInstance.submitFastIntent({ intent, playerUsername, generation });
    }

    const result = ({ status, outcome = null, error = null, responseDisposition = ResponseDisposition.DEFERRED, expectedObservation = null, ack = null } = {}) => ({
      actionId,
      generation,
      executed: [FastIntentStatus.ACCEPTED, FastIntentStatus.COMPLETED, FastIntentStatus.NOOP].includes(status),
      status,
      responseDisposition,
      ack,
      outcome,
      error,
      expectedObservation,
    });

    logger.info(`[${agentName}] Мгновенное локальное исполнение намерения [${intent}] от игрока ${playerUsername}`);


    try {
      switch (intent) {
        case PlayerIntents.STOP:
          agentInstance?.preemptRuntimeForLegacy?.();
          if (activeMovement) activeMovement.stop();
          else if (activeBot?.pathfinder) { activeBot.pathfinder.stop(); activeBot.clearControlStates?.(); }
          if (agentInstance) agentInstance.currentTask = 'waiting';
          return result({ status: FastIntentStatus.COMPLETED, outcome: { action: 'stop' }, expectedObservation: { movementMode: 'idle' } });

        case PlayerIntents.WAIT:
          agentInstance?.preemptRuntimeForLegacy?.();
          if (activeMovement) activeMovement.wait();
          else if (activeBot?.pathfinder) { activeBot.pathfinder.stop(); activeBot.clearControlStates?.(); }
          if (agentInstance) agentInstance.currentTask = 'waiting';
          return result({ status: FastIntentStatus.COMPLETED, outcome: { action: 'wait' }, expectedObservation: { movementMode: 'waiting' } });

        case PlayerIntents.FOLLOW:
        case PlayerIntents.COME_HERE: {
          agentInstance?.preemptRuntimeForLegacy?.();
          if (activeMovement) {
            await activeMovement.followPlayer(playerUsername, intent === PlayerIntents.COME_HERE ? 2 : 3);
          } else if (activeBot?.pathfinder) {
            const targetPlayer = activeBot.players?.[playerUsername]?.entity
              || Object.entries(activeBot.players || {}).find(([name]) => name.toLowerCase() === String(playerUsername).toLowerCase())?.[1]?.entity;
            if (!targetPlayer) return result({ status: FastIntentStatus.FAILED, responseDisposition: ResponseDisposition.NONE, error: 'PLAYER_NOT_VISIBLE' });
            const pathfinderPkg = await import('mineflayer-pathfinder');
            const { goals } = pathfinderPkg.default || pathfinderPkg;
            activeBot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 3), true);
          } else {
            return result({ status: FastIntentStatus.FAILED, responseDisposition: ResponseDisposition.NONE, error: 'MOVEMENT_UNAVAILABLE' });
          }
          if (agentInstance) agentInstance.currentTask = `following_${playerUsername}`;
          return result({ status: FastIntentStatus.ACCEPTED, outcome: { action: intent === PlayerIntents.FOLLOW ? 'follow' : 'come_here', target: playerUsername }, expectedObservation: { movementMode: 'following', targetPlayer: playerUsername } });
        }

        case PlayerIntents.HELP:
          agentInstance?.preemptRuntimeForLegacy?.();
          if (activeMovement) {
            await activeMovement.followPlayer(playerUsername, 2);
          } else {
            return result({ status: FastIntentStatus.FAILED, responseDisposition: ResponseDisposition.NONE, error: 'MOVEMENT_UNAVAILABLE' });
          }
          if (agentInstance) agentInstance.currentTask = `helping_${playerUsername}`;
          return result({ status: FastIntentStatus.ACCEPTED, outcome: { action: 'help', target: playerUsername }, expectedObservation: { movementMode: 'following', targetPlayer: playerUsername } });

        case PlayerIntents.WHERE_ARE_YOU:
          if (!activeBot?.entity?.position) return result({ status: FastIntentStatus.FAILED, responseDisposition: ResponseDisposition.NONE, error: 'POSITION_UNAVAILABLE' });
          const pos = { x: Math.round(activeBot.entity.position.x), y: Math.round(activeBot.entity.position.y), z: Math.round(activeBot.entity.position.z) };
          return result({ status: FastIntentStatus.COMPLETED, ack: `Я тут: x: ${pos.x}, y: ${pos.y}, z: ${pos.z}`, outcome: { action: 'report_position', position: pos }, expectedObservation: { positionAvailable: true } });

        case PlayerIntents.CALL_NAME:
          return result({ status: FastIntentStatus.NOOP, ack: 'Да, я тут!', outcome: { action: 'acknowledge_call' } });

        default:
          return result({ status: FastIntentStatus.UNRECOGNIZED, responseDisposition: ResponseDisposition.NONE });
      }
    } catch (error) {
      logger.warn(`[${agentName}] Не удалось выполнить [${intent}]: ${error.message}`);
      return result({ status: FastIntentStatus.FAILED, responseDisposition: ResponseDisposition.NONE, error: error.message });
    }
  }
}
