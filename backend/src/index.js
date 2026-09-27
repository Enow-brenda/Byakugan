'use strict';

// Entry point. `node src/index.js`, or whatever command the host runs.
//
// Nothing here reads a key. That is deliberate: the process must start with
// missing or revoked credentials so that /v1/health can report the problem, and
// so a health check from the host is not the thing that fails.

const config = require('./config');
const log = require('./logger');
const { createServer } = require('./router');

function missing() {
  const gaps = [];
  if (!process.env.GROQ_API_KEY) gaps.push('GROQ_API_KEY');
  if (!process.env.HF_API_KEY) gaps.push('HF_API_KEY');
  return gaps;
}

const server = createServer();

server.listen(config.port, config.host, () => {
  const gaps = config.mock ? [] : missing();

  log.info('byakugan backend listening', {
    host: config.host,
    port: config.port,
    env: config.env,
    protocol: config.protocol,
    mock: config.mock,
    genModel: config.genModel,
    embedModel: config.embedModel,
    tpmLimit: config.tpmLimit,
    authRequired: Boolean(config.token),
  });

  if (gaps.length) {
    // A warning, not a crash: the server is up and /v1/health will explain the
    // same thing in more detail. Refusing to boot would turn a misconfigured key
    // into an unreachable service that cannot report being misconfigured.
    log.warn('provider credentials are missing; /v1/generate and /v1/embed will fail', {
      missing: gaps,
    });
  }

  if (!config.token && config.env === 'production') {
    log.warn(
      'BYAKUGAN_API_TOKEN is not set, so this endpoint is unauthenticated. ' +
      'Anyone who finds the URL can spend this account.'
    );
  }

  if (config.mock) {
    log.warn('mock mode is on: every answer is a fixture, not a model response');
  }
});

function shutdown(signal) {
  log.info('shutting down', { signal });
  server.close(() => process.exit(0));
  // Do not let an in-flight keep-alive connection hold the process open.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', reason => {
  log.error('unhandled rejection', { message: reason && reason.message, stack: reason && reason.stack });
});

module.exports = server;
