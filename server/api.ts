import { Router, Request, Response } from 'express';
import { SimulationManager } from './simulationManager';
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
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Latest telemetry
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

  // 3. Digital Twin complete state
  router.get('/digital-twin/state', (req: Request, res: Response) => {
    const twin = simManager.getLatestTwinState();
    if (twin) {
      res.json(twin);
    } else {
      res.status(404).json({ error: 'Digital twin state not yet initialized' });
    }
  });

  // 4. Query telemetry history
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

  // 5. Query single telemetry record by ID
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

  // 6. Export telemetry to CSV
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

  // 7. Fault summary analytics
  router.get('/fault-summary', (req: Request, res: Response) => {
    try {
      const summary = getFaultSummary();
      res.json(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Summary calculation failed';
      res.status(500).json({ error: message });
    }
  });

  // 8. Numerical statistics
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

  // 9. Recent alerts
  router.get('/alerts', (req: Request, res: Response) => {
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    res.json(getRecentAlerts(limit));
  });

  // 10. Simulation status
  router.get('/simulation/status', (req: Request, res: Response) => {
    res.json(simManager.getStatus());
  });

  // 11. Start simulation
  router.post('/simulation/start', (req: Request, res: Response) => {
    const intervalMs = req.body?.interval_ms ? Number(req.body.interval_ms) : undefined;
    const started = simManager.start(intervalMs);
    res.json({
      success: true,
      message: started ? 'Simulation started' : 'Simulation already running',
      ...simManager.getStatus(),
    });
  });

  // 12. Stop simulation
  router.post('/simulation/stop', (req: Request, res: Response) => {
    const stopped = simManager.stop();
    res.json({
      success: true,
      message: stopped ? 'Simulation stopped' : 'Simulation was not running',
      ...simManager.getStatus(),
    });
  });

  // 13. Set simulation mode (Fault Injection)
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

  // 14. Reset simulation
  router.post('/simulation/reset', (req: Request, res: Response) => {
    simManager.reset();
    res.json({
      success: true,
      message: 'Simulation state reset to healthy baseline',
      ...simManager.getStatus(),
    });
  });

  // 15. Clear demo database
  router.post('/database/reset', (req: Request, res: Response) => {
    resetDatabase();
    simManager.reset();
    res.json({
      success: true,
      message: 'Database records and alerts reset successfully',
    });
  });

  // 16. ML Model status & evaluation metrics
  router.get('/model/status', (req: Request, res: Response) => {
    res.json(simManager.getModel().getStatus());
  });

  // 17. Retrain ML Model
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

  // 18. Predict fault from custom/live telemetry vector
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
