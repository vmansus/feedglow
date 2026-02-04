#!/usr/bin/env node
/**
 * GitHub Webhook Deploy Server
 * Listens for push events on develop branch and triggers deployment
 */

const http = require('http');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config
const PORT = 9876;
const SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const REPO_DIR = process.env.REPO_DIR || path.join(process.env.HOME, 'feedglow');
const BRANCH = 'develop';
const LOG_FILE = path.join(REPO_DIR, 'deploy.log');

// Save secret on first run
const secretFile = path.join(REPO_DIR, '.webhook-secret');
if (!fs.existsSync(secretFile)) {
  fs.writeFileSync(secretFile, SECRET, { mode: 0o600 });
  console.log(`🔑 Webhook secret saved to ${secretFile}`);
  console.log(`📋 Secret: ${SECRET}`);
  console.log(`\nAdd this to GitHub repo → Settings → Webhooks:`);
  console.log(`  URL: https://feedglow.vmansus.top/hooks/deploy`);
  console.log(`  Content type: application/json`);
  console.log(`  Secret: ${SECRET}`);
} else {
  // Read existing secret
  const existingSecret = fs.readFileSync(secretFile, 'utf-8').trim();
  if (!process.env.WEBHOOK_SECRET) {
    process.env.WEBHOOK_SECRET = existingSecret;
  }
}

const webhookSecret = process.env.WEBHOOK_SECRET || fs.readFileSync(secretFile, 'utf-8').trim();

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function verifySignature(payload, signature) {
  if (!signature) return false;
  const sig = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${sig}`),
    Buffer.from(signature)
  );
}

let deploying = false;

function deploy() {
  if (deploying) {
    log('⏳ Deploy already in progress, skipping');
    return;
  }

  deploying = true;
  log('🚀 Starting deployment...');

  exec(`cd ${REPO_DIR} && bash scripts/auto-deploy.sh 2>&1`, { timeout: 120000 }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      log(`❌ Deploy failed: ${err.message}`);
      log(stdout || stderr);
    } else {
      log('✅ Deploy completed');
      if (stdout) log(stdout.trim());
    }
  });
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/hooks/deploy') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', deploying }));
    return;
  }

  // Webhook
  if (req.method === 'POST' && req.url === '/hooks/deploy') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Verify signature
      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(body, signature)) {
        log('⚠️ Invalid signature');
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }

      // Parse event
      const event = req.headers['x-github-event'];
      if (event !== 'push') {
        log(`ℹ️ Ignoring event: ${event}`);
        res.writeHead(200);
        res.end('OK');
        return;
      }

      try {
        const payload = JSON.parse(body);
        const ref = payload.ref;
        const pusher = payload.pusher?.name || 'unknown';

        if (ref !== `refs/heads/${BRANCH}`) {
          log(`ℹ️ Ignoring push to ${ref}`);
          res.writeHead(200);
          res.end('OK');
          return;
        }

        log(`📦 Push to ${BRANCH} by ${pusher}`);
        deploy();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'deploying' }));
      } catch (e) {
        log(`❌ Parse error: ${e.message}`);
        res.writeHead(400);
        res.end('Bad Request');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  log(`🪝 Webhook server listening on 127.0.0.1:${PORT}`);
  log(`📍 Endpoint: /hooks/deploy`);
});
