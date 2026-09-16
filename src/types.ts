export type FaultType =
  | 'HEALTHY'
  | 'OVERHEATING'
  | 'LOW_OIL_PRESSURE'
  | 'HIGH_VIBRATION'
  | 'RPM_INSTABILITY';

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';
export type RiskLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export type PredictionState =
  | 'NORMAL'
  | 'WATCH'
  | 'EARLY_WARNING'
  | 'HIGH_RISK'
  | 'CRITICAL';

export type TrendDirection = 'STABLE' | 'DETERIORATING' | 'IMPROVING' | 'RECOVERING';

export type RiskHorizon =
  | 'STABLE'
  | 'RISK_INCREASING'
  | 'NEAR_TERM_CONCERN'
  | 'RAPIDLY_DETERIORATING';

export type ConfidenceType = 'ML_MODEL_OUTPUT' | 'RULE_BASED_ESTIMATE';

export interface DecisionSupportTimelineEvent {
  timestamp: string;
  state: PredictionState;
  fault: string;
  note: string;
  lead_time_seconds?: number;
}

export interface MultiParameterEvidence {
  parameter: string;
  current_value: number;
  unit: string;
  rate: number;
  moving_avg: number;
  std_dev: number;
  baseline_normal: string;
  observation: string;
}

export interface PilotChecklistStep {
  step: number;
  item: string;
  action: string;
  critical?: boolean;
}

export interface DecisionSupport {
  prediction_state: PredictionState;
  probable_condition: string;
  target_fault?: FaultType | 'UNKNOWN_ANOMALY';
  model_status: string;
  confidence: number;
  confidence_type: ConfidenceType;
  severity: 'NOMINAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  trend: TrendDirection;
  risk_horizon: RiskHorizon;
  quick_solution?: string;
  pilot_checklist?: PilotChecklistStep[];
  why_reasons: string[];
  if_unaddressed: string;
  response_guidance: string;
  procedure_reference: string;
  procedure_status: 'REFERENCE_NOT_CONFIGURED' | 'CONFIGURED';
  procedure_source: string;
  monitored_next: string;
  is_unknown_anomaly?: boolean;
  lead_time_seconds?: number;
  evidence: MultiParameterEvidence[];
  timeline: DecisionSupportTimelineEvent[];
  eight_point_assessment: {
    what_is_happening: string;
    what_is_likely_causing_it: string;
    why_does_system_think_this: string[];
    how_serious_is_it: string;
    is_trend_getting_worse: string;
    what_could_happen_if_continues: string;
    what_approved_procedure_should_be_referenced: string;
    what_should_system_monitor_next: string;
  };
}

export type SimulationStatus = 'RUNNING' | 'PAUSED' | 'STOPPED';
export type SimulationMode = FaultType | 'AUTO';

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
  manifold_pressure_rate?: number;
  fuel_flow_rate?: number;
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
  decision_support?: DecisionSupport;
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
