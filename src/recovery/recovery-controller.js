import { createLogger } from '../utils/logger.js';
import { telemetry } from '../utils/telemetry.js';

const logger = createLogger('RECOVERY');

/**
 * RecoveryController — безопасная система восстановления без телепортации
 * и БЕЗ принудительного создания повторных LLM-запросов.
 */
export class RecoveryController {
  /**
   * @param {Object} options
   * @param {string} options.agentName
   * @param {Object} [options.bot]
   * @param {Object} [options.aiBrain]
   * @param {Object} [options.movementController]
   * @param {boolean} [options.debugMode=false]
   */
  constructor({ agentName, bot = null, aiBrain = null, movementController = null, debugMode = false }) {
    this.agentName = agentName;
    this.bot = bot;
    this.aiBrain = aiBrain;
    this.movementController = movementController;
    this.debugMode = debugMode;

    this.monitoringInterval = null;
    this.history = {
      positions: [],
      actions: [],
      tools: new Map(), // toolName -> failures count
    };

    this.recoveryHistory = [];
    this.lastActionTime = Date.now();
    this.issueCooldowns = new Map();
  }

  startMonitoring() {
    if (this.monitoringInterval) return;
    logger.info(`[${this.agentName}] Запуск безопасной системы восстановления...`);

    this.monitoringInterval = setInterval(() => {
      this._runDetectors();
    }, 2000);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info(`[${this.agentName}] Остановка системы восстановления`);
    }
  }

  _runDetectors() {
    const issues = this.check();
    for (const issue of issues) {
      this.recover(issue);
    }
  }

  check() {
    const issues = [];
    if (!this.bot || !this.bot.entity) return issues;

    const pos = this.bot.entity.position;
    this.recordPosition(pos);

    // 1. StuckDetector: позиция не меняется при активном движении
    if (this.history.positions.length >= 8) {
      const first = this.history.positions[0];
      const last = this.history.positions[this.history.positions.length - 1];
      const dist = typeof first.distanceTo === 'function' ? first.distanceTo(last) : 0;
      if (dist < 0.4 && this.bot.pathfinder?.isMoving?.()) {
        issues.push({ type: 'stuck', data: { dist } });
      }
    }

    // 2. PhysicsAnomalyDetector: проверка нахождения в воздухе без движения
    if (this.bot.entity.velocity && !this.bot.entity.onGround && Math.abs(this.bot.entity.velocity.y) < 0.01) {
      issues.push({ type: 'physics_anomaly' });
    }

    // 3. WaterLavaDetector
    const blockAtFeet = typeof this.bot.blockAt === 'function' ? this.bot.blockAt(this.bot.entity.position) : null;
    if (blockAtFeet && (blockAtFeet.name?.includes('water') || blockAtFeet.name?.includes('lava'))) {
      issues.push({ type: 'hazard_liquid', data: { type: blockAtFeet.name } });
    }

    // 4. UnresponsiveDetector: отсутствие активности более 40 секунд при активной задаче или зависшем запросе
    const isExpectingAction =
      (this.aiBrain && this.aiBrain.isProcessing) ||
      (this.movementController && (this.movementController.mode === 'moving_to' || this.movementController.mode === 'following')) ||
      (this.bot?.pathfinder?.isMoving?.());

    const inactiveTime = Date.now() - this.lastActionTime;
    if (inactiveTime > 40000) {
      if (isExpectingAction) {
        issues.push({ type: 'unresponsive', data: { inactiveTime } });
      } else {
        // Если бот просто находится в нормальном режиме ожидания/idle, не считаем это зависанием
        this.lastActionTime = Date.now();
      }
    }

    return issues;
  }

  recover(issue) {
    const now = Date.now();
    const cooldownMs = issue.type === 'hazard_liquid' ? 15000 : 3000;
    const lastRecovery = this.issueCooldowns.get(issue.type) || 0;
    if (now - lastRecovery < cooldownMs) return;
    this.issueCooldowns.set(issue.type, now);

    logger.warn(`[${this.agentName}] Обнаружена проблема [${issue.type}]. Безопасное восстановление.`);
    telemetry.increment('recoveryCount');

    this.recoveryHistory.push({
      time: Date.now(),
      issue,
    });

    if (this.recoveryHistory.length > 20) {
      this.recoveryHistory.shift();
    }

    switch (issue.type) {
      case 'stuck':
        logger.info(`[${this.agentName}] Recovery [stuck]: Локальный сброс pathfinder, микро-прыжок и очистка`);
        if (!this.debugMode && this.bot) {
          if (this.bot.pathfinder) this.bot.pathfinder.stop();
          if (typeof this.bot.setControlState === 'function') {
            this.bot.setControlState('jump', true);
            setTimeout(() => this.bot.setControlState?.('jump', false), 400);
          }
          if (typeof this.bot.clearControlStates === 'function') this.bot.clearControlStates();
        }
        this.history.positions = [];
        this.lastActionTime = Date.now();
        break;

      case 'loop':
        logger.info(`[${this.agentName}] Recovery [loop]: Сброс зацикленных действий`);
        this.history.actions = [];
        this.lastActionTime = Date.now();
        break;

      case 'tool_failure':
        logger.info(`[${this.agentName}] Recovery [tool_failure]: Очистка счётчика ошибок инструмента ${issue.data?.toolName}`);
        this.history.tools.delete(issue.data?.toolName);
        this.lastActionTime = Date.now();
        break;

      case 'physics_anomaly':
        logger.info(`[${this.agentName}] Recovery [physics_anomaly]: Проверка опоры под ногами`);
        if (this.bot?.setControlState) {
          this.bot.setControlState('sneak', true);
          setTimeout(() => this.bot.setControlState?.('sneak', false), 300);
        }
        this.lastActionTime = Date.now();
        break;

      case 'hazard_liquid':
        logger.info(`[${this.agentName}] Recovery [hazard_liquid]: Всплытие на поверхность`);
        if (!this.debugMode && this.bot?.setControlState) {
          this.bot.setControlState('jump', true);
          setTimeout(() => this.bot.setControlState?.('jump', false), 1000);
        }
        this.history.positions = [];
        this.lastActionTime = now;
        break;

      case 'unresponsive':
        // КРИТИЧЕСКИ ВАЖНО: НИКАКИХ ПРИНУДИТЕЛЬНЫХ ВЫЗОВОВ LLM!
        logger.info(`[${this.agentName}] Recovery [unresponsive]: Отмена зависших запросов и переход в LOCAL_MODE`);
        if (this.aiBrain) {
          this.aiBrain.cancelActiveRequest('Unresponsive recovery timeout');
        }
        // Сохраняем локальное движение/следование если оно было активно
        if (this.movementController && this.movementController.mode === 'following') {
          this.movementController.resume();
        }
        this.lastActionTime = Date.now();
        break;

      default:
        this.lastActionTime = Date.now();
        break;
    }
  }

  recordPosition(pos) {
    if (!pos) return;
    this.history.positions.push(
      pos.clone
        ? pos.clone()
        : {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            distanceTo: (other) =>
              Math.sqrt(
                Math.pow(pos.x - other.x, 2) +
                Math.pow(pos.y - other.y, 2) +
                Math.pow(pos.z - other.z, 2)
              ),
          }
    );
    if (this.history.positions.length > 10) {
      this.history.positions.shift();
    }
  }

  recordAction(action) {
    this.lastActionTime = Date.now();
    this.history.actions.push(action);
    if (this.history.actions.length > 10) {
      this.history.actions.shift();
    }

    if (this.history.actions.length >= 3) {
      const len = this.history.actions.length;
      if (
        this.history.actions[len - 1] === this.history.actions[len - 2] &&
        this.history.actions[len - 2] === this.history.actions[len - 3]
      ) {
        this.recover({ type: 'loop', data: { action } });
      }
    }
  }

  recordToolResult(toolName, success) {
    if (success) {
      this.history.tools.delete(toolName);
    } else {
      const count = (this.history.tools.get(toolName) || 0) + 1;
      this.history.tools.set(toolName, count);
      if (count >= 3) {
        this.recover({ type: 'tool_failure', data: { toolName } });
      }
    }
  }

  getRecoveryHistory() {
    return this.recoveryHistory;
  }

  getState() {
    return {
      active: this.monitoringInterval !== null,
      historyLength: this.recoveryHistory.length,
      lastRecovery: this.recoveryHistory[this.recoveryHistory.length - 1] || null,
    };
  }
}
