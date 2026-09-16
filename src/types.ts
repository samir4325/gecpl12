export type FaultType =
  | 'HEALTHY'
  | 'OVERHEATING'
  | 'LOW_OIL_PRESSURE'
  | 'HIGH_VIBRATION'
  | 'RPM_INSTABILITY';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export type RiskLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
export type SimulationStatus = 'RUNNING' | 'PAUSED' | 'STOPPED';

export interface TelemetryRecord {
  id: number;
  timestamp: string;
  rpm: number;
  engine_temperature: number;
  oil_pressure: number;
  oil_temperature: number;
  fuel_flow: number;
  manifold_pressure: number;
  vibration: number;
  battery_voltage: number;
  throttle_position: number;
  fault: FaultType;
  health_status: HealthStatus;
  temperature_rate: number;
  oil_pressure_rate: number;
  vibration_rate: number;
  rpm_variation: number;
  anomaly_score: number;
  prediction_confidence: number;
}

export interface Alert {
  id: number;
  timestamp: string;
  telemetry_id: number;
  type: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  parameter: string;
  value: number;
  threshold: number;
  acknowledged?: boolean;
}

export interface ComponentHealth {
  status: HealthStatus;
  index: number; // 0 to 100
  detail: string;
}

export interface DigitalTwinState {
  timestamp: string;
  current_telemetry: TelemetryRecord;
  engine_health: HealthStatus;
  health_score: number;
  current_fault: FaultType;
  predicted_fault: FaultType;
  risk_level: RiskLevel;
  prediction_confidence: number;
  recent_trends: {
    temperature_trend: string;
    oil_pressure_trend: string;
    vibration_trend: string;
    rpm_stability: string;
  };
  component_status: {
    cylinder_head: ComponentHealth;
    lubrication_system: ComponentHealth;
    crankshaft_bearings: ComponentHealth;
    valvetrain_ignition: ComponentHealth;
  };
  simulation_mode: FaultType | 'AUTO';
  simulation_status: SimulationStatus;
  interval_ms: number;
}

export interface ModelMetrics {
  trained: boolean;
  algorithm: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  classes: FaultType[];
  confusion_matrix: Record<string, Record<string, number>>;
  feature_importance: { feature: string; importance: number }[];
  training_samples: number;
  test_samples: number;
  last_trained_at: string | null;
}
