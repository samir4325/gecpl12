import { DigitalTwinState, EngineAlert, SimulationMode } from './types';

export interface FirebaseSyncStatus {
  connected: boolean;
  database_url: string;
  project_id: string;
  last_sync_timestamp: string | null;
  total_synced_records: number;
  latency_ms: number;
  last_error: string | null;
  auto_sync_enabled: boolean;
}

export class FirebaseService {
  private databaseUrl: string;
  private autoSync: boolean = true;
  private connected: boolean = false;
  private lastSyncTimestamp: string | null = null;
  private totalSyncedRecords: number = 0;
  private latencyMs: number = 0;
  private lastError: string | null = null;
  private lastExecutedCommandId: string = '';
  private isSyncing: boolean = false;
  private lastSyncTimeMs: number = 0;

  constructor() {
    this.databaseUrl = this.normalizeUrl(
      process.env.FIREBASE_DATABASE_URL || 'https://gecpl12-57603-default-rtdb.firebaseio.com'
    );
    // Initial connection ping
    this.testConnection().catch(() => {});
  }

  public normalizeUrl(rawUrl: string): string {
    let clean = (rawUrl || '').trim();
    // Remove :null or .json suffix if user pasted from browser/test
    clean = clean.replace(/\/:null\/?$/, '');
    clean = clean.replace(/\/null\/?$/, '');
    clean = clean.replace(/\.json$/, '');
    // Ensure no trailing slash
    clean = clean.replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  public getProjectId(): string {
    try {
      const parsed = new URL(this.databaseUrl);
      const hostParts = parsed.hostname.split('.');
      return hostParts[0] || 'gecpl12-57603';
    } catch {
      return 'gecpl12-57603';
    }
  }

  public getStatus(): FirebaseSyncStatus {
    return {
      connected: this.connected,
      database_url: this.databaseUrl,
      project_id: this.getProjectId(),
      last_sync_timestamp: this.lastSyncTimestamp,
      total_synced_records: this.totalSyncedRecords,
      latency_ms: this.latencyMs,
      last_error: this.lastError,
      auto_sync_enabled: this.autoSync,
    };
  }

  public setAutoSync(enabled: boolean): void {
    this.autoSync = enabled;
  }

  public setDatabaseUrl(newUrl: string): Promise<boolean> {
    this.databaseUrl = this.normalizeUrl(newUrl);
    return this.testConnection();
  }

  public async testConnection(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const testPayload = {
        app: 'AeroTwin Digital Twin (Rotax 914F)',
        status: 'CONNECTED',
        ping_timestamp: new Date().toISOString(),
      };

      const res = await fetch(`${this.databaseUrl}/status.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });

      if (!res.ok) {
        throw new Error(`Firebase RTDB HTTP error ${res.status}: ${res.statusText}`);
      }

      this.latencyMs = Date.now() - startTime;
      this.connected = true;
      this.lastError = null;
      console.log(`[Firebase] Connected successfully to ${this.databaseUrl} (${this.latencyMs}ms)`);
      return true;
    } catch (err: unknown) {
      this.connected = false;
      this.lastError = err instanceof Error ? err.message : 'Connection failed';
      console.warn(`[Firebase] Connection check failed for ${this.databaseUrl}:`, this.lastError);
      return false;
    }
  }

  /**
   * Sync complete digital twin and telemetry state to Firebase Realtime Database
   */
  public async syncState(
    twinState: DigitalTwinState,
    alerts: EngineAlert[] = [],
    force: boolean = false
  ): Promise<boolean> {
    if ((!this.autoSync && !force) || this.isSyncing) {
      return false;
    }

    // Throttle: sync at most once per 800ms unless forced
    const now = Date.now();
    if (!force && now - this.lastSyncTimeMs < 800) {
      return false;
    }
    this.lastSyncTimeMs = now;
    this.isSyncing = true;

    const startTime = Date.now();
    try {
      // 1. Digital Twin Overview Node
      const twinPayload = {
        updated_at: new Date().toISOString(),
        engine_type: 'Rotax 914F Turbo (DRDO SIH26054)',
        simulation_mode: twinState.simulation_mode,
        simulation_status: twinState.simulation_status,
        engine_health: twinState.engine_health,
        health_score: twinState.health_score,
        risk_level: twinState.risk_level,
        current_fault: twinState.current_fault,
        predicted_fault: twinState.predicted_fault,
        prediction_confidence: twinState.prediction_confidence,
        subsystems: twinState.component_status,
        recent_trends: twinState.recent_trends,
        current_telemetry: twinState.current_telemetry,
      };

      // 2. Put directly to /digital_twin.json
      const putRes = await fetch(`${this.databaseUrl}/digital_twin.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(twinPayload),
      });

      if (!putRes.ok) {
        throw new Error(`Firebase RTDB PUT error: ${putRes.status}`);
      }

      // 3. Put live telemetry directly to /telemetry/live.json
      fetch(`${this.databaseUrl}/telemetry/live.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(twinState.current_telemetry),
      }).catch(() => {});

      // 4. Update latest alerts if any
      if (alerts && alerts.length > 0) {
        fetch(`${this.databaseUrl}/alerts/latest.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alerts[0]),
        }).catch(() => {});
      }

      this.latencyMs = Date.now() - startTime;
      this.connected = true;
      this.lastSyncTimestamp = new Date().toISOString();
      this.totalSyncedRecords += 1;
      this.lastError = null;
      return true;
    } catch (err: unknown) {
      this.connected = false;
      this.lastError = err instanceof Error ? err.message : 'Sync failed';
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Check for remote simulation commands written to /simulation_control.json in Firebase
   */
  public async pollRemoteCommand(
    onCommand: (command: { command: string; mode?: SimulationMode; interval_ms?: number }) => void
  ): Promise<void> {
    try {
      const res = await fetch(`${this.databaseUrl}/simulation_control.json`);
      if (!res.ok) return;

      const data = await res.json();
      if (!data || typeof data !== 'object') return;

      const cmdId = String(data.id || data.timestamp || '');
      if (cmdId && cmdId !== this.lastExecutedCommandId && !data.executed) {
        this.lastExecutedCommandId = cmdId;
        console.log('[Firebase] Received remote command from cloud:', data);

        onCommand({
          command: data.command,
          mode: data.mode,
          interval_ms: data.interval_ms,
        });

        // Mark as executed in Firebase
        fetch(`${this.databaseUrl}/simulation_control/executed.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cmdId,
            executed_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } catch {
      // Remote control check silent catch
    }
  }

  /**
   * Fetch live snapshot from Firebase Realtime Database
   */
  public async getSnapshot(nodePath: string = 'digital_twin.json'): Promise<unknown> {
    const cleanPath = nodePath.replace(/^\/+/, '');
    const url = `${this.databaseUrl}/${cleanPath}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firebase HTTP error ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  }
}

export const firebaseService = new FirebaseService();
