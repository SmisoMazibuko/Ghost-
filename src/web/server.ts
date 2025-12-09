/**
 * Ghost Evaluator v15.1 - Web Server
 * ===================================
 * Express server with WebSocket for real-time updates
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import { createSessionManager } from '../session/manager';
import { initConfig, getConfig } from '../core/config';
import { Direction } from '../types';

// ============================================================================
// SERVER SETUP
// ============================================================================

export function startWebServer(port = 3000, configPath?: string) {
  // Initialize config
  if (configPath) {
    initConfig(configPath);
  }

  const config = getConfig();
  const evaluatorConfig = config.getEvaluatorConfig();
  const sessionConfig = config.getSessionConfig();

  // Create session manager
  const session = createSessionManager({
    config: evaluatorConfig,
    sessionDir: sessionConfig.sessionDir,
  });

  // Create Express app
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  // Store connected clients
  const clients: Set<WebSocket> = new Set();

  // Broadcast to all clients
  function broadcast(data: object) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Get full state for new connections
  function getFullState() {
    const gameState = session.getGameState();
    const reaction = session.getReactionEngine();
    const summary = session.getSummary();
    const lifecycle = gameState.getLifecycle();
    const healthReport = session.getHealthReport();
    const hostilityManager = reaction.getHostilityManager();

    return {
      type: 'full_state',
      data: {
        blocks: gameState.getBlocks(),
        summary,
        patterns: lifecycle.getStatistics(),
        trades: reaction.getCompletedTrades().slice(-20),
        pendingTrade: reaction.getPendingTrade(),
        prediction: reaction.predictNext(),
        runData: gameState.getRunData(),
        // Session health data
        sessionHealth: healthReport.health,
        drawdown: healthReport.drawdown,
        lossSeverity: healthReport.lossSeverity,
        verdicts: healthReport.verdicts,
        patternDivergences: healthReport.patternDivergences,
        recovery: healthReport.recovery,
        reentry: healthReport.reentry,
        // Hostility data
        hostility: {
          state: hostilityManager.getState(),
          activeIndicators: hostilityManager.getActiveIndicators(gameState.getBlockCount()),
          patternRecovery: hostilityManager.getAllPatternRecoveryStates(),
          statusMessage: hostilityManager.getStatusMessage(),
        },
        // Profit tracking (AP, AAP, BSP)
        profitTracking: reaction.getProfitTracking(),
      }
    };
  }

  // ============================================================================
  // WebSocket Handlers
  // ============================================================================

  wss.on('connection', (ws) => {
    console.log('Client connected');
    clients.add(ws);

    // Send initial state
    try {
      const state = getFullState();
      console.log('Sending initial state...');
      ws.send(JSON.stringify(state));
      console.log('Initial state sent successfully');
    } catch (error) {
      console.error('Error sending initial state:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to get initial state' }));
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleWebSocketMessage(ws, data);
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  function handleWebSocketMessage(ws: WebSocket, data: { action: string; payload?: any }) {
    switch (data.action) {
      case 'add_block': {
        const { direction, percentage } = data.payload;
        const dir: Direction = direction === 'up' ? 1 : -1;
        const pct = parseFloat(percentage);

        if (isNaN(pct) || pct < 0 || pct > 100) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid percentage' }));
          return;
        }

        const reaction = session.getReactionEngine();
        const result = reaction.processBlock(dir, pct);
        const healthReport = session.getHealthReport();
        const hostilityManager = reaction.getHostilityManager();

        // Broadcast update to all clients
        broadcast({
          type: 'block_added',
          data: {
            block: result.blockResult.block,
            newSignals: result.blockResult.newSignals,
            evaluatedResults: result.blockResult.evaluatedResults,
            prediction: result.prediction,
            closedTrade: result.closedTrade,
            openedTrade: result.openedTrade,
            summary: session.getSummary(),
            patterns: session.getGameState().getLifecycle().getStatistics(),
            pendingTrade: reaction.getPendingTrade(),
            trades: reaction.getCompletedTrades().slice(-20),
            runData: session.getGameState().getRunData(),
            // Session health data
            sessionHealth: result.sessionHealth,
            recoveryMode: result.recoveryMode,
            drawdown: healthReport.drawdown,
            lossSeverity: healthReport.lossSeverity,
            verdicts: healthReport.verdicts,
            recovery: healthReport.recovery,
            reentry: healthReport.reentry,
            // Hostility data
            hostility: {
              state: result.hostilityState,
              activeIndicators: hostilityManager.getActiveIndicators(session.getGameState().getBlockCount()),
              patternRecovery: hostilityManager.getAllPatternRecoveryStates(),
              statusMessage: hostilityManager.getStatusMessage(),
            },
            // Profit tracking (AP, AAP, BSP)
            profitTracking: result.profitTracking,
          }
        });
        break;
      }

      case 'undo': {
        const gameState = session.getGameState();
        const reaction = session.getReactionEngine();
        const blockCount = gameState.getBlockCount();

        // First undo any trade that was evaluated at this block
        const undoneTradeIndex = blockCount - 1;
        const undoneTradeResult = reaction.undoLastTrade(undoneTradeIndex);

        // Clear any pending trade (state has changed, prediction needs recalculating)
        const cancelledPending = reaction.clearPendingTrade();

        // Now undo the block (this rebuilds game state by replaying remaining blocks)
        const removed = gameState.undoLastBlock();
        if (removed) {
          // Rebuild health manager's results state from rebuilt game state results
          const healthManager = reaction.getHealthManager();
          const rebuiltResults = gameState.getResults();
          healthManager.rebuildResultsState(rebuiltResults);

          // After undo, regenerate prediction and re-open trade if applicable
          const prediction = reaction.predictNext();
          const reopenedTrade = reaction.openTrade(prediction);

          broadcast({
            type: 'block_undone',
            data: {
              removedBlock: removed,
              undoneTradeResult,
              cancelledPending,
              reopenedTrade,
              ...getFullState().data,
            }
          });
        }
        break;
      }

      case 'clear': {
        session.newSession();
        broadcast(getFullState());
        break;
      }

      case 'get_state': {
        ws.send(JSON.stringify(getFullState()));
        break;
      }

      case 'save': {
        const savedPath = session.saveToFile(data.payload?.path);
        ws.send(JSON.stringify({ type: 'saved', path: savedPath }));
        break;
      }

      case 'load': {
        try {
          session.loadFromFile(data.payload.path);
          broadcast(getFullState());
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to load session' }));
        }
        break;
      }

      case 'list_sessions': {
        const sessions = session.listSessions();
        ws.send(JSON.stringify({ type: 'sessions_list', data: sessions }));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown action: ${data.action}` }));
    }
  }

  // ============================================================================
  // REST API (optional backup)
  // ============================================================================

  app.get('/api/state', (_req, res) => {
    res.json(getFullState().data);
  });

  app.post('/api/block', (req, res) => {
    const { direction, percentage } = req.body;
    const dir: Direction = direction === 'up' ? 1 : -1;
    const pct = parseFloat(percentage);

    if (isNaN(pct) || pct < 0 || pct > 100) {
      res.status(400).json({ error: 'Invalid percentage' });
      return;
    }

    const reaction = session.getReactionEngine();
    const result = reaction.processBlock(dir, pct);
    const healthReport = session.getHealthReport();

    // Broadcast to WebSocket clients
    broadcast({
      type: 'block_added',
      data: {
        block: result.blockResult.block,
        newSignals: result.blockResult.newSignals,
        evaluatedResults: result.blockResult.evaluatedResults,
        prediction: result.prediction,
        closedTrade: result.closedTrade,
        openedTrade: result.openedTrade,
        summary: session.getSummary(),
        patterns: session.getGameState().getLifecycle().getStatistics(),
        pendingTrade: reaction.getPendingTrade(),
        trades: reaction.getCompletedTrades().slice(-20),
        runData: session.getGameState().getRunData(),
        // Session health data
        sessionHealth: result.sessionHealth,
        recoveryMode: result.recoveryMode,
        drawdown: healthReport.drawdown,
        recovery: healthReport.recovery,
        reentry: healthReport.reentry,
      }
    });

    res.json(result);
  });

  // New endpoint for session health report
  app.get('/api/health', (_req, res) => {
    res.json(session.getHealthReport());
  });

  // ============================================================================
  // Start Server
  // ============================================================================

  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Ghost Evaluator v15.1 - Web Server                     ║
║   Running at http://localhost:${port}                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);
  });

  return { app, server, wss };
}

// Run if executed directly
if (require.main === module) {
  const port = parseInt(process.argv[2] || '3000', 10);
  startWebServer(port);
}
