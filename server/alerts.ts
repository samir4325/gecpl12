import { EngineAlert, FaultType, TelemetryRecord } from './types';
import { insertAlert } from './db';

interface AlertCooldown {
  lastTriggered: number;
}

export class AlertEngine {
  private cooldowns: Map<string, AlertCooldown> = new Map();
  private readonly cooldownMs = 15000; // 15 seconds cooldown per alert key

  public evaluate(record: TelemetryRecord, predictedFault: FaultType, confidence: number): EngineAlert[] {
    const alerts: EngineAlert[] = [];
    const now = Date.now();

    const checkAndTrigger = (
      key: string,
      severity: 'WARNING' | 'CRITICAL',
      fault_type: FaultType,
      parameter: string,
      current_value: number,
      threshold: string,
      explanation: string
    ) => {
      const cd = this.cooldowns.get(key);
      if (cd && now - cd.lastTriggered < this.cooldownMs) {
        return; // Suppressed by cooldown
      }

      const alert: EngineAlert = {
        id: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: record.timestamp,
        severity,
        fault_type,
        parameter,
        current_value,
        threshold,
        explanation,
      };

      this.cooldowns.set(key, { lastTriggered: now });
      insertAlert(alert);
      alerts.push(alert);
    };

    // 1. Overheating alerts
    if (record.engine_temperature > 105) {
      checkAndTrigger(
        'overheat_critical',
        'CRITICAL',
        'OVERHEATING',
        'Engine Temperature',
        record.engine_temperature,
        '> 105.0°C',
        `Critical cylinder head overheating: ${record.engine_temperature.toFixed(1)}°C exceeds maximum continuous limit. Immediate throttle reduction advised.`
      );
    } else if (record.engine_temperature > 95 || (record.temperature_rate > 0.5 && record.engine_temperature > 88)) {
      checkAndTrigger(
        'overheat_warning',
        'WARNING',
        'OVERHEATING',
        'Engine Temperature',
        record.engine_temperature,
        '> 95.0°C or rate > +0.5°C/s',
        `Thermal trend rising rapidly (+${record.temperature_rate.toFixed(2)}°C/s). Current temp: ${record.engine_temperature.toFixed(1)}°C.`
      );
    }

    // 2. Oil Pressure alerts
    if (record.oil_pressure < 25) {
      checkAndTrigger(
        'oil_press_critical',
        'CRITICAL',
        'LOW_OIL_PRESSURE',
        'Oil Pressure',
        record.oil_pressure,
        '< 25.0 PSI',
        `Severe lubrication loss: ${record.oil_pressure.toFixed(1)} PSI. Critical risk of bearing seizure.`
      );
    } else if (record.oil_pressure < 38 || record.oil_pressure_rate < -0.6) {
      checkAndTrigger(
        'oil_press_warning',
        'WARNING',
        'LOW_OIL_PRESSURE',
        'Oil Pressure',
        record.oil_pressure,
        '< 38.0 PSI or rate < -0.6 PSI/s',
        `Oil pressure dropping: ${record.oil_pressure.toFixed(1)} PSI (${record.oil_pressure_rate.toFixed(2)} PSI/s). Inspect oil gallery and regulator.`
      );
    }

    // 3. Vibration alerts
    if (record.vibration > 6.0) {
      checkAndTrigger(
        'vibration_critical',
        'CRITICAL',
        'HIGH_VIBRATION',
        'Vibration',
        record.vibration,
        '> 6.0 mm/s',
        `Excessive harmonic vibration: ${record.vibration.toFixed(2)} mm/s. Structural fatigue hazard on engine mount and crankcase.`
      );
    } else if (record.vibration > 3.5 || record.vibration_rate > 0.6) {
      checkAndTrigger(
        'vibration_warning',
        'WARNING',
        'HIGH_VIBRATION',
        'Vibration',
        record.vibration,
        '> 3.5 mm/s',
        `Elevated vibration spectrum detected (${record.vibration.toFixed(2)} mm/s). Possible propeller unbalance or valve play.`
      );
    }

    // 4. RPM Instability alerts
    if (record.rpm_variation > 220 || Math.abs(record.rpm - 2400) > 400) {
      checkAndTrigger(
        'rpm_instability_warning',
        'WARNING',
        'RPM_INSTABILITY',
        'RPM Stability',
        record.rpm,
        'Variation > 220 RPM/s',
        `Speed fluctuation detected: ${record.rpm.toFixed(0)} RPM (Δ ${record.rpm_variation.toFixed(0)} RPM/s). Fuel metering or governor surge.`
      );
    }

    // 5. Predictive ML Warning (when ML model identifies elevated fault risk before catastrophic failure)
    if (predictedFault !== 'HEALTHY' && confidence >= 0.75 && record.health_status === 'HEALTHY') {
      checkAndTrigger(
        `ml_risk_${predictedFault}`,
        'WARNING',
        predictedFault,
        'AI Predictive Warning',
        confidence,
        'Confidence >= 75%',
        `Early fault signature detected by ML model: elevated risk of ${predictedFault} (${(confidence * 100).toFixed(0)}% confidence).`
      );
    }

    return alerts;
  }
}
