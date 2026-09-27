'use strict';

// Prompt rendering.
//
// The prompts live here, on the server, and not in the published package. That
// is the decision the whole split rests on: if the client could post finished
// prompt text, this endpoint would be an open LLM proxy that anyone could bill
// to this account. Restricting requests to a fixed set of named tasks, with
// variables this server fills in, is the control that actually holds — an API
// token shipped inside an npm tarball is readable by anyone who wants it, so it
// cannot be the thing protecting the key.

const fs = require('fs');
const path = require('path');

const PROMPT_DIR = path.join(__dirname, 'prompts');

const cache = new Map();

function readPrompt(name) {
  if (cache.has(name)) return cache.get(name);

  const file = path.join(PROMPT_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Prompt template not found on the server: ${file}`);
  }

  const text = fs.readFileSync(file, 'utf8');
  cache.set(name, text);
  return text;
}

// Substitutes {{NAME}} for every entry in values, all occurrences, in one pass.
// Values are stringified, so a number or an object can be passed straight in.
function fill(template, values) {
  return Object.entries(values).reduce(
    (acc, [key, val]) => acc.split(`{{${key}}}`).join(val == null ? '' : String(val)),
    template
  );
}

// Renders a named prompt. A variable the template asks for but the caller did
// not send is an error rather than an empty string: a silently blanked prompt
// produces a plausible-looking analysis of nothing, which is far worse than a
// 400.
function render(name, variables) {
  const template = readPrompt(name);
  const required = requiredVariables(template);
  const missing = required.filter(key => !(key in variables));

  if (missing.length) {
    const err = new Error(
      `Task is missing required variables: ${missing.join(', ')}`
    );
    err.statusCode = 400;
    throw err;
  }

  return fill(template, variables);
}

function requiredVariables(template) {
  return Array.from(new Set(
    Array.from(template.matchAll(/\{\{([A-Z0-9_]+)\}\}/g), m => m[1])
  ));
}

module.exports = { readPrompt, fill, render, requiredVariables, PROMPT_DIR };
