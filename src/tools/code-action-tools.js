/**
 * Инструменты исполнения динамического кода и управления библиотекой навыков (Code-as-Action).
 */
export function registerCodeActionTools(registry, { actionSandbox, skillLibrary }) {
  if (actionSandbox) {
    registry.register({
      name: 'run_code',
      description: 'Write and execute asynchronous JavaScript code to interact with Minecraft. Available globals: bot (crouchSpam, goto, humanLook, say, attackEntity), world (findBlock, findBlocks, findEntity, findNearestStation, getBlock, safeDig), inventory (find, count, has, equip, equipOffhand, organizeHotbar, tossTo, getFreeSlots), crafting (canCraft, craft), pathfinder (goto, follow, stop), stations (chest, furnace, crafting_table, bed), skills (deposit_clutter, quick_eat, smelt_items, enchant_gear), mcData, vec3, sleep(ms), sleep.gamerPause(), log(...args). Use this to accomplish complex tasks in one step with self-healing diagnostics.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'The asynchronous JavaScript code body to execute. You can use await sleep(...), await bot.goto(...), await world.safeDig(block), etc.',
          },
          description: {
            type: 'string',
            description: 'Brief description of what this code does in plain words.',
          },
        },
        required: ['code'],
      },
      handler: async (args) => {
        const result = await actionSandbox.execute(args.code);
        if (result.success) {
          return {
            success: true,
            data: typeof result.result === 'object' ? JSON.stringify(result.result) : String(result.result),
            logs: result.logs,
          };
        }
        return {
          success: false,
          error: result.error,
          hint: result.hint,
          line: result.line,
          codeSnippet: result.codeSnippet,
          logs: result.logs,
        };
      },
    });
  }

  if (skillLibrary) {
    registry.register({
      name: 'save_skill',
      description: 'Save a proven, working JavaScript action routine as a reusable skill so it can be called later as skills.<name>(params) without regenerating the code. Code receives "params" object.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique alphanumeric identifier for the skill (e.g. craft_enchant_sword, auto_smelt_iron).',
          },
          description: {
            type: 'string',
            description: 'Short explanation of what the skill achieves and accepted parameters.',
          },
          code: {
            type: 'string',
            description: 'The body of the JavaScript code for the skill. Can use "params" object.',
          },
        },
        required: ['name', 'description', 'code'],
      },
      handler: async (args) => {
        try {
          skillLibrary.saveSkill(args.name, args.code, args.description);
          return {
            success: true,
            data: `Навык "${args.name}" успешно сохранён в библиотеку! Теперь доступен как skills.${args.name}().`,
          };
        } catch (err) {
          return {
            success: false,
            error: err.message,
          };
        }
      },
    });

    registry.register({
      name: 'list_skills',
      description: 'List all currently available reusable skills in the library.',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const skills = skillLibrary.listSkills();
        if (skills.length === 0) {
          return {
            success: true,
            data: 'Библиотека навыков пуста.',
          };
        }
        return {
          success: true,
          data: skills.map(s => `- ${s.name}: ${s.description}`).join('\n'),
          skills,
        };
      },
    });
  }
}
