/**
 * Враппер для действий с интеграцией системы человекоподобности
 */

export class HumanActionWrapper {
  constructor(humanController, bot) {
    this.humanController = humanController;
    this.bot = bot;
  }

  /**
   * Выполняет действие с проверкой через систему человекоподобности
   */
  async executeAction(action, originalExecutor, context = {}) {
    if (!this.humanController) {
      // Fallback — выполняем напрямую
      return await originalExecutor(action);
    }

    // Проверяем действие через систему человекоподобности
    const actionResult = await this.humanController.processAction(action, {
      ...context,
      health: this.bot?.health,
      food: this.bot?.food,
      position: this.bot?.entity?.position,
    });

    if (!actionResult.allowed) {
      // Действие отложено
      return {
        executed: false,
        reason: actionResult.reason,
        retry: actionResult.delay || 5000,
      };
    }

    // Добавляем естественную задержку реакции
    await this._sleep(actionResult.reactionTime);

    // Пауза на раздумье
    if (actionResult.pauseBefore) {
      await this._sleep(actionResult.pauseBefore);
    }

    // Выполняем действие
    const result = await originalExecutor(action);

    // Реакции на ошибки
    if (actionResult.mistake && this.bot?.chat) {
      for (const reaction of actionResult.reactions) {
        if (reaction) {
          await this.bot.chat(reaction);
        }
      }
    }

    return {
      ...result,
      executed: true,
      mistake: actionResult.mistake,
      modifications: actionResult.modifications,
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
