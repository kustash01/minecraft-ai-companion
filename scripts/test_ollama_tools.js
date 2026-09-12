async function test() {
  const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer ollama" },
    body: JSON.stringify({
      model: "qwen2.5:3b",
      messages: [
        { role: "system", content: "You are a Minecraft assistant. If user asks to mine, chop, or follow, call the corresponding function tool immediately." },
        { role: "user", content: "добудь дерево" }
      ],
      tools: [{
        type: "function",
        function: {
          name: "mine_block",
          description: "Mine or chop a block of wood, stone, etc.",
          parameters: {
            type: "object",
            properties: { blockType: { type: "string", description: "e.g. oak_log, wood" } },
            required: ["blockType"]
          }
        }
      }]
    })
  });
  const data = await res.json();
  console.log("RESPONSE:", JSON.stringify(data, null, 2));
}
test();
