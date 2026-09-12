import { createLogger } from '../utils/logger.js';

const logger = createLogger('PLAN');

export class Planner {
  constructor(memoryManager, toolRegistry, aiBrain) {
    this.memoryManager = memoryManager;
    this.toolRegistry = toolRegistry;
    this.aiBrain = aiBrain;
    this.activePlan = null;
    this.isExecuting = false;
  }

  /**
   * Создаёт структурированный план.
   * @param {string} goal - Главная цель плана
   * @param {Array<string>} stepDescriptions - Список шагов
   * @returns {Object} объект плана
   */
  createPlan(goal, stepDescriptions) {
    const plan = {
      id: 'plan_' + Date.now(),
      goal,
      status: 'in_progress',
      createdAt: Date.now(),
      currentStepIndex: 0,
      steps: stepDescriptions.map((desc, idx) => ({
        index: idx,
        description: desc,
        status: 'pending',
        result: null,
      })),
    };

    if (plan.steps.length > 0) {
      plan.steps[0].status = 'in_progress';
    }

    this.activePlan = plan;
    if (this.memoryManager) {
      this.memoryManager.shortTerm.setPlan(plan);
      this.memoryManager.shortTerm.setTask(goal);
    }

    logger.info(`[ПЛАН СОЗДАН] Цель: "${goal}" (${plan.steps.length} шагов)`);
    for (let i = 0; i < plan.steps.length; i++) {
      logger.info(`  ${i + 1}. ${plan.steps[i].description}`);
    }

    return plan;
  }

  /**
   * Получает текущий активный план.
   */
  getActivePlan() {
    return this.activePlan;
  }

  /**
   * Отмечает шаг как выполненный и переходит к следующему.
   */
  completeStep(index, result = null) {
    if (!this.activePlan || !this.activePlan.steps[index]) return null;

    this.activePlan.steps[index].status = 'completed';
    this.activePlan.steps[index].result = result;
    logger.info(`[ШАГ ВЫПОЛНЕН] Шаг ${index + 1}: ${this.activePlan.steps[index].description}`);

    const nextIndex = index + 1;
    if (nextIndex < this.activePlan.steps.length) {
      this.activePlan.currentStepIndex = nextIndex;
      this.activePlan.steps[nextIndex].status = 'in_progress';
      logger.info(`[СЛЕДУЮЩИЙ ШАГ] Шаг ${nextIndex + 1}: ${this.activePlan.steps[nextIndex].description}`);
    } else {
      this.activePlan.status = 'completed';
      logger.info(`🎉 [ПЛАН ЗАВЕРШЁН] Цель "${this.activePlan.goal}" успешно достигнута!`);
    }

    if (this.memoryManager) {
      this.memoryManager.shortTerm.setPlan(this.activePlan);
    }

    return this.activePlan;
  }

  /**
   * Отмечает шаг как проваленный.
   */
  failStep(index, error = null) {
    if (!this.activePlan || !this.activePlan.steps[index]) return null;

    this.activePlan.steps[index].status = 'failed';
    this.activePlan.steps[index].result = error;
    this.activePlan.status = 'failed';
    logger.warn(`❌ [ШАГ ПРОВАЛЕН] Шаг ${index + 1}: ${this.activePlan.steps[index].description} (${error || 'ошибка'})`);

    if (this.memoryManager) {
      this.memoryManager.shortTerm.setPlan(this.activePlan);
    }

    return this.activePlan;
  }

  /**
   * Пересматривает план при возникновении препятствий.
   */
  revisePlan(newSteps) {
    if (!this.activePlan) return null;

    logger.info(`[ПЕРЕСМОТР ПЛАНА] Старый план обновляется новыми ${newSteps.length} шагами`);
    const completed = this.activePlan.steps.filter(s => s.status === 'completed');

    const freshSteps = newSteps.map((desc, idx) => ({
      index: completed.length + idx,
      description: desc,
      status: idx === 0 ? 'in_progress' : 'pending',
      result: null,
    }));

    this.activePlan.steps = [...completed, ...freshSteps];
    this.activePlan.currentStepIndex = completed.length;
    this.activePlan.status = 'in_progress';

    if (this.memoryManager) {
      this.memoryManager.shortTerm.setPlan(this.activePlan);
    }

    return this.activePlan;
  }

  /**
   * Отменяет текущий план.
   */
  cancelPlan(reason = 'Отменено пользователем') {
    if (!this.activePlan) return false;

    this.activePlan.status = 'cancelled';
    logger.warn(`[ПЛАН ОТМЕНЁН] Причина: ${reason}`);
    this.activePlan = null;

    if (this.memoryManager) {
      this.memoryManager.shortTerm.clearTask();
    }

    return true;
  }
}
