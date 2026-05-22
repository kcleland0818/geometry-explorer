const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Try to load WebSocket module, fallback if not available
let WebSocket = null;
let isWebSocketAvailable = false;
try {
  WebSocket = require('ws');
  isWebSocketAvailable = true;
  console.log('WebSocket support enabled');
} catch (error) {
  console.log('WebSocket support disabled (ws package not installed)');
  console.log('Install with: npm install ws');
}

const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_DIR = process.env.SERVE_DIR
  ? path.join(__dirname, process.env.SERVE_DIR)
  : DIST_DIR;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const isProduction = process.env.IS_PRODUCTION === 'true';
if (isProduction && !fs.existsSync(STATIC_DIR)) {
  throw new Error(`Production mode enabled but serve directory does not exist: ${STATIC_DIR}`);
}
const PORT = process.env.PORT || 3000;

const wsClients = new Set();

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  version: 1,
  initialState: {
    mode: '2d',
    shape: 'rectangle',
    units: 'meters',
    values: {
      width: 8,
      height: 5
    }
  },
  ui: {
    lockedMode: false,
    lockedShape: false,
    lockedSliders: false,
    lockedUnits: false,
    showFormulaHints: true
  },
  evaluation: {}
};

let currentSnapshot = null;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'text/plain';
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('config.json must contain a JSON object; using default config');
      return DEFAULT_CONFIG;
    }
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      initialState: {
        ...DEFAULT_CONFIG.initialState,
        ...(parsed.initialState && typeof parsed.initialState === 'object' ? parsed.initialState : {})
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...(parsed.ui && typeof parsed.ui === 'object' ? parsed.ui : {})
      },
      evaluation: {
        ...DEFAULT_CONFIG.evaluation,
        ...(parsed.evaluation && typeof parsed.evaluation === 'object' ? parsed.evaluation : {})
      }
    };
  } catch (error) {
    console.error('Failed to read config.json; using default config:', error.message);
    return DEFAULT_CONFIG;
  }
}

function snapshotFromConfig() {
  const config = loadConfig();
  const initialState = config.initialState || {};
  return {
    version: 1,
    source: 'config',
    mode: initialState.mode || DEFAULT_CONFIG.initialState.mode,
    shape: initialState.shape || initialState.shape2d || initialState.shape3d || DEFAULT_CONFIG.initialState.shape,
    units: initialState.units || DEFAULT_CONFIG.initialState.units,
    values: initialState.values || DEFAULT_CONFIG.initialState.values,
    metrics: null,
    updatedAt: null
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function handleLogRequest(req, res) {
  try {
    const data = await readBody(req);
    const entries = data.entries;
    if (!Array.isArray(entries) || entries.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'entries array is required' }));
      return;
    }
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFile(LOG_FILE, lines, (err) => {
      if (err) console.error('Failed to write log:', err);
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: entries.length }));
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }
}

async function handleSnapshotRequest(req, res) {
  try {
    const data = await readBody(req);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      sendJson(res, 400, { error: 'snapshot object is required' });
      return;
    }

    currentSnapshot = {
      ...data,
      source: 'client',
      updatedAt: new Date().toISOString()
    };

    sendJson(res, 200, { ok: true, snapshot: currentSnapshot });
  } catch (error) {
    sendJson(res, 400, { error: 'Invalid JSON' });
  }
}

function handleGetRequest(req, res, parsedUrl) {
  if (parsedUrl.pathname === '/config') {
    sendJson(res, 200, loadConfig());
    return true;
  }

  if (parsedUrl.pathname === '/snapshot') {
    sendJson(res, 200, currentSnapshot || snapshotFromConfig());
    return true;
  }

  return false;
}

function handlePostRequest(req, res, parsedUrl) {
  if (parsedUrl.pathname === '/api/log') {
    handleLogRequest(req, res);
    return;
  }

  if (parsedUrl.pathname === '/snapshot') {
    handleSnapshotRequest(req, res);
    return;
  }

  if (parsedUrl.pathname === '/message') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const message = data.message;

        if (!message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message is required' }));
          return;
        }

        if (!isWebSocketAvailable) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'WebSocket functionality not available',
            details: 'Install the ws package with: npm install ws'
          }));
          return;
        }

        wsClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'message', message: message }));
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, clientCount: wsClients.size }));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathName = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname;

  if (req.method === 'GET' && handleGetRequest(req, res, parsedUrl)) {
    return;
  }

  if (req.method === 'POST') {
    handlePostRequest(req, res, parsedUrl);
    return;
  }

  if (isProduction) {
    let filePath = path.join(STATIC_DIR, pathName.replace(/^\/+/, ''));

    const resolvedBaseDir = path.resolve(STATIC_DIR);
    const resolvedFilePath = path.resolve(filePath);
    const relativePath = path.relative(resolvedBaseDir, resolvedFilePath);

    if (relativePath.startsWith('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    serveFile(filePath, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found (development mode - use Vite dev server `npm run start:dev`)');
  }
});

if (isWebSocketAvailable) {
  const wss = new WebSocket.Server({
    server,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    console.log('New WebSocket client connected');
    wsClients.add(ws);

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsClients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });
  });
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (isProduction) {
    console.log(`Serving static files from: ${STATIC_DIR}`);
  } else {
    console.log(`Development mode - static files served by Vite`);
  }
  if (isWebSocketAvailable) {
    console.log(`WebSocket server running on /ws`);
  } else {
    console.log(`WebSocket functionality disabled - install 'ws' package to enable`);
  }
  console.log('Press Ctrl+C to stop the server');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please try a different port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
