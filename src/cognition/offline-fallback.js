import logger from '../utils/logger.js';

const clamp01 = (value, fallback = 0.5) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
};

const asList = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
};

const textOf = (value) => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return [value.name, value.description, value.kind, value.type, value.task]
    .filter(Boolean)
    .join(' ');
};

const mergeRecords = (...records) => Object.assign({}, ...records.filter((record) => record && typeof record === 'object' && !Array.isArray(record)));

/** Deterministic intention selection while the language model is offline. */
export class OfflineFallbackEngine {
  constructor({ profile = {}, random = Math.random } = {}) {
    this.profile = profile;
    this.random = random;
    this.isOfflineMode = false;
    this.fallbackActionsCount = 0;
  }

  setOfflineMode(isOffline) {
    if (this.isOfflineMode !== isOffline) {
      this.isOfflineMode = isOffline;
      logger.warn(`[OFFLINE-FALLBACK] AI Connection state changed: ${isOffline ? 'OFFLINE (Fallback Active)' : 'ONLINE'}`);
    }
  }

  /**
   * @param {Object} worldState Mineflayer snapshot (may include behaviour context)
   * @param {string|Object|null} activeGoal Current task or a goal descriptor
   * @param {Object} context Optional traits, habits, routes, commitments and errors
   */
  getFallbackAction(worldState = {}, activeGoal = null, context = {}) {
    this.fallbackActionsCount++;
    const state = worldState && typeof worldState === 'object' ? worldState : {};
    const extra = context && typeof context === 'object' ? context : {};
    const goal = this._normaliseGoal(activeGoal ?? state.activeGoal ?? extra.activeGoal);
    const traits = mergeRecords(this.profile?.traits, state.traits, extra.traits, state.personality?.traits, extra.personality?.traits);
    const habits = mergeRecords(this.profile?.habits, state.habits, extra.habits);
    const routes = asList(extra.savedRoutes ?? state.savedRoutes ?? state.routes);
    const errors = asList(extra.recentErrors ?? state.recentErrors ?? state.errors);
    const commitments = asList(extra.commitments ?? state.commitments ?? state.unfinishedPromises);
    const risk = clamp01(extra.riskTolerance ?? state.riskTolerance ?? traits.risk_attitude, 0.5);
    const recoveryDrive = clamp01(traits.recovery_drive ?? extra.recoveryDrive, 0.5);
    const lossAversion = clamp01(traits.loss_aversion ?? extra.lossAversion, 0.5);
    const thrillSeeking = clamp01(traits.thrill_seeking ?? extra.thrillSeeking, 0.5);
    const hasFood = this._hasFood(state, extra);
    const factors = { goal: goal.text || null, risk, routes: routes.length, recentErrors: errors.length, commitments: commitments.length, hasFood };

    // Safety is deliberately non-negotiable and preserves the original contract.
    if (Number(state.health ?? 20) <= 10) {
      return this._decision('eat_food', 'Оффлайн-режим: здоровье критически низкое', factors, 'safety');
    }

    // A person may recover a loss instead of avoiding the place forever.
    const loss = this._recentLoss(errors);
    if (loss && (goal.recovery || this._routeForRecovery(routes, goal))) {
      if (recoveryDrive >= 0.65 && (risk >= 0.45 || thrillSeeking >= 0.75)) {
        return this._decision('retry_with_adaptation', 'Оффлайн-режим: вернуть потерянное, изменив подход', factors, 'recovery');
      }
      if (lossAversion >= 0.7 || risk < 0.35) {
        return this._decision('prepare_and_return', 'Оффлайн-режим: подготовиться и вернуться к незавершённой задаче', factors, 'recovery');
      }
    }

    // Explicit plans and promises outrank routine wandering, unless night safety wins.
    const plannedAction = this._plannedAction(goal, extra.plan ?? state.unfinishedPlan, commitments);
    const night = this._isNight(state.timeOfDay);
    const stayOutAtNight = Boolean(habits.stayOutAtNight || habits.continueAtNight || goal.urgent)
      && risk >= 0.65 && Number(state.health ?? 20) > 14;
    if (night && !stayOutAtNight && habits.returnHomeAtNight !== false) {
      return this._decision('go_home', 'Оффлайн-режим: ночь, возвращаюсь в безопасное место', factors, 'safety');
    }
    if (plannedAction) {
      return this._decision(plannedAction, 'Оффлайн-режим: продолжаю незавершённый план', factors, 'goal');
    }

    // Hunger matters, but should not erase a clearly urgent, well-prepared goal.
    if (Number(state.food ?? 20) <= 6 && hasFood && (!goal.urgent || Number(state.food ?? 20) <= 3)) {
      return this._decision('eat_food', 'Оффлайн-режим: пополнить еду перед дальнейшими действиями', factors, 'need');
    }

    if (goal.text) {
      const route = this._routeForGoal(routes, goal);
      if (route) return this._decision('follow_saved_route', 'Оффлайн-режим: использую сохранённый маршрут для текущей цели', { ...factors, route }, 'goal');
      if (goal.kind === 'build' && (habits.prepareMaterials || extra.missingMaterials)) {
        return this._decision('prepare_for_goal', 'Оффлайн-режим: сначала готовлю материалы по привычному плану', factors, 'goal');
      }
      if (goal.kind === 'mine' || goal.kind === 'explore' || goal.kind === 'recover') {
        const action = risk >= 0.65 || thrillSeeking >= 0.8 ? 'continue_carefully' : 'prepare_and_return';
        return this._decision(action, 'Оффлайн-режим: держу фокус на личной цели', factors, 'goal');
      }
      return this._decision('resume_goal', 'Оффлайн-режим: возвращаюсь к текущей цели', factors, 'goal');
    }

    if (state.nearbyPlayer || extra.nearbyPlayer || habits.followPlayer) {
      return this._decision('follow_player', 'Оффлайн-режим: держусь рядом с игроком', factors, 'social');
    }
    // Keep the historical default: without a goal, stay with the player.
    return this._decision('follow_player', 'Оффлайн-режим: следование за игроком', factors, 'social');
  }

  _decision(action, reason, factors, priority) {
    return { action, reason, priority, factors };
  }

  _normaliseGoal(raw) {
    if (!raw) return { text: '', kind: null, urgent: false, recovery: false };
    const text = textOf(raw);
    const lower = text.toLowerCase();
    const kind = raw?.kind || raw?.type || (/(шахт|копа|руд|mine|diamond|алмаз)/i.test(lower) ? 'mine'
      : /(стро|build|ферм|farm)/i.test(lower) ? 'build'
        : /(исслед|explor|путеше|найти|recover|вернуть|вещи)/i.test(lower) ? 'explore' : null);
    return {
      text,
      kind,
      urgent: Boolean(raw?.urgent || raw?.priority === 'urgent' || raw?.priority >= 0.9),
      recovery: Boolean(raw?.recovery || /(потерян|умер|вещи|recover|death|lost)/i.test(lower)),
      nextAction: raw?.nextAction || raw?.action || null,
    };
  }

  _plannedAction(goal, plan, commitments) {
    const candidate = goal.nextAction || (typeof plan === 'object' ? plan.nextAction || plan.action : null);
    const allowed = new Set(['eat_food', 'go_home', 'follow_player', 'follow_saved_route', 'resume_goal', 'continue_carefully', 'prepare_and_return', 'prepare_for_goal', 'retry_with_adaptation', 'seek_support_and_return', 'wait']);
    if (allowed.has(candidate)) return candidate;
    if (commitments.length > 0 && (goal.kind === 'build' || goal.kind === 'mine')) return 'honor_commitment';
    return null;
  }

  _routeForGoal(routes, goal) {
    if (!routes.length || !goal.text) return null;
    const lower = goal.text.toLowerCase();
    return routes.find((route) => {
      const text = textOf(route).toLowerCase();
      return route?.forGoal === goal.text || text.includes(lower) || (goal.kind && text.includes(goal.kind));
    }) || null;
  }

  _routeForRecovery(routes, goal) {
    return routes.some((route) => route?.purpose === 'recovery' || /recover|потерян|смерт|вещи/i.test(textOf(route))) || goal.recovery;
  }

  _recentLoss(errors) {
    return errors.find((error) => /death|умер|погиб|lost|потер|убил|вещи/i.test(textOf(error)));
  }

  _hasFood(state, extra) {
    if (extra.hasFood !== undefined) return Boolean(extra.hasFood);
    const inventory = state.inventory || extra.inventory || [];
    if (Array.isArray(inventory)) return inventory.some((item) => /bread|beef|pork|potato|apple|еда|хлеб|мяс|карто|яблок/i.test(textOf(item)) && Number(item.count ?? 1) > 0);
    return Boolean(state.inventorySummary && /bread|beef|pork|potato|apple|еда|хлеб|мяс|карто|яблок/i.test(state.inventorySummary));
  }

  _isNight(timeOfDay) {
    const time = Number(timeOfDay);
    return Number.isFinite(time) && time > 13000 && time < 23000;
  }
}

export const offlineFallback = new OfflineFallbackEngine();
