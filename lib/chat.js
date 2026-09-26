'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const llm = require('./llm');

const ANALYSIS_FILE   = path.join(process.cwd(), '.byakugan', 'analysis.json');
const EMBEDDINGS_FILE = path.join(process.cwd(), '.byakugan', 'embeddings.json');
const CHAT_PROMPT_FILE = path.join(__dirname, '..', 'templates', 'prompts', 'chat.md');

const TOP_K = 3;       // number of chunks to retrieve per SEARCH query
const MAX_HISTORY = 20; // max messages kept in history (10 turns × 2)

// ─── cosine similarity ────────────────────────────────────────────────────────

function cosine(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ─── retrieval ────────────────────────────────────────────────────────────────

function retrieve(embeddings, queryVector, k) {
  return embeddings
    .map(chunk => ({ ...chunk, score: cosine(queryVector, chunk.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(chunk => chunk.text);
}

// ─── build system prompt ──────────────────────────────────────────────────────

function buildSystemPrompt(projectName, projectSummary, retrievedChunks) {
  if (!fs.existsSync(CHAT_PROMPT_FILE)) {
    throw new Error(`Chat prompt template not found: ${CHAT_PROMPT_FILE}`);
  }
  const template = fs.readFileSync(CHAT_PROMPT_FILE, 'utf8');
  return template
    .split('{{PROJECT_NAME}}').join(projectName)
    .split('{{PROJECT_SUMMARY}}').join(projectSummary)
    .split('{{RETRIEVED_CHUNKS}}').join(retrievedChunks.join('\n\n---\n\n'));
}

// ─── chat loop ────────────────────────────────────────────────────────────────

async function chat() {
  // Load analysis
  if (!fs.existsSync(ANALYSIS_FILE)) {
    throw new Error('analysis.json not found. Run `byakugan analyze <path>` first.');
  }
  let analysis;
  try {
    analysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read analysis.json: ${err.message}`);
  }

  // Load embeddings
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    throw new Error('embeddings.json not found. Run `byakugan analyze <path>` first.');
  }
  let embeddings;
  try {
    embeddings = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to read embeddings.json: ${err.message}`);
  }

  const projectName    = analysis.project.name;
  const projectSummary = analysis.overview.summary;
  const history = [];

  console.log(chalk.cyan(`\n› Chat about ${projectName}`));
  console.log(chalk.gray('  Type your question and press Enter. Type "exit" or Ctrl+C to quit.\n'));

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question(chalk.yellow('You: '), async (input) => {
      const userMessage = input.trim();

      if (!userMessage)                             { askQuestion(); return; }
      if (userMessage.toLowerCase() === 'exit') {
        console.log(chalk.gray('\nGoodbye.\n'));
        rl.close();
        return;
      }

      try {
        // Step 1 — route: does this question need retrieval?
        const route = await llm.routeQuery(userMessage);

        let chunks = [];

        if (route === 'SEARCH') {
          // Step 2 — embed the question
          const queryVector = await llm.embed(userMessage);
          // Step 3 — retrieve top-k relevant chunks
          chunks = retrieve(embeddings, queryVector, TOP_K);
        }

        // Step 4 — build system prompt (with or without retrieved context)
        const systemPrompt = buildSystemPrompt(projectName, projectSummary, chunks);

        // Step 5 — assemble messages and call LLM
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userMessage },
        ];

        const reply = await llm.chat(messages);
        console.log(chalk.green('\nByakugan: ') + reply + '\n');

        // Step 6 — update history, trim to MAX_HISTORY
        history.push({ role: 'user',      content: userMessage });
        history.push({ role: 'assistant', content: reply });
        if (history.length > MAX_HISTORY) history.splice(0, 2);

      } catch (err) {
        console.error(chalk.red('\n✗ Error: ' + err.message + '\n'));
      }

      askQuestion();
    });
  };

  askQuestion();
}

module.exports = { chat };
