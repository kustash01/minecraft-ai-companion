export function registerCommunicationTools(registry, { bot }) {
  registry.register({
    name: 'say_in_chat',
    description: 'Broadcasts an autonomous message to Minecraft chat. DO NOT use this when answering or conversing with a player (your text output is already sent directly to chat).',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    },
    handler: async (args) => {
      try {
        bot.chat(args.message);
        return { success: true, data: `Message sent: ${args.message}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });

  registry.register({
    name: 'whisper',
    description: 'Whispers a message to a specific player.',
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string' },
        message: { type: 'string' }
      },
      required: ['playerName', 'message']
    },
    handler: async (args) => {
      try {
        bot.whisper(args.playerName, args.message);
        return { success: true, data: `Whispered to ${args.playerName}: ${args.message}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });
}
