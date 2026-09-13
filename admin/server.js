#!/usr/bin/env node
/*
 * portfolio admin - back office for timfas.com
 *
 * Design notes
 * ------------
 * - No npm dependencies. Node built-ins only, so there is no supply chain here.
 * - Binds to 127.0.0.1 and sits behind Caddy, which terminates TLS.
 * - Edits autosave to a draft file OUTSIDE git. Nothing reaches the live site
 *   until Publish, which is the only action that runs deploy.sh.
 * - Previews are rendered in memory using the same generator that builds the
 *   real pages, so a preview is exactly what publishing would produce.
 *
 * Environment (see portfolio-admin.env):
 *   PORT, ADMIN_USER, ADMIN_PASSWORD_HASH, SESSION_SECRET, REPO_DIR
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

/* ------------------------------------------------------------------- config */

const PORT = Number(process.env.PORT || 8107);
const HOST = process.env.HOST || '127.0.0.1';
const REPO = process.env.REPO_DIR || path.resolve(__dirname, '..');
const ADMIN_USER = process.env.ADMIN_USER || '';
const PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);

const PUBLIC_DIR = path.join(__dirname, 'public');
const DRAFT_FILE = path.join(__dirname, 'draft.json');
const CONTENT_FILE = path.join(REPO, 'content', 'site.json');
const INDEX_FILE = path.join(REPO, 'index.html');
const BUILD_SCRIPT = path.join(REPO, 'scripts', 'build-site.js');

// Region markers that must survive a raw-HTML edit, or the build cannot run.
const REQUIRED_MARKERS = [
  'BUILD:header:start',
  'BUILD:journey:start',
  'BUILD:flagship:start',
  'BUILD:archnote:start',
  'BUILD:platform:start',
  'BUILD:footer:start',
  'BUILD:projects:start',
];

/* ------------------------------------------------------------------- crypto */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (!salt.length || !expected.length) return false;

  let actual;
  try {
    actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Constant-time string compare that tolerates differing lengths. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Small CLI so a password hash can be generated without a separate tool:
//   node server.js --hash 'your password'
// Placed after the crypto helpers so SCRYPT is initialised, and before the
// config gate so it works even when the env file is not set up yet.
if (process.argv.includes('--hash')) {
  const pw = process.argv[process.argv.indexOf('--hash') + 1];
  if (!pw) {
    console.error('usage: node server.js --hash <password>');
    process.exit(1);
  }
  console.log(hashPassword(pw));
  process.exit(0);
}

/* -------------------------------------------------------------- startup gate */

const missing = [];
if (!ADMIN_USER) missing.push('ADMIN_USER');
if (!PASSWORD_HASH) missing.push('ADMIN_PASSWORD_HASH');
if (!SESSION_SECRET) missing.push('SESSION_SECRET');
if (missing.length) {
  console.error('portfolio-admin: refusing to start, missing config: ' + missing.join(', '));
  console.error('Set these in /etc/portfolio-admin.env and restart the service.');
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error('portfolio-admin: SESSION_SECRET must be at least 32 characters.');
  process.exit(1);
}

/* ----------------------------------------------------------------- sessions */

const sessions = new Map(); // token -> { user, csrf, expires }

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    // Stored on the object so the login handler can build the Set-Cookie
    // header from it. Omitting this silently produced `pa_session=undefined`.
    token,
    user,
    csrf: crypto.randomBytes(32).toString('hex'),
    expires: Date.now() + SESSION_HOURS * 3600 * 1000,
  };
  sessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

// Periodic sweep so expired sessions do not accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------ rate limiting */

const attempts = new Map(); // ip -> { count, first, lockedUntil }
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function isLocked(ip) {
  const a = attempts.get(ip);
  if (!a) return 0;
  if (a.lockedUntil && a.lockedUntil > Date.now()) {
    return Math.ceil((a.lockedUntil - Date.now()) / 1000);
  }
  return 0;
}

function recordFailure(ip) {
  const now = Date.now();
  let a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) a = { count: 0, first: now, lockedUntil: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = now + LOCK_MS;
    a.count = 0;
    a.first = now;
    console.warn(`portfolio-admin: locked out ${ip} for ${LOCK_MS / 60000} minutes`);
  }
  attempts.set(ip, a);
}

function clearFailures(ip) {
  attempts.delete(ip);
}

/* -------------------------------------------------------------- http helpers */

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

const MAX_BODY = 4 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------- draft storage */

const EMPTY_DRAFT = { site: null, indexHtml: null, updatedAt: null };

function readDraft() {
  try {
    return JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf8'));
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

function writeDraft(draft) {
  draft.updatedAt = new Date().toISOString();
  const tmp = DRAFT_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2));
  fs.renameSync(tmp, DRAFT_FILE); // atomic
  return draft;
}

function readContent() {
  return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
}

/* -------------------------------------------------------------- git helpers */

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: REPO, timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err ? err.code || 1 : 0,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
        });
      }
    );
  });
}

async function gitStatus() {
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = await run('git', ['status', '--porcelain']);
  const last = await run('git', ['log', '-1', '--pretty=%h %s (%cr)']);

  const dirty = status.stdout.trim() ? status.stdout.trim().split('\n') : [];

  return {
    branch: branch.stdout.trim(),
    dirty,
    lastCommit: last.stdout.trim(),
  };
}

/* ------------------------------------------------------------------- routers */

function requireSession(req, res) {
  const cookies = parseCookies(req);
  const session = getSession(cookies.pa_session);
  if (!session) {
    sendJson(res, 401, { error: 'not authenticated' });
    return null;
  }
  return session;
}

function requireCsrf(req, res, session) {
  const token = req.headers['x-csrf-token'];
  if (!token || !safeEqual(token, session.csrf)) {
    sendJson(res, 403, { error: 'invalid CSRF token' });
    return false;
  }
  return true;
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  /* ---- public ---- */

  if (route === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const locked = isLocked(ip);
    if (locked) {
      return sendJson(res, 429, { error: `too many attempts, try again in ${locked}s` });
    }

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }

    const user = String(body.username || '');
    const pass = String(body.password || '');

    const userOk = safeEqual(user, ADMIN_USER);
    const passOk = verifyPassword(pass, PASSWORD_HASH);

    if (!userOk || !passOk) {
      recordFailure(ip);
      console.warn(`portfolio-admin: failed login for "${user}" from ${ip}`);
      // Same message either way, so the response does not reveal which was wrong.
      return sendJson(res, 401, { error: 'invalid username or password' });
    }

    clearFailures(ip);
    const session = createSession(user);

    const secure = (req.headers['x-forwarded-proto'] || 'https') === 'https';
    const cookie = [
      `pa_session=${session.token}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Strict',
      secure ? 'Secure' : '',
      `Max-Age=${SESSION_HOURS * 3600}`,
    ]
      .filter(Boolean)
      .join('; ');

    res.setHeader('Set-Cookie', cookie);
    console.log(`portfolio-admin: login ok for ${user} from ${ip}`);
    return sendJson(res, 200, { ok: true, csrf: session.csrf, user: session.user });
  }

  /* ---- authenticated ---- */

  const session = requireSession(req, res);
  if (!session) return;

  if (route === '/api/session' && req.method === 'GET') {
    return sendJson(res, 200, { user: session.user, csrf: session.csrf });
  }

  if (route === '/api/logout' && req.method === 'POST') {
    if (!requireCsrf(req, res, session)) return;
    const cookies = parseCookies(req);
    sessions.delete(cookies.pa_session);
    res.setHeader('Set-Cookie', 'pa_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  // Current state: live content + any draft + git info.
  if (route === '/api/state' && req.method === 'GET') {
    let live = null;
    try {
      live = readContent();
    } catch (e) {
      return sendJson(res, 500, { error: 'cannot read content/site.json: ' + e.message });
    }

    const draft = readDraft();
    const git = await gitStatus();

    return sendJson(res, 200, {
      live,
      draft: draft.site ? draft : null,
      indexHtml: fs.readFileSync(INDEX_FILE, 'utf8'),
      draftIndexHtml: draft.indexHtml || null,
      git,
      repo: REPO,
      draftUpdatedAt: draft.updatedAt || null,
    });
  }

  // Autosave the draft. Never touches the live site.
  if (route === '/api/draft' && req.method === 'PUT') {
    if (!requireCsrf(req, res, session)) return;

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }

    const draft = readDraft();
    if (body.site) draft.site = body.site;
    if (typeof body.indexHtml === 'string') draft.indexHtml = body.indexHtml;
    writeDraft(draft);

    return sendJson(res, 200, { ok: true, updatedAt: draft.updatedAt });
  }

  if (route === '/api/draft' && req.method === 'DELETE') {
    if (!requireCsrf(req, res, session)) return;
    try {
      fs.unlinkSync(DRAFT_FILE);
    } catch {
      /* already gone */
    }
    return sendJson(res, 200, { ok: true });
  }

  // Preview: render in memory with the real generator. Writes nothing.
  if (route === '/api/preview' && req.method === 'POST') {
    if (!requireCsrf(req, res, session)) return;

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }

    const site = body.site || readContent();
    const templateHtml =
      typeof body.indexHtml === 'string' ? body.indexHtml : fs.readFileSync(INDEX_FILE, 'utf8');

    const missingMarkers = REQUIRED_MARKERS.filter((m) => !templateHtml.includes(m));
    if (missingMarkers.length) {
      return sendJson(res, 400, {
        error: 'index.html is missing build markers: ' + missingMarkers.join(', '),
        missingMarkers,
      });
    }

    if (body.caseSlug) {
      const gen = require(path.join(REPO, 'case-studies', 'generate-case-studies.js'));
      const cases = gen.casesFromSite(site);
      const record = cases.find((c) => c.slug === body.caseSlug);
      if (!record) return sendJson(res, 404, { error: 'no case study: ' + body.caseSlug });
      return sendJson(res, 200, { html: gen.renderPage(record), slug: body.caseSlug });
    }

    const { buildIndexHtml } = require(BUILD_SCRIPT);
    return sendJson(res, 200, { html: buildIndexHtml(site, templateHtml) });
  }

  // Publish: promote draft -> content -> build -> commit -> push -> deploy.
  if (route === '/api/publish' && req.method === 'POST') {
    if (!requireCsrf(req, res, session)) return;

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }

    const steps = [];
    const record = (name, r) => {
      steps.push({
        name,
        ok: r.ok,
        code: r.code,
        stdout: r.stdout.trim(),
        stderr: r.stderr.trim(),
      });
      return r.ok;
    };

    const site = body.site || readContent();
    const templateHtml =
      typeof body.indexHtml === 'string' ? body.indexHtml : fs.readFileSync(INDEX_FILE, 'utf8');

    const missingMarkers = REQUIRED_MARKERS.filter((m) => !templateHtml.includes(m));
    if (missingMarkers.length) {
      return sendJson(res, 400, {
        error: 'refusing to publish: index.html is missing build markers: ' + missingMarkers.join(', '),
        steps,
      });
    }

    // 1. Write content, then the raw template (build fills the marked regions).
    try {
      fs.writeFileSync(CONTENT_FILE, JSON.stringify(site, null, 2) + '\n');
      fs.writeFileSync(INDEX_FILE, templateHtml);
      steps.push({ name: 'write content/site.json + index.html', ok: true });
    } catch (e) {
      return sendJson(res, 500, { error: 'write failed: ' + e.message, steps });
    }

    // 2. Rebuild the site from content.
    const build = await run('node', [BUILD_SCRIPT]);
    if (!record('build site', build)) {
      return sendJson(res, 500, { error: 'build failed, nothing committed', steps });
    }

    // 3. Commit.
    await run('git', ['add', '-A']);
    const status = await run('git', ['status', '--porcelain']);
    if (status.stdout.trim()) {
      const message = String(body.message || '').trim() || 'Update portfolio content via admin';
      const commit = await run('git', ['commit', '-m', message]);
      if (!record('git commit', commit)) {
        return sendJson(res, 500, { error: 'commit failed', steps });
      }
    } else {
      steps.push({ name: 'git commit', ok: true, stdout: 'nothing to commit' });
    }

    // 4. Push.
    const push = await run('git', ['push']);
    if (!record('git push', push)) {
      return sendJson(res, 500, {
        error: 'push failed. Your commit exists locally but is not on GitHub.',
        steps,
      });
    }

    // 5. Deploy (this is the only step that changes what visitors see).
    const deploy = await run('bash', [path.join(REPO, 'deploy.sh')]);
    if (!record('deploy.sh', deploy)) {
      return sendJson(res, 500, { error: 'deploy failed - live site may be stale', steps });
    }

    // Clear the draft now that it is live.
    try {
      fs.unlinkSync(DRAFT_FILE);
    } catch {
      /* nothing to clear */
    }

    console.log(`portfolio-admin: published by ${session.user}`);
    return sendJson(res, 200, { ok: true, steps });
  }

  return sendJson(res, 404, { error: 'no such endpoint' });
}

/* ------------------------------------------------------------ static assets */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Paths served without a session. These are the login page and the assets it
// needs. They contain no secrets: all real data comes from /api/*, which
// always requires a session.
//
// /app.js and /styles.css MUST be listed here. Gating them behind a session
// returns a 302 to "/" for the login page's own JS; the browser then refuses to
// execute it (arrives as text/html) and the sign-in button silently does nothing.
const PUBLIC_PATHS = new Set(['/', '/index.html', '/app.js', '/styles.css', '/favicon.ico']);

function serveStatic(req, res, url) {
  // Only the login page and its assets are served without a session.
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  rel = rel.replace(/^\/+/, '');

  const full = path.join(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    res.end(data);
  });
}

/* -------------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('method not allowed');
      return;
    }

    // The dashboard shell requires a session; the login page does not.
    const cookies = parseCookies(req);
    const session = getSession(cookies.pa_session);

    if (!session && !PUBLIC_PATHS.has(url.pathname)) {
      res.writeHead(302, { Location: '/' }).end();
      return;
    }

    serveStatic(req, res, url);
  } catch (err) {
    console.error('portfolio-admin: unhandled error', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`portfolio-admin listening on http://${HOST}:${PORT}`);
  console.log(`repo: ${REPO}`);
});
