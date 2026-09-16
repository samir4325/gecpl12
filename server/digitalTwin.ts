import {
  DigitalTwinState,
  TelemetryRecord,
  FaultType,
  HealthStatus,
  RiskLevel,
  SimulationMode,
  SimulationStatus,
  ComponentHealth,
} from './types';
import { PredictionResult } from './ml';
import { decisionSupportEngine } from './decisionSupport';

export function computeDigitalTwinState(
  telemetry: TelemetryRecord,
  prediction: PredictionResult,
  simulationMode: SimulationMode,
  simulationStatus: SimulationStatus,
  intervalMs = 1000
): DigitalTwinState {
  // 1. Calculate transparent Health Score (0 - 100)
  let healthScore = 98.0;

  // Temperature penalties
  if (telemetry.engine_temperature > 88) {
    const excess = telemetry.engine_temperature - 88;
    healthScore -= Math.min(35, excess * 2.2);
  }
  if (telemetry.temperature_rate > 0.4) {
    healthScore -= Math.min(15, telemetry.temperature_rate * 20);
  }

  // Oil pressure penalties
  if (telemetry.oil_pressure < 44) {
    const deficit = 44 - telemetry.oil_pressure;
    healthScore -= Math.min(45, deficit * 2.5);
  }
  if (telemetry.oil_pressure_rate < -0.4) {
    healthScore -= Math.min(15, Math.abs(telemetry.oil_pressure_rate) * 20);
  }

  // Vibration penalties
  if (telemetry.vibration > 2.5) {
    const excessVib = telemetry.vibration - 2.5;
    healthScore -= Math.min(40, excessVib * 8.0);
  }

  // RPM variation penalties
  if (telemetry.rpm_variation > 80) {
    healthScore -= Math.min(30, (telemetry.rpm_variation - 80) * 0.15);
  }

  // ML probability adjustment
  if (prediction.predicted_fault !== 'HEALTHY') {
    healthScore -= prediction.confidence * 20;
  }

  healthScore = Math.max(5, Math.min(99, Math.round(healthScore)));

  // 2. Determine Risk Level
  let riskLevel: RiskLevel = 'NORMAL';
  if (healthScore < 40 || telemetry.health_status === 'CRITICAL') {
    riskLevel = 'CRITICAL';
  } else if (healthScore < 65) {
    riskLevel = 'HIGH';
  } else if (healthScore < 85 || prediction.predicted_fault !== 'HEALTHY') {
    riskLevel = 'ELEVATED';
  }

  // Overall engine health status
  let engineHealth: HealthStatus = 'HEALTHY';
  if (riskLevel === 'CRITICAL') {
    engineHealth = 'CRITICAL';
  } else if (riskLevel === 'HIGH' || riskLevel === 'ELEVATED') {
    engineHealth = 'WARNING';
  }

  // 3. Trends analysis
  let tempTrend: 'STABLE' | 'RISING' | 'FALLING' | 'CRITICAL_RISE' = 'STABLE';
  if (telemetry.temperature_rate > 0.7 || telemetry.engine_temperature > 102) {
    tempTrend = 'CRITICAL_RISE';
  } else if (telemetry.temperature_rate > 0.2) {
    tempTrend = 'RISING';
  } else if (telemetry.temperature_rate < -0.2) {
    tempTrend = 'FALLING';
  }

  let oilTrend: 'STABLE' | 'DECREASING' | 'CRITICAL_DROP' = 'STABLE';
  if (telemetry.oil_pressure_rate < -0.7 || telemetry.oil_pressure < 28) {
    oilTrend = 'CRITICAL_DROP';
  } else if (telemetry.oil_pressure_rate < -0.2) {
    oilTrend = 'DECREASING';
  }

  let vibTrend: 'NOMINAL' | 'ELEVATED' | 'SEVERE' = 'NOMINAL';
  if (telemetry.vibration > 5.5) {
    vibTrend = 'SEVERE';
  } else if (telemetry.vibration > 3.0) {
    vibTrend = 'ELEVATED';
  }

  let rpmStability: 'STABLE' | 'FLUCTUATING' | 'UNSTABLE' = 'STABLE';
  if (telemetry.rpm_variation > 200) {
    rpmStability = 'UNSTABLE';
  } else if (telemetry.rpm_variation > 80) {
    rpmStability = 'FLUCTUATING';
  }

  // 4. Component level diagnostic states
  const cylinderHeadStatus: ComponentHealth = {
    status:
      telemetry.engine_temperature > 104
        ? 'CRITICAL'
        : telemetry.engine_temperature > 93
        ? 'WARNING'
        : 'HEALTHY',
    index: Math.min(100, Math.round((telemetry.engine_temperature / 120) * 100)),
    detail: `${telemetry.engine_temperature.toFixed(1)}°C (${tempTrend})`,
  };

  const lubricationStatus: ComponentHealth = {
    status:
      telemetry.oil_pressure < 28
        ? 'CRITICAL'
        : telemetry.oil_pressure < 40
        ? 'WARNING'
        : 'HEALTHY',
    index: Math.min(100, Math.round((telemetry.oil_pressure / 60) * 100)),
    detail: `${telemetry.oil_pressure.toFixed(1)} PSI / ${telemetry.oil_temperature.toFixed(1)}°C`,
  };

  const bearingsStatus: ComponentHealth = {
    status:
      telemetry.vibration > 5.8
        ? 'CRITICAL'
        : telemetry.vibration > 3.2
        ? 'WARNING'
        : 'HEALTHY',
    index: Math.min(100, Math.round((telemetry.vibration / 8.0) * 100)),
    detail: `${telemetry.vibration.toFixed(2)} mm/s (${vibTrend})`,
  };

  const valvetrainStatus: ComponentHealth = {
    status:
      rpmStability === 'UNSTABLE'
        ? 'CRITICAL'
        : rpmStability === 'FLUCTUATING'
        ? 'WARNING'
        : 'HEALTHY',
    index: Math.min(100, Math.round((telemetry.rpm / 2800) * 100)),
    detail: `${telemetry.rpm.toFixed(0)} RPM (Δ ${telemetry.rpm_variation.toFixed(0)} RPM/s)`,
  };

  const decisionSupport = decisionSupportEngine.analyze(
    telemetry,
    prediction,
    Math.max(0.1, intervalMs / 1000)
  );

  return {
    timestamp: telemetry.timestamp,
    current_telemetry: telemetry,
    engine_health: engineHealth,
    health_score: healthScore,
    current_fault: telemetry.fault,
    predicted_fault: prediction.predicted_fault,
    risk_level: riskLevel,
    prediction_confidence: prediction.confidence,
    recent_trends: {
      temperature_trend: tempTrend,
      oil_pressure_trend: oilTrend,
      vibration_trend: vibTrend,
      rpm_stability: rpmStability,
    },
    component_status: {
      cylinder_head: cylinderHeadStatus,
      lubrication_system: lubricationStatus,
      crankshaft_bearings: bearingsStatus,
      valvetrain_ignition: valvetrainStatus,
    },
    simulation_mode: simulationMode,
    simulation_status: simulationStatus,
    interval_ms: intervalMs,
    decision_support: decisionSupport,
  };
}
