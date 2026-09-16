import { Router, Request, Response } from 'express';
import { SimulationManager } from './simulationManager';
import { firebaseService } from './firebaseService';
import {
  getLatestTelemetry,
  getTelemetryRecords,
  getTelemetryById,
  getFaultSummary,
  getStatistics,
  getRecentAlerts,
  exportCsv,
  resetDatabase,
} from './db';
import { SimulationMode } from './types';

export function createApiRouter(simManager: SimulationManager): Router {
  const router = Router();

  // 1. Health check endpoint
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      system: 'Aero Piston Engine Digital Twin (SIH26054)',
      sponsor: 'DRDO',
      simulator: simManager.getStatus(),
      ml_model_trained: simManager.getModel().getStatus().trained,
      firebase: firebaseService.getStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Firebase RTDB status and controls
  router.get('/firebase/status', (req: Request, res: Response) => {
    res.json(firebaseService.getStatus());
  });

  router.post('/firebase/test', async (req: Request, res: Response) => {
    try {
      const ok = await firebaseService.testConnection();
      const status = firebaseService.getStatus();
      res.json({
        success: ok,
        status,
        message: ok
          ? `Connected to Firebase RTDB in ${status.latency_ms}ms`
          : `Failed to connect: ${status.last_error || 'Network error'}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Test failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/firebase/sync', async (req: Request, res: Response) => {
    try {
      const twin = simManager.getLatestTwinState();
      if (!twin) {
        res.status(400).json({ success: false, error: 'No digital twin state initialized' });
        return;
      }
      const ok = await firebaseService.syncState(twin, [], true); // Force immediate sync
      res.json({
        success: ok,
        status: firebaseService.getStatus(),
        message: ok ? 'State synced to Firebase Realtime Database' : 'Sync completed',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get('/firebase/snapshot', async (req: Request, res: Response) => {
    try {
      const pathParam = (req.query.path as string) || 'digital_twin.json';
      const data = await firebaseService.getSnapshot(pathParam);
      res.json({
        success: true,
        data,
        status: firebaseService.getStatus(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Snapshot read failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/firebase/config', async (req: Request, res: Response) => {
    try {
      const { database_url, auto_sync } = req.body || {};
      if (typeof auto_sync === 'boolean') {
        firebaseService.setAutoSync(auto_sync);
      }
      if (database_url && typeof database_url === 'string') {
        await firebaseService.setDatabaseUrl(database_url);
      }
      res.json({
        success: true,
        status: firebaseService.getStatus(),
        message: 'Firebase configuration updated',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Config update failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  // 3. Digital Twin complete state
  router.get('/digital-twin/state', (req: Request, res: Response) => {
    const twin = simManager.getLatestTwinState();
    if (twin) {
      res.json(twin);
    } else {
      res.status(404).json({ error: 'Digital twin state not yet initialized' });
    }
  });

  // 3b. Decision Support assessment & explainability report
  router.get('/digital-twin/decision-support', (req: Request, res: Response) => {
    const twin = simManager.getLatestTwinState();
    if (twin && twin.decision_support) {
      res.json({
        ...twin.decision_support,
        current_telemetry: twin.current_telemetry,
        health_score: twin.health_score,
        engine_health: twin.engine_health,
        simulation_mode: twin.simulation_mode,
        simulation_status: twin.simulation_status,
      });
    } else {
      res.status(404).json({ error: 'Decision support assessment not yet initialized' });
    }
  });

  // 4. Latest telemetry
  router.get('/telemetry/latest', (req: Request, res: Response) => {
    const twin = simManager.getLatestTwinState();
    if (twin) {
      res.json(twin.current_telemetry);
    } else {
      const dbLatest = getLatestTelemetry();
      if (dbLatest) {
        res.json(dbLatest);
      } else {
        res.status(404).json({ error: 'No telemetry data available' });
      }
    }
  });

  // 5. Recent telemetry points (for client charts and timeline)
  router.get('/telemetry/recent', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const { records } = getTelemetryRecords({ limit: Math.min(limit, 200) });
      res.json(records);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get recent telemetry';
      res.status(500).json({ error: message });
    }
  });

  // 6. Query telemetry history
  router.get('/telemetry', (req: Request, res: Response) => {
    try {
      const { limit, offset, fault, start_time, end_time } = req.query;
      const result = getTelemetryRecords({
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
        fault: fault ? String(fault) : undefined,
        start_time: start_time ? String(start_time) : undefined,
        end_time: end_time ? String(end_time) : undefined,
      });
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Database query failed';
      res.status(500).json({ error: message });
    }
  });

  // 7. Export telemetry (CSV or JSON)
  router.get('/telemetry/export', (req: Request, res: Response) => {
    try {
      const format = req.query.format === 'json' ? 'json' : 'csv';
      if (format === 'json') {
        const limit = req.query.limit ? Number(req.query.limit) : 500;
        const { records } = getTelemetryRecords({ limit });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="aero_engine_telemetry_${Date.now()}.json"`
        );
        res.json(records);
      } else {
        const csv = exportCsv();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="aero_engine_telemetry_${Date.now()}.csv"`
        );
        res.send(csv);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      res.status(500).json({ error: message });
    }
  });

  router.get('/telemetry/export/csv', (req: Request, res: Response) => {
    try {
      const csv = exportCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="aero_engine_telemetry_${Date.now()}.csv"`
      );
      res.send(csv);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      res.status(500).json({ error: message });
    }
  });

  // 8. Query single telemetry record by ID (Placed after static routes!)
  router.get('/telemetry/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid record ID' });
      return;
    }
    const record = getTelemetryById(id);
    if (!record) {
      res.status(404).json({ error: `Record with id ${id} not found` });
      return;
    }
    res.json(record);
  });

  // 9. Recent alerts
  router.get('/alerts/recent', (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const rawAlerts = getRecentAlerts(limit);
    // Convert to client Alert shape
    const formatted = rawAlerts.map((a, i) => ({
      id: i + 1,
      type: a.fault_type,
      severity: a.severity,
      message: a.explanation,
      parameter: a.parameter,
      value: a.current_value,
      threshold: a.threshold,
      timestamp: a.timestamp,
      acknowledged: false,
    }));
    res.json(formatted);
  });

  router.get('/alerts', (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    res.json(getRecentAlerts(limit));
  });

  router.post('/alerts/acknowledge', (req: Request, res: Response) => {
    res.json({ success: true, message: 'Alert acknowledged' });
  });

  router.post('/alerts/clear', (req: Request, res: Response) => {
    res.json({ success: true, message: 'Alerts cleared' });
  });

  // 10. Fault summary & statistics analytics
  router.get('/fault-summary', (req: Request, res: Response) => {
    try {
      res.json(getFaultSummary());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Summary calculation failed';
      res.status(500).json({ error: message });
    }
  });

  router.get('/statistics', (req: Request, res: Response) => {
    try {
      const stats = getStatistics();
      if (!stats) {
        res.status(404).json({ error: 'No statistics available yet' });
        return;
      }
      res.json(stats);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Statistics query failed';
      res.status(500).json({ error: message });
    }
  });

  // 11. Simulation status & controls
  router.get('/simulation/status', (req: Request, res: Response) => {
    res.json(simManager.getStatus());
  });

  router.post('/simulation/start', (req: Request, res: Response) => {
    const intervalMs = req.body?.interval_ms ? Number(req.body.interval_ms) : undefined;
    const started = simManager.start(intervalMs);
    res.json({
      success: true,
      message: started ? 'Simulation started' : 'Simulation already running',
      ...simManager.getStatus(),
    });
  });

  router.post('/simulation/resume', (req: Request, res: Response) => {
    const started = simManager.start();
    res.json({
      success: true,
      message: started ? 'Simulation resumed' : 'Simulation already running',
      ...simManager.getStatus(),
    });
  });

  router.post('/simulation/stop', (req: Request, res: Response) => {
    const stopped = simManager.stop();
    res.json({
      success: true,
      message: stopped ? 'Simulation stopped' : 'Simulation was not running',
      ...simManager.getStatus(),
    });
  });

  router.post('/simulation/pause', (req: Request, res: Response) => {
    const stopped = simManager.stop();
    res.json({
      success: true,
      message: stopped ? 'Simulation paused' : 'Simulation was not running',
      ...simManager.getStatus(),
    });
  });

  router.post('/simulation/interval', (req: Request, res: Response) => {
    const ms = Number(req.body?.interval_ms);
    if (!isNaN(ms) && ms >= 200 && ms <= 5000) {
      simManager.setIntervalMs(ms);
      res.json({ success: true, interval_ms: ms, ...simManager.getStatus() });
    } else {
      res.status(400).json({ error: 'Invalid interval_ms (must be between 200 and 5000)' });
    }
  });

  router.post('/simulation/mode', (req: Request, res: Response) => {
    const mode = req.body?.mode as SimulationMode;
    const validModes: SimulationMode[] = [
      'AUTO',
      'HEALTHY',
      'OVERHEATING',
      'LOW_OIL_PRESSURE',
      'HIGH_VIBRATION',
      'RPM_INSTABILITY',
    ];

    if (!mode || !validModes.includes(mode)) {
      res.status(400).json({
        error: `Invalid simulation mode. Must be one of: ${validModes.join(', ')}`,
      });
      return;
    }

    simManager.setMode(mode);
    res.json({
      success: true,
      mode,
      message: `Simulation mode switched to ${mode}`,
      ...simManager.getStatus(),
    });
  });

  router.post('/simulation/reset', (req: Request, res: Response) => {
    simManager.reset();
    res.json({
      success: true,
      message: 'Simulation state reset to healthy baseline',
      ...simManager.getStatus(),
    });
  });

  // Execute pilot cockpit checklist corrective action
  router.post('/simulation/execute-pilot-action', (req: Request, res: Response) => {
    try {
      const outcome = simManager.executePilotChecklist();
      res.json({
        success: true,
        action: outcome.action,
        result: outcome.result,
        status: simManager.getStatus(),
        digital_twin: simManager.getLatestTwinState(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/database/reset', (req: Request, res: Response) => {
    resetDatabase();
    simManager.reset();
    res.json({
      success: true,
      message: 'Database records and alerts reset successfully',
    });
  });

  // 12. ML Model status & evaluation metrics
  router.get('/ml/status', (req: Request, res: Response) => {
    res.json(simManager.getModel().getStatus());
  });

  router.get('/model/status', (req: Request, res: Response) => {
    res.json(simManager.getModel().getStatus());
  });

  router.post('/ml/train', (req: Request, res: Response) => {
    try {
      const samplesPerClass = req.body?.samples_per_class
        ? Number(req.body.samples_per_class)
        : 2000;
      const evaluation = simManager.getModel().train(samplesPerClass);
      res.json({
        success: true,
        message: 'ML Model retrained successfully on synthetic aero engine dataset',
        evaluation,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Training failed';
      res.status(500).json({ error: message });
    }
  });

  router.post('/model/train', (req: Request, res: Response) => {
    try {
      const samplesPerClass = req.body?.samples_per_class
        ? Number(req.body.samples_per_class)
        : 2000;
      const evaluation = simManager.getModel().train(samplesPerClass);
      res.json({
        success: true,
        message: 'ML Model retrained successfully on synthetic aero engine dataset',
        evaluation,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Training failed';
      res.status(500).json({ error: message });
    }
  });

  router.post('/model/predict', (req: Request, res: Response) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        res.status(400).json({ error: 'Request body must contain telemetry fields' });
        return;
      }
      const prediction = simManager.getModel().predict(data);
      res.json(prediction);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Inference failed';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
