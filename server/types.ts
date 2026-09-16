export type FaultType =
  | 'HEALTHY'
  | 'OVERHEATING'
  | 'LOW_OIL_PRESSURE'
  | 'HIGH_VIBRATION'
  | 'RPM_INSTABILITY';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export type RiskLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export type SimulationMode =
  | 'AUTO'
  | 'HEALTHY'
  | 'OVERHEATING'
  | 'LOW_OIL_PRESSURE'
  | 'HIGH_VIBRATION'
  | 'RPM_INSTABILITY';

export type SimulationStatus = 'RUNNING' | 'STOPPED';

export interface RawTelemetryInput {
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
}

export interface TelemetryRecord extends RawTelemetryInput {
  id: number;
  timestamp: string;
  health_status: HealthStatus;
  temperature_rate: number;
  oil_pressure_rate: number;
  vibration_rate: number;
  rpm_variation: number;
  manifold_pressure_rate?: number;
  fuel_flow_rate?: number;
  anomaly_score: number;
  prediction_confidence: number;
}

export interface EngineAlert {
  id: string;
  timestamp: string;
  severity: 'WARNING' | 'CRITICAL';
  fault_type: FaultType;
  parameter: string;
  current_value: number;
  threshold: string;
  explanation: string;
}

export interface ComponentHealth {
  status: HealthStatus;
  index: number;
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
    temperature_trend: 'STABLE' | 'RISING' | 'FALLING' | 'CRITICAL_RISE';
    oil_pressure_trend: 'STABLE' | 'DECREASING' | 'CRITICAL_DROP';
    vibration_trend: 'NOMINAL' | 'ELEVATED' | 'SEVERE';
    rpm_stability: 'STABLE' | 'FLUCTUATING' | 'UNSTABLE';
  };
  component_status: {
    cylinder_head: ComponentHealth;
    lubrication_system: ComponentHealth;
    crankshaft_bearings: ComponentHealth;
    valvetrain_ignition: ComponentHealth;
  };
  simulation_mode: SimulationMode;
  simulation_status: SimulationStatus;
  interval_ms: number;
}
