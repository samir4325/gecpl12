import { RawTelemetryInput, TelemetryRecord, HealthStatus, FaultType } from './types';

const VALID_FAULTS: FaultType[] = [
  'HEALTHY',
  'OVERHEATING',
  'LOW_OIL_PRESSURE',
  'HIGH_VIBRATION',
  'RPM_INSTABILITY',
];

export class TelemetryProcessor {
  private previousRecord: TelemetryRecord | null = null;

  public reset(): void {
    this.previousRecord = null;
  }

  public validateRaw(raw: unknown): { valid: boolean; error?: string; data?: RawTelemetryInput } {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, error: 'Telemetry data must be a non-null object' };
    }

    const r = raw as Record<string, unknown>;

    const requiredFields = [
      'rpm',
      'engine_temperature',
      'oil_pressure',
      'oil_temperature',
      'fuel_flow',
      'manifold_pressure',
      'vibration',
      'battery_voltage',
      'throttle_position',
      'fault',
    ];

    for (const field of requiredFields) {
      if (r[field] === undefined || r[field] === null) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }

    const numericFields = [
      'rpm',
      'engine_temperature',
      'oil_pressure',
      'oil_temperature',
      'fuel_flow',
      'manifold_pressure',
      'vibration',
      'battery_voltage',
      'throttle_position',
    ];

    for (const field of numericFields) {
      const val = Number(r[field]);
      if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        return { valid: false, error: `Field '${field}' must be a valid finite number` };
      }
    }

    const rpm = Number(r.rpm);
    if (rpm < 0 || rpm > 10000) {
      return { valid: false, error: `RPM out of plausible range [0, 10000]: ${rpm}` };
    }

    const fault = String(r.fault) as FaultType;
    if (!VALID_FAULTS.includes(fault)) {
      return { valid: false, error: `Invalid fault label: ${fault}` };
    }

    return {
      valid: true,
      data: {
        rpm,
        engine_temperature: Number(r.engine_temperature),
        oil_pressure: Number(r.oil_pressure),
        oil_temperature: Number(r.oil_temperature),
        fuel_flow: Number(r.fuel_flow),
        manifold_pressure: Number(r.manifold_pressure),
        vibration: Number(r.vibration),
        battery_voltage: Number(r.battery_voltage),
        throttle_position: Number(r.throttle_position),
        fault,
      },
    };
  }

  public process(
    raw: RawTelemetryInput,
    dtSeconds = 1.0,
    prediction?: { predicted_fault: FaultType; confidence: number; anomaly_score: number }
  ): Omit<TelemetryRecord, 'id'> {
    let tempRate = 0;
    let oilPressRate = 0;
    let vibRate = 0;
    let rpmVariation = 0;

    const effectiveDt = Math.max(0.1, dtSeconds);

    if (this.previousRecord) {
      tempRate = (raw.engine_temperature - this.previousRecord.engine_temperature) / effectiveDt;
      oilPressRate = (raw.oil_pressure - this.previousRecord.oil_pressure) / effectiveDt;
      vibRate = (raw.vibration - this.previousRecord.vibration) / effectiveDt;
      rpmVariation = Math.abs(raw.rpm - this.previousRecord.rpm) / effectiveDt;
    }

    // Determine initial physical health status based on parameter safety bands
    let healthStatus: HealthStatus = 'HEALTHY';

    const isCritical =
      raw.engine_temperature > 105 ||
      raw.oil_pressure < 25 ||
      raw.vibration > 6.0 ||
      raw.rpm > 2950 ||
      raw.rpm < 1800;

    const isWarning =
      raw.engine_temperature > 94 ||
      raw.oil_pressure < 38 ||
      raw.vibration > 3.5 ||
      tempRate > 0.5 ||
      oilPressRate < -0.6 ||
      rpmVariation > 150;

    if (isCritical) {
      healthStatus = 'CRITICAL';
    } else if (isWarning || (prediction && prediction.predicted_fault !== 'HEALTHY')) {
      healthStatus = 'WARNING';
    }

    const processed: Omit<TelemetryRecord, 'id'> = {
      timestamp: new Date().toISOString(),
      rpm: raw.rpm,
      engine_temperature: raw.engine_temperature,
      oil_pressure: raw.oil_pressure,
      oil_temperature: raw.oil_temperature,
      fuel_flow: raw.fuel_flow,
      manifold_pressure: raw.manifold_pressure,
      vibration: raw.vibration,
      battery_voltage: raw.battery_voltage,
      throttle_position: raw.throttle_position,
      fault: raw.fault,
      health_status: healthStatus,
      temperature_rate: round(tempRate, 3),
      oil_pressure_rate: round(oilPressRate, 3),
      vibration_rate: round(vibRate, 3),
      rpm_variation: round(rpmVariation, 2),
      anomaly_score: prediction ? round(prediction.anomaly_score, 3) : 0,
      prediction_confidence: prediction ? round(prediction.confidence, 3) : 0,
    };

    this.previousRecord = { id: 0, ...processed };
    return processed;
  }
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
