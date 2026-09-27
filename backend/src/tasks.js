'use strict';

// The task registry: the complete list of things this backend will do.
//
// Anything not named here does not happen. There is deliberately no generic
// "complete this prompt" endpoint — see prompts.js for why.
//
// Adding a task means adding a row here and a matching .md file. The client
// cannot invent one, which is the point.

const { render, requiredVariables, readPrompt } = require('./prompts');

// The chat system prompt was assembled in the CLI from the template plus two
// guidance tables keyed off the reader's level and intent. All of that is prompt
// text, so all of it belongs with the prompts now; the client sends the level
// and intent and never sees the wording.
const LEVEL_GUIDANCE = {
  1: `The developer is a JUNIOR who is new to this codebase. Explain plainly, avoid
jargon, define terms on first use, and orient them: say which files to read and in what
order. Prefer concrete file paths and "here is why" over abstractions. Do not assume
they know the language's ecosystem conventions.`,
  2: `The developer has roughly one year of experience. Be clear and concrete, but you
can assume fluency in the language and basic tooling. Call out anything that would
surprise someone who has only worked on smaller projects.`,
  3: `The developer is SENIOR. Be direct and technical. Skip the basics. Emphasise design
tradeoffs, coupling, and the real blast radius of a change. Mention what is fragile and
why. Do not pad with introductory explanation.`,
  4: `The developer is LEAD level. They care about architecture, sequencing, risk, and
team impact. Frame answers around tradeoffs, alternatives, and what to sequence first.
Surface cross-cutting concerns.`,
  5: `The developer is operating at maximum depth. Be exhaustive and precise. Include
edge cases, invariants, failure modes, and the subtle couplings a less experienced
reviewer would miss. No hand-holding.`,
};

const INTENT_GUIDANCE = {
  onboarding: `Their goal is ORIENTATION. Favour "what is this, where do I start, what does
this file do". Point at entry points and reading order.`,
  modification: `Their goal is CHANGE. Favour "what touches this, what breaks, what is the
blast radius". Always name the specific files and dependencies affected.`,
  migration: `Their goal is UPGRADE or REPLACEMENT. Favour external dependencies, version
constraints, integration points, and what is hardest to migrate.`,
  documentation: `Their goal is DOCUMENTATION. Favour precise, quotable descriptions of
purpose, structure, and concepts.`,
};

function chatSystemPrompt(variables) {
  const parts = [render('chat.md', {
    PROJECT_NAME:    variables.projectName || 'the project',
    PROJECT_SUMMARY: variables.projectSummary || '',
    RETRIEVED_CHUNKS: variables.context || '',
  })];

  const guidance = [];
  if (LEVEL_GUIDANCE[variables.level]) guidance.push(LEVEL_GUIDANCE[variables.level]);
  if (INTENT_GUIDANCE[variables.intent]) guidance.push(INTENT_GUIDANCE[variables.intent]);
  if (guidance.length) parts.push('## Reader profile\n\n' + guidance.join('\n\n'));

  return parts.join('\n\n');
}

// The three analysis passes declare an explicit output cap instead of inheriting
// config.maxCompletionTokens (16,000). A rate-limited provider charges the
// reservation whether or not the model uses it, so a 16k reservation on top of a
// full input batch could not fit inside an 8,000 token/minute budget no matter
// how small the batch was. 4,096 is comfortably more than a per-file JSON record
// needs, and leaves real headroom for the input.
//
// The comment is here rather than only in the README because this number and
// LLM_TPM_LIMIT are two halves of one budget: changing one without the other is
// how a batch pass starts failing on TPM again.
const ANALYSIS_MAX_COMPLETION_TOKENS = 4096;

const TASKS = {
  analyze_survey: {
    prompt: 'analyze_survey.md',
    variables: ['SOURCE_PATH', 'TOTAL_FILES', 'TOTAL_LINES', 'FILE_INVENTORY', 'MANIFEST_DATA'],
    options: { json: true, maxCompletionTokens: ANALYSIS_MAX_COMPLETION_TOKENS },
  },
  analyze_files: {
    prompt: 'analyze_files.md',
    variables: ['SOURCE_PATH', 'BATCH_INDEX', 'BATCH_COUNT', 'BATCH_FILE_COUNT', 'BATCH_DATA'],
    options: { json: true, maxCompletionTokens: ANALYSIS_MAX_COMPLETION_TOKENS },
  },
  analyze_synthesize: {
    prompt: 'analyze_synthesize.md',
    variables: ['SOURCE_PATH', 'DIGEST'],
    options: { json: true, maxCompletionTokens: ANALYSIS_MAX_COMPLETION_TOKENS },
  },
  explain: {
    prompt: 'explain.md',
    variables: [
      'PROJECT_NAME', 'LEVEL_NAME', 'LEVEL', 'INTENT', 'FILE_PATH', 'LANGUAGE',
      'LINES', 'COMPLEXITY', 'PURPOSE', 'EXPORTS', 'IMPORTS', 'RELATED_CHUNKS',
    ],
    options: { maxCompletionTokens: 4096, stream: true },
  },
  impact: {
    prompt: 'impact.md',
    variables: [
      'PROJECT_NAME', 'FILE_PATH', 'LANGUAGE', 'COMPLEXITY', 'PURPOSE',
      'HOTSPOT', 'DEPENDENTS', 'DEPENDENCIES', 'EDGES', 'MUTATIONS',
    ],
    options: { maxCompletionTokens: 4096, stream: true },
  },
  chat: {
    // No prompt file of its own: the system prompt is assembled from chat.md plus
    // the guidance tables, and the conversation's own turns are passed through.
    build: chatSystemPrompt,
    variables: ['projectName', 'projectSummary', 'context', 'level', 'intent', 'question'],
    conversational: true,
    options: { maxCompletionTokens: 2048, temperature: 0.3 },
  },
  route: {
    prompt: 'route.md',
    variables: ['QUESTION'],
    // 16 was too small to be usable. gpt-oss spends output tokens on reasoning
    // before it emits anything, so a 16-token cap meant finish_reason=length with
    // an empty message every single time, and the CLI then retried a request that
    // could never succeed. The answer is still one short routing decision; the cap
    // only has to leave room for the reasoning that precedes it.
    options: { maxCompletionTokens: 256, json: false, reasoningEffort: 'low' },
  },
};

function has(task) {
  return Object.prototype.hasOwnProperty.call(TASKS, task);
}

function get(task) {
  if (!has(task)) {
    const err = new Error(`Unknown task: ${task}`);
    err.statusCode = 400;
    throw err;
  }
  return TASKS[task];
}

// Everything a task is allowed to be sent. The router merges the task's declared
// options with the caller's, but the caller can never raise `json` on a prose
// task or invent a temperature, so a request cannot quietly change the shape of
// the response the CLI is about to parse.
function buildRequest(task, body) {
  const spec = get(task);
  const variables = body.variables || {};

  const missing = spec.variables.filter(key => {
    const value = variables[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length) {
    const err = new Error(
      `Task '${task}' is missing required variables: ${missing.join(', ')}`
    );
    err.statusCode = 400;
    throw err;
  }

  let prompt = null;
  let messages = null;

  if (spec.conversational) {
    messages = [{ role: 'system', content: spec.build(variables) }];
    if (Array.isArray(body.history)) messages.push(...body.history);
    messages.push({ role: 'user', content: String(variables.question) });
  } else {
    prompt = render(spec.prompt, variables);
  }

  const callerOptions = body.options || {};
  const options = { ...spec.options, ...pickAllowed(callerOptions) };

  return { task, variables, prompt, messages, options, stream: Boolean(callerOptions.stream) };
}

const ALLOWED_OPTION_KEYS = ['maxCompletionTokens', 'temperature', 'reasoningEffort'];

function pickAllowed(options) {
  const out = {};
  for (const key of ALLOWED_OPTION_KEYS) {
    if (options[key] !== undefined) out[key] = options[key];
  }
  return out;
}

function describe() {
  return Object.entries(TASKS).map(([name, spec]) => ({
    name,
    prompt: spec.prompt || '(assembled)',
    variables: spec.variables,
    stream: Boolean(spec.options.stream),
    required: spec.variables.filter(v => {
      try {
        return !spec.prompt || requiredVariables(readPrompt(spec.prompt)).includes(v);
      } catch { return false; }
    }),
  }));
}

module.exports = { has, get, buildRequest, describe, TASKS, LEVEL_GUIDANCE, INTENT_GUIDANCE };
