async function run() {
  const data = {
    id: "global",
    defaultWhatsAppProvider: "evolution_go",
    defaultAiProvider: "openai",
    evolutionUrl: "",
    evolutionGlobalToken: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    baseAiPrompt: "",
    updatedAt: new Date().toISOString()
  };

  try {
    const res = await fetch('http://localhost:3333/api/v1/admin/integrations/config', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${text}`);
  } catch(e) {
    console.error(e);
  }
}

run();
