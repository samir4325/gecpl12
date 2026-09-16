import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { TelemetryRecord, EngineAlert, FaultType } from './types';

let db: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aerotwin.sqlite');

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create tables and indexes
  db.run(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      rpm REAL NOT NULL,
      engine_temperature REAL NOT NULL,
      oil_pressure REAL NOT NULL,
      oil_temperature REAL NOT NULL,
      fuel_flow REAL NOT NULL,
      manifold_pressure REAL NOT NULL,
      vibration REAL NOT NULL,
      battery_voltage REAL NOT NULL,
      throttle_position REAL NOT NULL,
      fault TEXT NOT NULL,
      health_status TEXT NOT NULL,
      temperature_rate REAL DEFAULT 0,
      oil_pressure_rate REAL DEFAULT 0,
      vibration_rate REAL DEFAULT 0,
      rpm_variation REAL DEFAULT 0,
      anomaly_score REAL DEFAULT 0,
      prediction_confidence REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp);
    CREATE INDEX IF NOT EXISTS idx_telemetry_fault ON telemetry(fault);

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      severity TEXT NOT NULL,
      fault_type TEXT NOT NULL,
      parameter TEXT NOT NULL,
      current_value REAL NOT NULL,
      threshold TEXT NOT NULL,
      explanation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  saveDatabase();
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err);
  }
}

export function insertTelemetry(record: Omit<TelemetryRecord, 'id'>): TelemetryRecord {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT INTO telemetry (
      timestamp, rpm, engine_temperature, oil_pressure, oil_temperature,
      fuel_flow, manifold_pressure, vibration, battery_voltage, throttle_position,
      fault, health_status, temperature_rate, oil_pressure_rate, vibration_rate,
      rpm_variation, anomaly_score, prediction_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    record.timestamp,
    record.rpm,
    record.engine_temperature,
    record.oil_pressure,
    record.oil_temperature,
    record.fuel_flow,
    record.manifold_pressure,
    record.vibration,
    record.battery_voltage,
    record.throttle_position,
    record.fault,
    record.health_status,
    record.temperature_rate,
    record.oil_pressure_rate,
    record.vibration_rate,
    record.rpm_variation,
    record.anomaly_score,
    record.prediction_confidence,
  ]);
  stmt.free();

  const res = db.exec('SELECT last_insert_rowid() as id');
  const id = Number(res[0].values[0][0]);

  // Periodic persist
  if (id % 10 === 0) {
    saveDatabase();
  }

  return { id, ...record };
}

export function getLatestTelemetry(): TelemetryRecord | null {
  if (!db) return null;
  const res = db.exec(`
    SELECT id, timestamp, rpm, engine_temperature, oil_pressure, oil_temperature,
           fuel_flow, manifold_pressure, vibration, battery_voltage, throttle_position,
           fault, health_status, temperature_rate, oil_pressure_rate, vibration_rate,
           rpm_variation, anomaly_score, prediction_confidence
    FROM telemetry
    ORDER BY id DESC
    LIMIT 1
  `);

  if (!res.length || !res[0].values.length) return null;
  return rowToTelemetry(res[0].columns, res[0].values[0]);
}

export function getTelemetryRecords(options: {
  limit?: number;
  offset?: number;
  fault?: string;
  start_time?: string;
  end_time?: string;
}): { records: TelemetryRecord[]; total: number } {
  if (!db) return { records: [], total: 0 };

  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  if (options.fault && options.fault !== 'ALL') {
    whereClauses.push('fault = ?');
    params.push(options.fault);
  }
  if (options.start_time) {
    whereClauses.push('timestamp >= ?');
    params.push(options.start_time);
  }
  if (options.end_time) {
    whereClauses.push('timestamp <= ?');
    params.push(options.end_time);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Total count
  const countStmt = db.prepare(`SELECT COUNT(*) FROM telemetry ${whereSql}`);
  countStmt.bind(params);
  let total = 0;
  if (countStmt.step()) {
    total = Number(countStmt.get()[0]);
  }
  countStmt.free();

  // Records
  const selectStmt = db.prepare(`
    SELECT id, timestamp, rpm, engine_temperature, oil_pressure, oil_temperature,
           fuel_flow, manifold_pressure, vibration, battery_voltage, throttle_position,
           fault, health_status, temperature_rate, oil_pressure_rate, vibration_rate,
           rpm_variation, anomaly_score, prediction_confidence
    FROM telemetry
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `);
  selectStmt.bind([...params, limit, offset]);

  const records: TelemetryRecord[] = [];
  while (selectStmt.step()) {
    const row = selectStmt.get();
    records.push({
      id: Number(row[0]),
      timestamp: String(row[1]),
      rpm: Number(row[2]),
      engine_temperature: Number(row[3]),
      oil_pressure: Number(row[4]),
      oil_temperature: Number(row[5]),
      fuel_flow: Number(row[6]),
      manifold_pressure: Number(row[7]),
      vibration: Number(row[8]),
      battery_voltage: Number(row[9]),
      throttle_position: Number(row[10]),
      fault: row[11] as FaultType,
      health_status: row[12] as TelemetryRecord['health_status'],
      temperature_rate: Number(row[13]),
      oil_pressure_rate: Number(row[14]),
      vibration_rate: Number(row[15]),
      rpm_variation: Number(row[16]),
      anomaly_score: Number(row[17]),
      prediction_confidence: Number(row[18]),
    });
  }
  selectStmt.free();

  return { records, total };
}

export function getTelemetryById(id: number): TelemetryRecord | null {
  if (!db) return null;
  const stmt = db.prepare('SELECT * FROM telemetry WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.get();
  stmt.free();
  return {
    id: Number(row[0]),
    timestamp: String(row[1]),
    rpm: Number(row[2]),
    engine_temperature: Number(row[3]),
    oil_pressure: Number(row[4]),
    oil_temperature: Number(row[5]),
    fuel_flow: Number(row[6]),
    manifold_pressure: Number(row[7]),
    vibration: Number(row[8]),
    battery_voltage: Number(row[9]),
    throttle_position: Number(row[10]),
    fault: row[11] as FaultType,
    health_status: row[12] as TelemetryRecord['health_status'],
    temperature_rate: Number(row[13]),
    oil_pressure_rate: Number(row[14]),
    vibration_rate: Number(row[15]),
    rpm_variation: Number(row[16]),
    anomaly_score: Number(row[17]),
    prediction_confidence: Number(row[18]),
  };
}

export function getFaultSummary() {
  if (!db) {
    return {
      HEALTHY: 0,
      OVERHEATING: 0,
      LOW_OIL_PRESSURE: 0,
      HIGH_VIBRATION: 0,
      RPM_INSTABILITY: 0,
      total_records: 0,
    };
  }

  const res = db.exec(`
    SELECT fault, COUNT(*) as count
    FROM telemetry
    GROUP BY fault
  `);

  const summary = {
    HEALTHY: 0,
    OVERHEATING: 0,
    LOW_OIL_PRESSURE: 0,
    HIGH_VIBRATION: 0,
    RPM_INSTABILITY: 0,
    total_records: 0,
  };

  if (res.length && res[0].values) {
    for (const [fault, count] of res[0].values) {
      const f = String(fault) as keyof typeof summary;
      if (f in summary) {
        summary[f] = Number(count);
        summary.total_records += Number(count);
      }
    }
  }

  return summary;
}

export function getStatistics() {
  if (!db) return null;

  const res = db.exec(`
    SELECT
      COUNT(*) as count,
      AVG(rpm) as avg_rpm, MIN(rpm) as min_rpm, MAX(rpm) as max_rpm,
      AVG(engine_temperature) as avg_et, MIN(engine_temperature) as min_et, MAX(engine_temperature) as max_et,
      AVG(oil_pressure) as avg_op, MIN(oil_pressure) as min_op, MAX(oil_pressure) as max_op,
      AVG(oil_temperature) as avg_ot, MIN(oil_temperature) as min_ot, MAX(oil_temperature) as max_ot,
      AVG(vibration) as avg_vib, MIN(vibration) as min_vib, MAX(vibration) as max_vib,
      AVG(fuel_flow) as avg_ff, MIN(fuel_flow) as min_ff, MAX(fuel_flow) as max_ff
    FROM telemetry
  `);

  if (!res.length || !res[0].values.length) return null;
  const v = res[0].values[0];

  return {
    count: Number(v[0]),
    rpm: { avg: round(v[1]), min: round(v[2]), max: round(v[3]) },
    engine_temperature: { avg: round(v[4]), min: round(v[5]), max: round(v[6]) },
    oil_pressure: { avg: round(v[7]), min: round(v[8]), max: round(v[9]) },
    oil_temperature: { avg: round(v[10]), min: round(v[11]), max: round(v[12]) },
    vibration: { avg: round(v[13]), min: round(v[14]), max: round(v[15]) },
    fuel_flow: { avg: round(v[16]), min: round(v[17]), max: round(v[18]) },
  };
}

export function insertAlert(alert: EngineAlert): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO alerts (id, timestamp, severity, fault_type, parameter, current_value, threshold, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    alert.id,
    alert.timestamp,
    alert.severity,
    alert.fault_type,
    alert.parameter,
    alert.current_value,
    alert.threshold,
    alert.explanation,
  ]);
  stmt.free();
}

export function getRecentAlerts(limit = 20): EngineAlert[] {
  if (!db) return [];
  const res = db.exec(`
    SELECT id, timestamp, severity, fault_type, parameter, current_value, threshold, explanation
    FROM alerts
    ORDER BY timestamp DESC
    LIMIT ${Math.min(limit, 100)}
  `);
  if (!res.length || !res[0].values.length) return [];
  return res[0].values.map((row) => ({
    id: String(row[0]),
    timestamp: String(row[1]),
    severity: row[2] as 'WARNING' | 'CRITICAL',
    fault_type: row[3] as FaultType,
    parameter: String(row[4]),
    current_value: Number(row[5]),
    threshold: String(row[6]),
    explanation: String(row[7]),
  }));
}

export function exportCsv(): string {
  if (!db) return '';
  const res = db.exec(`
    SELECT id, timestamp, rpm, engine_temperature, oil_pressure, oil_temperature,
           fuel_flow, manifold_pressure, vibration, battery_voltage, throttle_position,
           fault, health_status, temperature_rate, oil_pressure_rate, vibration_rate,
           rpm_variation, anomaly_score, prediction_confidence
    FROM telemetry
    ORDER BY id ASC
    LIMIT 20000
  `);

  if (!res.length || !res[0].values.length) {
    return 'id,timestamp,rpm,engine_temperature,oil_pressure,oil_temperature,fuel_flow,manifold_pressure,vibration,battery_voltage,throttle_position,fault,health_status,temperature_rate,oil_pressure_rate,vibration_rate,rpm_variation,anomaly_score,prediction_confidence\n';
  }

  const cols = res[0].columns.join(',');
  const rows = res[0].values.map((v) => v.map((cell) => `"${cell}"`).join(',')).join('\n');
  return `${cols}\n${rows}`;
}

export function resetDatabase(): void {
  if (!db) return;
  db.run(`
    DELETE FROM telemetry;
    DELETE FROM alerts;
  `);
  saveDatabase();
}

function round(val: unknown, decimals = 2): number {
  const n = Number(val);
  if (isNaN(n)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function rowToTelemetry(cols: string[], row: unknown[]): TelemetryRecord {
  const obj: Record<string, unknown> = {};
  cols.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: Number(obj.id),
    timestamp: String(obj.timestamp),
    rpm: Number(obj.rpm),
    engine_temperature: Number(obj.engine_temperature),
    oil_pressure: Number(obj.oil_pressure),
    oil_temperature: Number(obj.oil_temperature),
    fuel_flow: Number(obj.fuel_flow),
    manifold_pressure: Number(obj.manifold_pressure),
    vibration: Number(obj.vibration),
    battery_voltage: Number(obj.battery_voltage),
    throttle_position: Number(obj.throttle_position),
    fault: obj.fault as FaultType,
    health_status: obj.health_status as TelemetryRecord['health_status'],
    temperature_rate: Number(obj.temperature_rate),
    oil_pressure_rate: Number(obj.oil_pressure_rate),
    vibration_rate: Number(obj.vibration_rate),
    rpm_variation: Number(obj.rpm_variation),
    anomaly_score: Number(obj.anomaly_score),
    prediction_confidence: Number(obj.prediction_confidence),
  };
}
