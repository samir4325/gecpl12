import { WebSocket } from 'ws';
import { AeroEngineSimulator } from './simulator';
import { TelemetryProcessor } from './processor';
import { EngineHealthClassifier } from './ml';
import { AlertEngine } from './alerts';
import { insertTelemetry, getLatestTelemetry } from './db';
import { computeDigitalTwinState } from './digitalTwin';
import { firebaseService } from './firebaseService';
import {
  SimulationMode,
  SimulationStatus,
  DigitalTwinState,
  TelemetryRecord,
  FaultType,
} from './types';

export class SimulationManager {
  private simulator: AeroEngineSimulator;
  private processor: TelemetryProcessor;
  private mlModel: EngineHealthClassifier;
  private alertEngine: AlertEngine;

  private status: SimulationStatus = 'STOPPED';
  private mode: SimulationMode = 'HEALTHY';
  private intervalMs = 1000;
  private timer: NodeJS.Timeout | null = null;
  private clients: Set<WebSocket> = new Set();
  private latestTwinState: DigitalTwinState | null = null;

  constructor() {
    this.simulator = new AeroEngineSimulator();
    this.processor = new TelemetryProcessor();
    this.mlModel = new EngineHealthClassifier();
    this.alertEngine = new AlertEngine();
  }

  public async initialize(): Promise<void> {
    // Train the ML model initially on 1,500 samples per class = 7,500 samples
    try {
      this.mlModel.train(1500);
    } catch (err) {
      console.error('[SimulationManager] ML training during init failed:', err);
    }

    // Seed or load latest telemetry state
    const latest = getLatestTelemetry();
    if (latest) {
      const pred = this.mlModel.predict(latest);
      this.latestTwinState = computeDigitalTwinState(
        latest,
        pred,
        this.mode,
        this.status,
        this.intervalMs
      );
    } else {
      // Generate one initial healthy record
      this.tick();
    }
  }

  public getModel(): EngineHealthClassifier {
    return this.mlModel;
  }

  public getStatus(): {
    status: SimulationStatus;
    mode: SimulationMode;
    interval_ms: number;
    connected_clients: number;
  } {
    return {
      status: this.status,
      mode: this.mode,
      interval_ms: this.intervalMs,
      connected_clients: this.clients.size,
    };
  }

  public getLatestTwinState(): DigitalTwinState | null {
    return this.latestTwinState;
  }

  public start(intervalMs?: number): boolean {
    if (this.status === 'RUNNING') {
      // Prevent duplicate loops!
      if (intervalMs && intervalMs !== this.intervalMs) {
        this.setIntervalMs(intervalMs);
      }
      return false;
    }

    if (intervalMs) {
      this.intervalMs = Math.max(200, Math.min(5000, intervalMs));
    }

    this.status = 'RUNNING';
    console.log(`[Simulator] Started simulation (Interval: ${this.intervalMs}ms, Mode: ${this.mode})`);

    this.timer = setInterval(() => {
      this.tick();
    }, this.intervalMs);

    // Immediate tick
    this.tick();
    return true;
  }

  public stop(): boolean {
    if (this.status === 'STOPPED') {
      return false;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.status = 'STOPPED';
    console.log('[Simulator] Stopped simulation');

    if (this.latestTwinState) {
      this.latestTwinState.simulation_status = 'STOPPED';
      this.broadcast({
        type: 'status_update',
        simulation_status: 'STOPPED',
        digital_twin: this.latestTwinState,
      });
    }

    return true;
  }

  public setMode(mode: SimulationMode): void {
    this.mode = mode;
    this.simulator.setMode(mode);
    console.log(`[Simulator] Switched mode to: ${mode}`);
    if (this.latestTwinState) {
      this.latestTwinState.simulation_mode = mode;
    }
  }

  public setIntervalMs(ms: number): void {
    const validMs = Math.max(200, Math.min(5000, ms));
    this.intervalMs = validMs;
    if (this.status === 'RUNNING') {
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.tick();
      }, this.intervalMs);
    }
  }

  public reset(): void {
    this.stop();
    this.mode = 'HEALTHY';
    this.simulator.reset();
    this.processor.reset();
    this.tick();
  }

  public executePilotChecklist(): { action: string; result: string } {
    const outcome = this.simulator.applyPilotCorrection();
    this.mode = 'HEALTHY';
    this.tick();
    return outcome;
  }

  public addClient(ws: WebSocket): void {
    this.clients.add(ws);
    // Send immediate initial state
    if (this.latestTwinState) {
      try {
        ws.send(
          JSON.stringify({
            type: 'initial_state',
            digital_twin: this.latestTwinState,
            simulation_status: this.status,
            simulation_mode: this.mode,
          })
        );
      } catch (err) {
        console.error('Error sending initial state to client:', err);
      }
    }

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  public removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private tick(): void {
    try {
      const dtSeconds = this.intervalMs / 1000.0;

      // 1. Next physics step
      const raw = this.simulator.nextStep(dtSeconds);

      // 2. Process record and compute temporal rates
      const processed = this.processor.process(raw, dtSeconds);

      // 3. Predict fault & anomaly score using ML model
      const prediction = this.mlModel.predict(processed);
      processed.anomaly_score = prediction.anomaly_score;
      processed.prediction_confidence = prediction.confidence;

      if (prediction.predicted_fault !== 'HEALTHY' && prediction.confidence > 0.7 && processed.health_status === 'HEALTHY') {
        processed.health_status = 'WARNING';
      }

      // 4. Database storage
      const stored = insertTelemetry(processed);

      // 5. Alert evaluation
      const alerts = this.alertEngine.evaluate(
        stored,
        prediction.predicted_fault,
        prediction.confidence
      );

      // 6. Digital Twin state
      const twinState = computeDigitalTwinState(
        stored,
        prediction,
        this.mode,
        this.status,
        this.intervalMs
      );
      this.latestTwinState = twinState;

      // 6. Broadcast to connected WebSocket clients
      this.broadcast({
        type: 'telemetry_update',
        digital_twin: twinState,
        alerts,
      });

      // 7. Live sync to Firebase Realtime Database
      firebaseService.syncState(twinState, alerts).catch(() => {});

      // 8. Periodically poll for remote simulation commands from Firebase
      if (stored.id % 4 === 0) {
        firebaseService.pollRemoteCommand((cmd) => {
          if (cmd.command === 'set_mode' && cmd.mode) {
            this.setMode(cmd.mode);
          } else if (cmd.command === 'start' || cmd.command === 'resume') {
            this.start(cmd.interval_ms);
          } else if (cmd.command === 'stop' || cmd.command === 'pause') {
            this.stop();
          } else if (cmd.command === 'reset') {
            this.reset();
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[SimulationManager] Error in simulation tick:', err);
    }
  }

  private broadcast(payload: unknown): void {
    if (!this.clients.size) return;
    const msg = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch {
          this.clients.delete(client);
        }
      } else if (
        client.readyState === WebSocket.CLOSED ||
        client.readyState === WebSocket.CLOSING
      ) {
        this.clients.delete(client);
      }
    }
  }
}
