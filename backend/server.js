// backend/server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import OpenAI from "openai";

// ----------------------------------------------------
// 1) Configuração básica
// ----------------------------------------------------
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Resolver __dirname (ESModules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta do frontend
const frontendDir = path.join(__dirname, "../frontend");
app.use(express.static(frontendDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

// ----------------------------------------------------
// 2) Cliente OpenAI
// ----------------------------------------------------
if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[AVISO] OPENAI_API_KEY não definida. Configure o arquivo .env na pasta backend."
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Prompt de sistema: como o modelo deve se comportar
const SYSTEM_PROMPT = `
Você é um tutor de Matemática especializado em função quadrática, integrado ao GeoGebra.

DADOS QUE VOCÊ RECEBE:
- "mode": tipo de interação (explain, challenge, check, chat, etc.).
- "message": texto digitado pelo aluno.
- "ggbState": objeto com { a, b, c, x1, x2, vertex, areaRect }.
- "history": histórico simples de mensagens.

SUA FUNÇÃO:
- Explicar a situação atual do gráfico de f(x) = ax² + bx + c.
- Ajudar o aluno a resolver problemas, interpretar o gráfico, calcular vértice, raízes, área etc.
- Orientar manipulações no GeoGebra.

REGRAS MUITO IMPORTANTES:

1) USE APENAS ggbState
- Não invente valores numéricos.
- Se ggbState.x1 ou ggbState.x2 forem null ou não numéricos, NÃO chute raízes.
  Diga que não conseguiu ler as raízes no GeoGebra.
- Se ggbState.x1 e ggbState.x2 forem números, use esses valores como aproximações das raízes.
- Não conclua que as raízes são 0 e 0 a menos que ggbState.x1 e ggbState.x2 sejam realmente próximos de 0.

2) NÃO MINTA SOBRE O GEO GEBRA
- Você SÓ consegue alterar o GeoGebra por meio do campo "actions".
- NUNCA diga "eu atualizei o gráfico", "eu movi o vértice" ou "eu mudei a função"
  se NÃO estiver devolvendo ações que realmente fazem isso.
- Se quiser apenas orientar o aluno, use frases como:
  "Você pode alterar o valor de a para ..." ou
  "No GeoGebra, clique em ...".
- Só use frases do tipo "Atualizei os coeficientes para ..." quando também
  devolver ações coerentes.

3) COMO USAR "actions"
Você pode devolver uma lista de ações no formato:

"actions": [
  { "command": "setValue", "object": "a", "value": -0.5 },
  { "command": "setValue", "object": "b", "value": 1 },
  { "command": "setValue", "object": "c", "value": -1 }
]

Comandos disponíveis:
- "setValue": altera o valor de um objeto numérico (ex: a, b, c, A).
- "setPoint": altera coordenadas de um ponto (value: {"x": número, "y": número}).
- "setVisible": mostra/esconde um objeto booleano ou gráfico.

USE actions sempre que:
- o aluno pedir "mude", "atualize", "traduza", "faça a translação",
  "ligue/desligue" etc.
- você afirmar que alterou a função, o vértice ou qualquer elemento.

4) FORMA DAS RESPOSTAS
- SEMPRE responda em português, em tom de professor de Ensino Médio claro e direto.
- Use explicações curtas e didáticas.
- Você PODE conduzir passo a passo, mas evite textos enormes.

5) FORMATO OBRIGATÓRIO DA SAÍDA
Você DEVE responder SEMPRE em JSON:

{
  "reply": "texto que será mostrado ao aluno",
  "actions": [
    {
      "command": "setValue" | "setVisible" | "setPoint",
      "object": "nomeNoGeoGebra",
      "value":  número ou { "x": número, "y": número }
    },
    ...
  ]
}

- Se não houver ações, use "actions": [].
- Não devolva nenhum outro campo.
`;

// ----------------------------------------------------
// 3) Função para chamar a OpenAI
// ----------------------------------------------------
async function callOpenAI(mode, message, ggbState, history) {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini", // pode trocar por outro modelo se quiser
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            mode,
            message,
            ggbState,
            history,
          }),
        },
      ],
    });

    const content = completion.choices[0].message.content;
    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // fallback conservador se o modelo escapar do formato
      parsed = {
        reply:
          "Tive um problema ao interpretar a resposta da IA. Resumo: " +
          content,
        actions: [],
      };
    }

    if (!parsed.reply) {
      parsed.reply = "Não consegui gerar uma explicação adequada.";
    }
    if (!Array.isArray(parsed.actions)) {
      parsed.actions = [];
    }

    return parsed;
  } catch (err) {
    console.error("Erro ao chamar OpenAI:", err);
    return {
      reply:
        "Ocorreu um erro ao falar com a OpenAI. Verifique a chave de API e a conexão. Enquanto isso, analise o gráfico: como o valor de a influencia a concavidade da parábola?",
      actions: [],
    };
  }
}

// ----------------------------------------------------
// 4) Rota da IA
// ----------------------------------------------------
app.post("/api/ai", async (req, res) => {
  const { mode, message, ggbState, history } = req.body || {};

  if (!ggbState) {
    return res.json({
      reply: "Ainda não consegui ler o estado do GeoGebra.",
      actions: [],
    });
  }

  // Atalho local para resetar a função inicial sem chamar a IA
  if (message && message.toLowerCase().includes("resetar")) {
    return res.json({
      reply:
        "Função resetada para o modelo inicial f(x) = -0,5x² + 2. Explore novamente o gráfico e peça uma nova explicação.",
      actions: [
        { command: "setValue", object: "a", value: -0.5 },
        { command: "setValue", object: "b", value: 0 },
        { command: "setValue", object: "c", value: 2 },
      ],
    });
  }

  const aiResult = await callOpenAI(mode, message, ggbState, history);
  return res.json(aiResult);
});

// ----------------------------------------------------
// 5) Iniciar servidor
// ----------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor IA + frontend em http://localhost:${PORT}`);
});
