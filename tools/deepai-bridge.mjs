#!/usr/bin/env node
/**
 * The DeepAI bridge.
 *
 * Reads a markdown file from `READ THIS AGENT/inbox/`, sends it to DeepAI
 * and writes the answer into `READ THIS AGENT/outbox/`. No dependencies:
 * Node's built-in `fetch` is enough.
 *
 *   node tools/deepai-bridge.mjs list
 *   node tools/deepai-bridge.mjs send  "READ THIS AGENT/inbox/foo.md"
 *   node tools/deepai-bridge.mjs send  "READ THIS AGENT/inbox/foo.md" --dry-run
 *   node tools/deepai-bridge.mjs send-all
 *
 * Configuration (environment variables, or a `.env` file in the repo root):
 *
 *   DEEPAI_API_KEY    the key. Never commit it.
 *   DEEPAI_BASE_URL   default: https://api.deepai.org/chat/completions
 *   DEEPAI_MODEL      default: deepai-chat
 *   DEEPAI_TIMEOUT    seconds, default: 180
 *
 * The request is OpenAI-shaped (`{model, messages}`) because that is the
 * shape DeepAI's chat endpoint accepts. Both authentication headers are
 * sent — `Authorization: Bearer` for OpenAI-compatible gateways and
 * `api-key` for DeepAI's own API — so the same script works against
 * either.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FOLDER = path.join(ROOT, 'READ THIS AGENT');
const INBOX = path.join(FOLDER, 'inbox');
const OUTBOX = path.join(FOLDER, 'outbox');

const DEFAULT_BASE_URL = 'https://api.deepai.org/chat/completions';
const DEFAULT_MODEL = 'deepai-chat';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Read a `.env` file from the repo root without adding a dependency. */
async function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  const text = await readFile(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/* ------------------------------------------------------------------ */
/* Front matter                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse the small YAML subset the protocol uses.
 *
 * Supported: `key: value`, and `key: |` followed by an indented block.
 * Anything else is ignored rather than guessed at.
 */
export function parseFrontMatter(text) {
  const normalised = text.replace(/^\uFEFF/, '');
  if (!normalised.startsWith('---')) return { data: {}, body: normalised };

  const end = normalised.indexOf('\n---', 3);
  if (end < 0) return { data: {}, body: normalised };

  const block = normalised.slice(normalised.indexOf('\n') + 1, end);
  const body = normalised.slice(end + 4).replace(/^\s*\n/, '');

  const data = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();

    if (rest === '|' || rest === '>') {
      const parts = [];
      let j = i + 1;
      while (j < lines.length && (lines[j].startsWith(' ') || lines[j].startsWith('\t'))) {
        parts.push(lines[j].trim());
        j++;
      }
      data[key] = parts.join('\n');
      i = j - 1;
    } else {
      data[key] = rest.replace(/^["']|["']$/g, '');
    }
  }

  return { data, body };
}

/** Render the front matter of a reply. */
function renderFrontMatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (value.includes('\n')) {
      lines.push(`${key}: |`);
      for (const line of value.split('\n')) lines.push(`  ${line}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* The request                                                        */
/* ------------------------------------------------------------------ */

const DEFAULT_SYSTEM =
  'You are a careful technical reviewer working on a physics-heavy web ' +
  'project. Answer in markdown, be concrete, and say when you are unsure.';

/** Build the chat messages for a markdown document. */
export function buildMessages(document, { brief } = {}) {
  const messages = [];
  const system = document.data.system?.trim();
  if (system) messages.push({ role: 'system', content: system });

  const context = [];
  if (brief) context.push(brief);
  if (context.length) {
    messages.push({ role: 'system', content: context.join('\n\n') });
  }

  messages.push({ role: 'user', content: document.body.trim() });
  return messages;
}

/** Read the brief, if there is one. */
async function readBrief() {
  const file = path.join(FOLDER, 'BRIEF.md');
  if (!existsSync(file)) return null;
  return `Here is the standing brief for the project. Use it as context; do ` +
    `not quote it back.\n\n${await readFile(file, 'utf8')}`;
}

/* ------------------------------------------------------------------ */
/* Transport                                                          */
/* ------------------------------------------------------------------ */

/** Pull the answer out of whatever shape the endpoint answered with. */
export function extractReply(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;

  // OpenAI-shaped: {choices: [{message: {content}}]}
  const choice = payload?.choices?.[0];
  if (choice) {
    const content = choice.message?.content ?? choice.text ?? choice.delta?.content;
    if (typeof content === 'string' && content.length) return content;
  }

  // DeepAI-shaped: {output} / {reply} / {text} / {response}
  for (const key of ['output', 'reply', 'text', 'response', 'content', 'result']) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.length) return value;
  }

  return null;
}

/** Send the messages and return the answer. */
async function callDeepAI(messages, config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout * 1000);

  try {
    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'api-key': config.apiKey,
      },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}\n${text.slice(0, 800)}`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      // Some gateways answer a chat request with plain text.
      if (text.trim()) return text.trim();
      throw new Error('the endpoint answered with an empty body');
    }

    const reply = extractReply(payload);
    if (!reply) {
      throw new Error(
        `could not find the answer in the response:\n${JSON.stringify(payload).slice(0, 800)}`,
      );
    }
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                           */
/* ------------------------------------------------------------------ */

/** List the queue and the answers. */
async function list() {
  const entries = await readdir(INBOX).catch(() => []);
  const replies = await readdir(OUTBOX).catch(() => []);

  console.log('inbox:');
  const prompts = entries.filter((name) => name.endsWith('.md') && name !== 'README.md');
  if (!prompts.length) console.log('  (empty)');
  for (const name of prompts.sort()) {
    const stem = name.replace(/\.md$/, '');
    const answered = replies.includes(`${stem}.reply.md`);
    console.log(`  ${answered ? '[answered]' : '[queued]  '} ${name}`);
  }

  console.log('\noutbox:');
  const answers = replies.filter((name) => name.endsWith('.md') && name !== 'README.md');
  if (!answers.length) console.log('  (empty)');
  for (const name of answers.sort()) console.log(`  ${name}`);
}

/** Send one document and write the reply. */
async function send(file, { dryRun }) {
  const absolute = path.resolve(ROOT, file);
  if (!existsSync(absolute)) {
    throw new Error(`no such file: ${file}`);
  }

  const document = parseFrontMatter(await readFile(absolute, 'utf8'));
  const brief = await readBrief();
  const messages = buildMessages(document, { brief });

  const config = {
    apiKey: process.env.DEEPAI_API_KEY ?? '',
    baseUrl: process.env.DEEPAI_BASE_URL ?? DEFAULT_BASE_URL,
    model: document.data.model ?? process.env.DEEPAI_MODEL ?? DEFAULT_MODEL,
    timeout: Number(process.env.DEEPAI_TIMEOUT ?? 180),
  };

  if (dryRun) {
    console.log('--- request ---');
    console.log(`POST ${config.baseUrl}`);
    console.log(`model: ${config.model}`);
    for (const message of messages) {
      console.log(`\n[${message.role}]`);
      console.log(message.content);
    }
    console.log('\n--- end (dry run: nothing was sent) ---');
    return;
  }

  if (!config.apiKey) {
    console.error('DEEPAI_API_KEY is not set.');
    console.error('The composed message is printed below — paste it into DeepAI by hand,');
    console.error('or set the key and run the command again.\n');
    for (const message of messages) {
      console.log(`[${message.role}]`);
      console.log(message.content);
      console.log('');
    }
    process.exitCode = 1;
    return;
  }

  console.error(`sending ${path.relative(ROOT, absolute)} to ${config.baseUrl} ...`);
  const reply = await callDeepAI(messages, config);

  const stem = path.basename(absolute).replace(/\.md$/, '');
  const target = path.join(OUTBOX, `${stem}.reply.md`);
  const header = renderFrontMatter({
    to: 'pik',
    model: config.model,
    'reply-to': stem,
    received: new Date().toISOString(),
    verdict: 'UNREVIEWED',
  });

  await mkdir(OUTBOX, { recursive: true });
  await writeFile(target, `${header}\n${reply.trim()}\n`, 'utf8');
  console.error(`reply written to ${path.relative(ROOT, target)}`);
}

/** Send everything in the queue that has no answer yet. */
async function sendAll(options) {
  const entries = (await readdir(INBOX).catch(() => [])).filter(
    (name) => name.endsWith('.md') && name !== 'README.md',
  );
  const replies = await readdir(OUTBOX).catch(() => []);

  const pending = entries
    .filter((name) => !replies.includes(name.replace(/\.md$/, '.reply.md')))
    .sort();

  if (!pending.length) {
    console.log('nothing to send.');
    return;
  }

  for (const name of pending) {
    await send(path.join('READ THIS AGENT', 'inbox', name), options);
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

const USAGE = `
deepai-bridge — the markdown bridge to DeepAI

  node tools/deepai-bridge.mjs list
  node tools/deepai-bridge.mjs send <file> [--dry-run]
  node tools/deepai-bridge.mjs send-all [--dry-run]

Environment:
  DEEPAI_API_KEY   (required to send)
  DEEPAI_BASE_URL  default ${DEFAULT_BASE_URL}
  DEEPAI_MODEL     default ${DEFAULT_MODEL}
  DEEPAI_TIMEOUT   seconds, default 180
`;

async function main() {
  await loadDotEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const command = positional[0] ?? 'list';

  switch (command) {
    case 'list':
      await list();
      break;
    case 'send': {
      if (!positional[1]) {
        console.error('send needs a file');
        console.error(USAGE);
        process.exitCode = 1;
        return;
      }
      await send(positional[1], { dryRun });
      break;
    }
    case 'send-all':
      await sendAll({ dryRun });
      break;
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE);
      break;
    default:
      console.error(`unknown command: ${command}`);
      console.error(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`deepai-bridge: ${error?.message ?? error}`);
  process.exitCode = 1;
});
