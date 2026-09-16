import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db';
import { SimulationManager } from './server/simulationManager';
import { createApiRouter } from './server/api';

const PORT = 3000;

async function startServer() {
  console.log('[Server] Initializing AeroTwin Server...');

  // 1. Initialize SQLite Database
  await initDatabase();
  console.log('[Server] SQLite Database initialized.');

  // 2. Initialize Simulation Manager & ML Model
  const simManager = new SimulationManager();
  await simManager.initialize();
  console.log('[Server] Simulation manager and ML model ready.');

  // 3. Create Express App
  const app = express();
  app.use(express.json());

  // CORS for local development flexibility
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // 4. Mount API Router FIRST
  app.use('/api', createApiRouter(simManager));

  // 5. Create HTTP Server & WebSocket Server
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/telemetry' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WebSocket] Client connected from ${ip}`);
    simManager.addClient(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'set_mode' && msg.mode) {
          simManager.setMode(msg.mode);
        } else if (msg.type === 'start') {
          simManager.start(msg.interval_ms);
        } else if (msg.type === 'stop') {
          simManager.stop();
        }
      } catch (err) {
        console.error('[WebSocket] Invalid client message:', err);
      }
    });

    ws.on('close', () => {
      simManager.removeClient(ws);
    });
  });

  // Automatically start simulation in HEALTHY mode on startup for immediate live demo experience
  simManager.start(1000);

  // 6. Integrate Vite middleware for Development or Static Files for Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in dev mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` AeroTwin Digital Twin Server Running on Port ${PORT}`);
    console.log(` - REST API:   http://0.0.0.0:${PORT}/api/health`);
    console.log(` - WebSocket:  ws://0.0.0.0:${PORT}/ws/telemetry`);
    console.log(`=======================================================`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
