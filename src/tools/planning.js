/**
 * Регистрирует инструменты планирования для AI.
 */
export function registerPlanningTools(registry, { planner }) {
  if (!planner) return;

  // 1. Создать план
  registry.register({
    name: 'create_plan',
    description: 'Create a multi-step execution plan for a complex task (e.g. build house, get iron armor, explore cave).',
    parameters: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Overall goal of the plan' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered list of concrete steps to achieve the goal',
        },
      },
      required: ['goal', 'steps'],
    },
    handler: async (args) => {
      try {
        const plan = planner.createPlan(args.goal, args.steps);
        const stepsText = plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join('\n');
        return {
          success: true,
          data: `План составлен:\nЦель: ${plan.goal}\nШаги:\n${stepsText}`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // 2. Получить текущий план
  registry.register({
    name: 'get_current_plan',
    description: 'Get the status and steps of the currently active plan.',
    parameters: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const plan = planner.getActivePlan();
        if (!plan) return { success: true, data: 'В данный момент активного плана нет.' };

        const stepsText = plan.steps
          .map((s, i) => {
            const mark = s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '►' : s.status === 'failed' ? '✗' : '○';
            return `${mark} Шаг ${i + 1}: ${s.description} [${s.status}]`;
          })
          .join('\n');

        return {
          success: true,
          data: `План "${plan.goal}" (${plan.status}):\n${stepsText}`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // 3. Завершить шаг плана
  registry.register({
    name: 'complete_step',
    description: 'Mark the current plan step as completed and advance to the next step.',
    parameters: {
      type: 'object',
      properties: {
        stepIndex: { type: 'number', description: 'Index of the completed step (0-based)' },
        result: { type: 'string', description: 'Outcome or result of the step' },
      },
      required: ['stepIndex'],
    },
    handler: async (args) => {
      try {
        const plan = planner.completeStep(args.stepIndex, args.result || 'Готово');
        if (!plan) return { success: false, error: 'Активный план не найден' };

        if (plan.status === 'completed') {
          return { success: true, data: `Все шаги плана "${plan.goal}" успешно завершены!` };
        }

        const nextStep = plan.steps[plan.currentStepIndex];
        return {
          success: true,
          data: `Шаг ${args.stepIndex + 1} завершён. Следующий шаг ${plan.currentStepIndex + 1}: "${nextStep.description}"`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // 4. Пересмотреть план при ошибке
  registry.register({
    name: 'revise_plan',
    description: 'Revise the remaining steps of the plan when an unexpected obstacle or failure occurs.',
    parameters: {
      type: 'object',
      properties: {
        newSteps: {
          type: 'array',
          items: { type: 'string' },
          description: 'New remaining steps to complete the goal',
        },
      },
      required: ['newSteps'],
    },
    handler: async (args) => {
      try {
        const plan = planner.revisePlan(args.newSteps);
        if (!plan) return { success: false, error: 'Нет активного плана для пересмотра' };

        return {
          success: true,
          data: `План обновлён. Осталось шагов: ${plan.steps.length - plan.currentStepIndex}`,
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });

  // 5. Отменить план
  registry.register({
    name: 'cancel_plan',
    description: 'Cancel the current plan and stop all associated actions.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for cancelling the plan' },
      },
    },
    handler: async (args) => {
      try {
        const success = planner.cancelPlan(args.reason || 'Отмена');
        return {
          success,
          data: success ? 'Текущий план отменён.' : 'Нет активного плана.',
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  });
}
