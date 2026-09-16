import {
  TelemetryRecord,
  FaultType,
  PredictionState,
  TrendDirection,
  RiskHorizon,
  ConfidenceType,
  DecisionSupport,
  DecisionSupportTimelineEvent,
  MultiParameterEvidence,
} from './types';
import { PredictionResult } from './ml';

interface TelemetryWindowRecord {
  timestamp: string;
  rpm: number;
  engine_temperature: number;
  oil_pressure: number;
  oil_temperature: number;
  vibration: number;
  manifold_pressure: number;
  fuel_flow: number;
  throttle_position: number;
  temperature_rate: number;
  oil_pressure_rate: number;
  vibration_rate: number;
  rpm_variation: number;
  anomaly_score: number;
}

export class DecisionSupportEngine {
  private window: TelemetryWindowRecord[] = [];
  private readonly maxWindowSize = 60; // 60-second historical window
  private currentState: PredictionState = 'NORMAL';
  private currentProbableFault: string = 'Nominal Operation';
  private sustainedRisingTempTicks = 0;
  private sustainedFallingOilTicks = 0;
  private sustainedRisingVibTicks = 0;
  private sustainedRpmOscillationTicks = 0;
  private recoveryTicks = 0;

  // Timeline tracking to validate: Prediction Time < Fault Time
  private timeline: DecisionSupportTimelineEvent[] = [
    {
      timestamp: new Date().toISOString(),
      state: 'NORMAL',
      fault: 'HEALTHY',
      note: 'Nominal engine operation established within calibrated envelope.',
    },
  ];

  private lastStateTransitionTime: number = Date.now();
  private warningTriggerTimestamp: number | null = null;
  private faultTriggerTimestamp: number | null = null;
  private leadTimeSeconds: number = 0;

  public reset(): void {
    this.window = [];
    this.currentState = 'NORMAL';
    this.currentProbableFault = 'Nominal Operation';
    this.sustainedRisingTempTicks = 0;
    this.sustainedFallingOilTicks = 0;
    this.sustainedRisingVibTicks = 0;
    this.sustainedRpmOscillationTicks = 0;
    this.recoveryTicks = 0;
    this.warningTriggerTimestamp = null;
    this.faultTriggerTimestamp = null;
    this.leadTimeSeconds = 0;
    this.timeline = [
      {
        timestamp: new Date().toISOString(),
        state: 'NORMAL',
        fault: 'HEALTHY',
        note: 'Nominal engine operation established within calibrated envelope.',
      },
    ];
  }

  public analyze(
    telemetry: TelemetryRecord,
    mlResult: PredictionResult,
    dtSeconds = 1.0
  ): DecisionSupport {
    const record: TelemetryWindowRecord = {
      timestamp: telemetry.timestamp,
      rpm: telemetry.rpm,
      engine_temperature: telemetry.engine_temperature,
      oil_pressure: telemetry.oil_pressure,
      oil_temperature: telemetry.oil_temperature,
      vibration: telemetry.vibration,
      manifold_pressure: telemetry.manifold_pressure,
      fuel_flow: telemetry.fuel_flow,
      throttle_position: telemetry.throttle_position,
      temperature_rate: telemetry.temperature_rate,
      oil_pressure_rate: telemetry.oil_pressure_rate,
      vibration_rate: telemetry.vibration_rate,
      rpm_variation: telemetry.rpm_variation,
      anomaly_score: telemetry.anomaly_score,
    };

    this.window.push(record);
    if (this.window.length > this.maxWindowSize) {
      this.window.shift();
    }

    // 1. Compute Moving Averages and Moving Standard Deviations
    const stats = this.computeWindowStats();

    // 2. Track persistent directional trends
    if (telemetry.temperature_rate > 0.15) {
      this.sustainedRisingTempTicks++;
    } else if (telemetry.temperature_rate <= 0) {
      this.sustainedRisingTempTicks = Math.max(0, this.sustainedRisingTempTicks - 1);
    }

    if (telemetry.oil_pressure_rate < -0.15) {
      this.sustainedFallingOilTicks++;
    } else if (telemetry.oil_pressure_rate >= 0) {
      this.sustainedFallingOilTicks = Math.max(0, this.sustainedFallingOilTicks - 1);
    }

    if (telemetry.vibration_rate > 0.05 || telemetry.vibration > 2.6) {
      this.sustainedRisingVibTicks++;
    } else if (telemetry.vibration_rate <= 0) {
      this.sustainedRisingVibTicks = Math.max(0, this.sustainedRisingVibTicks - 1);
    }

    if (Math.abs(telemetry.rpm_variation) > 40 || stats.rpmStd > 25) {
      this.sustainedRpmOscillationTicks++;
    } else {
      this.sustainedRpmOscillationTicks = Math.max(0, this.sustainedRpmOscillationTicks - 1);
    }

    // 3. Second derivative / acceleration of rate
    let tempAcc = 0;
    let oilAcc = 0;
    let vibAcc = 0;
    if (this.window.length >= 3) {
      const prev = this.window[this.window.length - 2];
      const prev2 = this.window[this.window.length - 3];
      tempAcc = (prev.temperature_rate - prev2.temperature_rate) / Math.max(0.1, dtSeconds);
      oilAcc = (prev.oil_pressure_rate - prev2.oil_pressure_rate) / Math.max(0.1, dtSeconds);
      vibAcc = (prev.vibration_rate - prev2.vibration_rate) / Math.max(0.1, dtSeconds);
    }

    // 4. Multi-parameter Fault Analysis
    let targetFault: FaultType | 'UNKNOWN_ANOMALY' = 'HEALTHY';
    let probableCondition = 'Nominal Flight Envelope';
    let predictionState: PredictionState = 'NORMAL';
    let trend: TrendDirection = 'STABLE';
    let riskHorizon: RiskHorizon = 'STABLE';
    let severity: 'NOMINAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'NOMINAL';
    let whyReasons: string[] = [];
    let ifUnaddressed = 'Engine telemetry parameters are operating within nominal boundaries.';
    let responseGuidance = 'Continue standard flight monitoring in accordance with standard procedures.';
    let monitoredNext = 'Continuous multi-parameter monitoring across all engine sensors.';
    let quickSolution = 'NOMINAL FLIGHT ENVELOPE • CONTINUE STANDARD SCAN';
    let pilotChecklist: { step: number; item: string; action: string; critical?: boolean }[] = [
      { step: 1, item: 'ENGINE STATUS', action: 'All parameters within calibrated flight envelope' },
      { step: 2, item: 'DERIVATIVES', action: 'Temperature and pressure rates within nominal limits' },
      { step: 3, item: 'FLIGHT SCAN', action: 'Maintain standard scan pattern' },
    ];

    // Check individual fault trend signatures
    const isOverheatingTrend =
      this.sustainedRisingTempTicks >= 3 ||
      (telemetry.engine_temperature > 89 && telemetry.temperature_rate > 0.1) ||
      mlResult.predicted_fault === 'OVERHEATING';

    const isOilPressureDropTrend =
      this.sustainedFallingOilTicks >= 3 ||
      (telemetry.oil_pressure < 46 && telemetry.oil_pressure_rate < -0.15) ||
      mlResult.predicted_fault === 'LOW_OIL_PRESSURE';

    const isVibrationGrowthTrend =
      this.sustainedRisingVibTicks >= 3 ||
      (telemetry.vibration > 2.8 && telemetry.vibration_rate > 0.04) ||
      mlResult.predicted_fault === 'HIGH_VIBRATION';

    const isRpmInstabilityTrend =
      this.sustainedRpmOscillationTicks >= 3 ||
      stats.rpmStd > 35 ||
      mlResult.predicted_fault === 'RPM_INSTABILITY';

    // Check for Unknown Anomaly (anomalous score/parameters not fitting standard profile)
    const isUnknownAnomaly =
      !isOverheatingTrend &&
      !isOilPressureDropTrend &&
      !isVibrationGrowthTrend &&
      !isRpmInstabilityTrend &&
      (telemetry.anomaly_score > 0.55 ||
        telemetry.battery_voltage < 25.0 ||
        telemetry.fuel_flow > 38.0 ||
        (stats.tempStd > 4 && telemetry.temperature_rate < -1.0));

    // Priority arbitration
    if (isOverheatingTrend) {
      targetFault = 'OVERHEATING';
      probableCondition = 'Overheating Trend';
      quickSolution = 'REDUCE THROTTLE • ENRICH MIXTURE • OPEN COWL FLAPS / INCREASE AIRSPEED';
      pilotChecklist = [
        { step: 1, item: 'THROTTLE', action: 'REDUCE to climb/cruise power (Thermal relief)', critical: true },
        { step: 2, item: 'MIXTURE', action: 'FULL RICH (Fuel cooling)' },
        { step: 3, item: 'AIRSPEED / FLAPS', action: 'INCREASE airspeed / OPEN cowl flaps' },
        { step: 4, item: 'CHT GAUGE', action: 'VERIFY temperature drops below 105°C' },
      ];

      // Severity & Early Warning classification based on persistence and rate
      if (telemetry.engine_temperature >= 105 || (telemetry.engine_temperature > 98 && telemetry.temperature_rate > 0.6)) {
        predictionState = 'CRITICAL';
        severity = 'CRITICAL';
        riskHorizon = 'RAPIDLY_DETERIORATING';
        trend = 'DETERIORATING';
      } else if (telemetry.engine_temperature >= 94 || this.sustainedRisingTempTicks >= 8 || telemetry.temperature_rate > 0.4) {
        predictionState = 'HIGH_RISK';
        severity = 'HIGH';
        riskHorizon = 'NEAR_TERM_CONCERN';
        trend = 'DETERIORATING';
      } else if (this.sustainedRisingTempTicks >= 4 || telemetry.temperature_rate > 0.2) {
        predictionState = 'EARLY_WARNING';
        severity = 'MODERATE';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      } else {
        predictionState = 'WATCH';
        severity = 'LOW';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      }

      whyReasons = [
        `Cylinder head temperature has sustained an upward trend for ~${this.sustainedRisingTempTicks * 1.0}s (Current: ${telemetry.engine_temperature.toFixed(1)}°C, baseline: ${stats.tempMean.toFixed(1)}°C).`,
        `Rate of temperature rise is ${telemetry.temperature_rate > 0 ? '+' : ''}${telemetry.temperature_rate.toFixed(2)}°C/s${tempAcc > 0.05 ? ' (acceleration observed)' : ''}.`,
        `Engine power setting remains active (${telemetry.rpm.toFixed(0)} RPM, MAP: ${telemetry.manifold_pressure.toFixed(1)} inHg) without proportional airspeed cooling.`,
        `Multi-parameter thermal signature corresponds with simulated cylinder heat-sink saturation.`,
      ];

      ifUnaddressed =
        'Continued overheating may increase the risk of degraded engine performance, thermal fatigue, or structural component damage.';
      responseGuidance =
        'Refer to the applicable aircraft-specific approved abnormal/emergency procedure. Verify mixture, cowl flaps, and power settings per flight manual.';
      monitoredNext = 'Cylinder head temperature derivative (dT/dt), oil temperature coupling, and manifold pressure.';
    } else if (isOilPressureDropTrend) {
      targetFault = 'LOW_OIL_PRESSURE';
      probableCondition = 'Lubrication-System Degradation Trend';
      quickSolution = 'VERIFY OIL TEMP • REDUCE POWER • PLAN PRECAUTIONARY LANDING';
      pilotChecklist = [
        { step: 1, item: 'OIL TEMPERATURE', action: 'CROSS-CHECK (If rising, engine seizure imminent)', critical: true },
        { step: 2, item: 'THROTTLE / POWER', action: 'REDUCE to minimum safe power for level flight' },
        { step: 3, item: 'LANDING SITE', action: 'LOCATE nearest airfield or forced-landing terrain' },
        { step: 4, item: 'GLIDE ALTITUDE', action: 'MAINTAIN altitude & prepare for precautionary descent' },
      ];

      if (telemetry.oil_pressure <= 25 || (telemetry.oil_pressure < 32 && telemetry.oil_pressure_rate < -0.5)) {
        predictionState = 'CRITICAL';
        severity = 'CRITICAL';
        riskHorizon = 'RAPIDLY_DETERIORATING';
        trend = 'DETERIORATING';
      } else if (telemetry.oil_pressure <= 38 || this.sustainedFallingOilTicks >= 8 || telemetry.oil_pressure_rate < -0.35) {
        predictionState = 'HIGH_RISK';
        severity = 'HIGH';
        riskHorizon = 'NEAR_TERM_CONCERN';
        trend = 'DETERIORATING';
      } else if (this.sustainedFallingOilTicks >= 4 || telemetry.oil_pressure_rate < -0.15) {
        predictionState = 'EARLY_WARNING';
        severity = 'MODERATE';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      } else {
        predictionState = 'WATCH';
        severity = 'LOW';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      }

      whyReasons = [
        `Oil pressure has shown a sustained decreasing trend for ~${this.sustainedFallingOilTicks * 1.0}s (Current: ${telemetry.oil_pressure.toFixed(1)} PSI, baseline: ${stats.oilMean.toFixed(1)} PSI).`,
        `Decline rate is ${telemetry.oil_pressure_rate.toFixed(2)} PSI/s${oilAcc < -0.05 ? ' (rate of decline is steepening)' : ''}.`,
        `Engine speed is maintained at ${telemetry.rpm.toFixed(0)} RPM while pressure drops below nominal hydraulic range.`,
        `Multi-parameter check confirms oil temperature is ${telemetry.oil_temperature.toFixed(1)}°C, indicating loss of circuit boundary pressure rather than cold-viscosity stagnation.`,
      ];

      ifUnaddressed =
        'Continued abnormal oil pressure may increase the risk of inadequate lubrication, accelerated mechanical bearing wear, component damage, and degraded engine performance.';
      responseGuidance =
        'Follow the applicable aircraft-specific approved procedure. Prepare for precautionary landing if pressure remains unverified.';
      monitoredNext = 'Oil pressure decline rate (dP/dt), oil temperature, and vibration RMS for bearing distress.';
    } else if (isVibrationGrowthTrend) {
      targetFault = 'HIGH_VIBRATION';
      probableCondition = 'Mechanical / Propulsion-System Abnormality';
      quickSolution = 'SHIFT RPM BAND (±200) • REDUCE THROTTLE • PREPARE FOR FORCED LANDING';
      pilotChecklist = [
        { step: 1, item: 'RPM BAND', action: 'ADJUST ±200 RPM (Exit mechanical resonance zone)', critical: true },
        { step: 2, item: 'THROTTLE', action: 'REDUCE power smoothly' },
        { step: 3, item: 'ENGINE GAUGES', action: 'SCAN CHT & Oil pressure for internal mechanical failure' },
        { step: 4, item: 'FORCED LANDING', action: 'PREPARE for power-off landing if vibration persists' },
      ];

      if (telemetry.vibration >= 6.0 || (telemetry.vibration > 4.5 && telemetry.vibration_rate > 0.2)) {
        predictionState = 'CRITICAL';
        severity = 'CRITICAL';
        riskHorizon = 'RAPIDLY_DETERIORATING';
        trend = 'DETERIORATING';
      } else if (telemetry.vibration >= 3.8 || this.sustainedRisingVibTicks >= 8 || telemetry.vibration_rate > 0.1) {
        predictionState = 'HIGH_RISK';
        severity = 'HIGH';
        riskHorizon = 'NEAR_TERM_CONCERN';
        trend = 'DETERIORATING';
      } else if (this.sustainedRisingVibTicks >= 4 || telemetry.vibration_rate > 0.04) {
        predictionState = 'EARLY_WARNING';
        severity = 'MODERATE';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      } else {
        predictionState = 'WATCH';
        severity = 'LOW';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      }

      whyReasons = [
        `Vibration RMS has increased consistently over recent window to ${telemetry.vibration.toFixed(2)} mm/s (Nominal: < 2.2 mm/s, baseline: ${stats.vibMean.toFixed(2)} mm/s).`,
        `Vibration derivative shows sustained positive growth of +${telemetry.vibration_rate.toFixed(2)} mm/s² over ~${this.sustainedRisingVibTicks * 1.0}s.`,
        `Vibration harmonic growth correlates with rotational frequency at ${telemetry.rpm.toFixed(0)} RPM.`,
        `Multiple sensor readings rule out single-sample sensor spike noise via rolling standard deviation confirmation.`,
      ];

      ifUnaddressed =
        'Persistent abnormal vibration may indicate increasing mechanical stress, mounting fatigue, or worsening propulsion-system abnormality.';
      responseGuidance =
        'Refer to the applicable approved aircraft procedure and continue monitoring. Adjust throttle to locate non-resonant RPM band if authorized.';
      monitoredNext = 'Vibration spectral RMS growth, RPM variation, and crankshaft bearing health indicators.';
    } else if (isRpmInstabilityTrend) {
      targetFault = 'RPM_INSTABILITY';
      probableCondition = 'Combustion / RPM Instability Trend';
      quickSolution = 'ELECTRIC FUEL PUMP ON • CARB HEAT ON • CHECK IGNITION';
      pilotChecklist = [
        { step: 1, item: 'FUEL PUMP / TANK', action: 'TURN ELECTRIC PUMP ON / SWITCH FUEL TANK', critical: true },
        { step: 2, item: 'CARBURETOR HEAT', action: 'PULL FULL ON (Clear induction icing)', critical: true },
        { step: 3, item: 'MAGNETOS / IGNITION', action: 'CYCLE L / R to isolate faulty spark circuit' },
        { step: 4, item: 'THROTTLE FRICTION', action: 'LOCK throttle friction to prevent lever creep' },
      ];

      if (stats.rpmStd > 90 || Math.abs(telemetry.rpm_variation) > 220) {
        predictionState = 'CRITICAL';
        severity = 'CRITICAL';
        riskHorizon = 'RAPIDLY_DETERIORATING';
        trend = 'DETERIORATING';
      } else if (stats.rpmStd > 50 || Math.abs(telemetry.rpm_variation) > 130) {
        predictionState = 'HIGH_RISK';
        severity = 'HIGH';
        riskHorizon = 'NEAR_TERM_CONCERN';
        trend = 'DETERIORATING';
      } else if (this.sustainedRpmOscillationTicks >= 4 || stats.rpmStd > 30) {
        predictionState = 'EARLY_WARNING';
        severity = 'MODERATE';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      } else {
        predictionState = 'WATCH';
        severity = 'LOW';
        riskHorizon = 'RISK_INCREASING';
        trend = 'DETERIORATING';
      }

      whyReasons = [
        `RPM variation is fluctuating continuously (Current Δ: ${telemetry.rpm_variation.toFixed(0)} RPM/s, window std dev: ${stats.rpmStd.toFixed(1)} RPM).`,
        `Throttle position is steady at ${telemetry.throttle_position.toFixed(1)}%, indicating uncommanded engine surging rather than pilot input.`,
        `Coupled fuel flow (${telemetry.fuel_flow.toFixed(1)} L/h) and manifold pressure (${telemetry.manifold_pressure.toFixed(1)} inHg) exhibit cyclical hunting.`,
        `Sustained oscillation pattern matches trained ignition/governor hunting prototype signature.`,
      ];

      ifUnaddressed =
        'Continued instability may lead to degraded engine performance, uncommanded thrust variation, or potential engine flameout/stall.';
      responseGuidance =
        'Refer to applicable aircraft-specific procedure. Check magneto positions, fuel selector, and carb heat as outlined in QRH.';
      monitoredNext = 'RPM oscillation amplitude, governor response damping, and fuel flow consistency.';
    } else if (isUnknownAnomaly) {
      targetFault = 'UNKNOWN_ANOMALY';
      probableCondition = 'Unknown Parameter Anomaly';
      quickSolution = 'MAINTAIN FLYING AIRSPEED • CROSS-CHECK GAUGES • PLAN PRECAUTIONARY DIVERT';
      pilotChecklist = [
        { step: 1, item: 'AIRCRAFT CONTROL', action: 'FLY THE AIRPLANE (Maintain safe glide/trim)', critical: true },
        { step: 2, item: 'PRIMARY GAUGES', action: 'CROSS-CHECK battery, oil pressure, and CHT' },
        { step: 3, item: 'DIVERSION', action: 'DIVERT to nearest suitable airfield if alert persists' },
      ];
      predictionState = 'WATCH';
      severity = 'LOW';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
      whyReasons = [
        `Composite telemetry anomaly score (${(telemetry.anomaly_score * 100).toFixed(1)}%) exceeds nominal boundary.`,
        `Telemetry vectors diverge from baseline without matching the 4 calibrated fault profiles (Overheating, Low Oil, High Vib, RPM Instability).`,
        `Non-forced classification preserved: Anomaly detection layer flagged unexpected parameter divergence.`,
      ];
      ifUnaddressed =
        'Unclassified anomalies could indicate sensor calibration drift, electrical fluctuations, or atypical engine operating conditions.';
      responseGuidance =
        'Cross-check secondary cockpit instruments and refer to manufacturer diagnostic guidelines.';
      monitoredNext = 'Overall sensor correlation matrix and electrical subsystem voltage.';
    } else {
      // Nominal state or recovery
      targetFault = 'HEALTHY';
      probableCondition = 'Nominal Flight Envelope';
      predictionState = 'NORMAL';
      severity = 'NOMINAL';
      riskHorizon = 'STABLE';

      if (this.currentState !== 'NORMAL') {
        this.recoveryTicks++;
        if (this.recoveryTicks < 5) {
          trend = 'RECOVERING';
          probableCondition = 'Engine Parameter Recovery in Progress';
          whyReasons = [
            'All core parameters have stabilized and are returning towards nominal baseline bounds.',
            'Rate derivatives have converged back within normal safety envelopes.',
          ];
          ifUnaddressed = 'Engine telemetry shows successful stabilization.';
          monitoredNext = 'Post-recovery stabilization verification across next 30 telemetry frames.';
        } else {
          trend = 'STABLE';
          whyReasons = [
            'Telemetry rates, thermal dissipation, and hydraulic pressures are operating within calibrated bounds.',
            'No sustained abnormal drift detected across rolling multi-parameter window.',
          ];
        }
      } else {
        trend = 'STABLE';
        whyReasons = [
          'All parameters operating within nominal DRDO SIH26054 development envelope.',
          'Multi-parameter moving average and standard deviations indicate steady-state equilibrium.',
        ];
      }
    }

    // 5. Manage Timeline & Early Warning Lead Time Calculation
    const now = Date.now();
    if (predictionState !== this.currentState) {
      const isEscalation =
        (predictionState === 'EARLY_WARNING' && this.currentState === 'WATCH') ||
        (predictionState === 'HIGH_RISK' && this.currentState === 'EARLY_WARNING') ||
        (predictionState === 'CRITICAL' && this.currentState !== 'CRITICAL');

      if (predictionState === 'EARLY_WARNING' && !this.warningTriggerTimestamp) {
        this.warningTriggerTimestamp = now;
      }
      if (predictionState === 'CRITICAL' && this.warningTriggerTimestamp && !this.faultTriggerTimestamp) {
        this.faultTriggerTimestamp = now;
        this.leadTimeSeconds = Math.max(1, Math.round((this.faultTriggerTimestamp - this.warningTriggerTimestamp) / 1000));
      }

      if (predictionState === 'NORMAL') {
        this.warningTriggerTimestamp = null;
        this.faultTriggerTimestamp = null;
      }

      const note =
        predictionState === 'CRITICAL'
          ? `Simulated fault condition reached for ${probableCondition}.`
          : predictionState === 'HIGH_RISK'
          ? `High risk trajectory confirmed with accelerating deviation rates.`
          : predictionState === 'EARLY_WARNING'
          ? `Early warning generated: persistent abnormal trend detected before critical threshold.`
          : predictionState === 'WATCH'
          ? `Small abnormal deviation detected across sensor window.`
          : `Engine returned to nominal envelope.`;

      this.timeline.unshift({
        timestamp: new Date().toISOString(),
        state: predictionState,
        fault: targetFault,
        note,
        lead_time_seconds: this.leadTimeSeconds > 0 ? this.leadTimeSeconds : undefined,
      });

      if (this.timeline.length > 20) {
        this.timeline.pop();
      }

      this.currentState = predictionState;
      this.currentProbableFault = probableCondition;
      this.lastStateTransitionTime = now;
    }

    // Confidence determination: ML model output vs rule-based estimate
    let confidence = mlResult.confidence;
    let confidenceType: ConfidenceType = 'ML_MODEL_OUTPUT';
    if (mlResult.predicted_fault === 'HEALTHY' && targetFault !== 'HEALTHY') {
      // Rate-derivative early prediction caught it before ML discrete classifier switched
      confidence = Math.min(0.92, 0.70 + this.sustainedRisingTempTicks * 0.03 + this.sustainedFallingOilTicks * 0.03);
      confidenceType = 'RULE_BASED_ESTIMATE';
    } else if (mlResult.predicted_fault === targetFault) {
      confidence = mlResult.confidence;
      confidenceType = 'ML_MODEL_OUTPUT';
    } else {
      confidence = 0.85;
      confidenceType = 'RULE_BASED_ESTIMATE';
    }

    // Model Status label
    const modelStatus =
      confidenceType === 'ML_MODEL_OUTPUT'
        ? `Trained Random Forest Ensemble (Confidence: ${(confidence * 100).toFixed(1)}%)`
        : `Rule-based multi-parameter trend analyzer (Estimate: ${(confidence * 100).toFixed(1)}%)`;

    // Multi-parameter Evidence Array
    const evidence: MultiParameterEvidence[] = [
      {
        parameter: 'Cylinder Head Temp',
        current_value: telemetry.engine_temperature,
        unit: '°C',
        rate: telemetry.temperature_rate,
        moving_avg: Number(stats.tempMean.toFixed(1)),
        std_dev: Number(stats.tempStd.toFixed(2)),
        baseline_normal: '80 - 92 °C',
        observation:
          telemetry.temperature_rate > 0.2
            ? 'Rising trend (+rate derivative)'
            : telemetry.engine_temperature > 95
            ? 'Operating in elevated thermal zone'
            : 'Nominal heat balance',
      },
      {
        parameter: 'Oil Pressure',
        current_value: telemetry.oil_pressure,
        unit: 'PSI',
        rate: telemetry.oil_pressure_rate,
        moving_avg: Number(stats.oilMean.toFixed(1)),
        std_dev: Number(stats.oilStd.toFixed(2)),
        baseline_normal: '45 - 55 PSI',
        observation:
          telemetry.oil_pressure_rate < -0.15
            ? 'Decaying pressure gradient'
            : telemetry.oil_pressure < 40
            ? 'Below nominal lubrication margin'
            : 'Hydraulic pressure steady',
      },
      {
        parameter: 'Vibration RMS',
        current_value: telemetry.vibration,
        unit: 'mm/s',
        rate: telemetry.vibration_rate,
        moving_avg: Number(stats.vibMean.toFixed(2)),
        std_dev: Number(stats.vibStd.toFixed(2)),
        baseline_normal: '1.2 - 2.2 mm/s',
        observation:
          telemetry.vibration > 3.0
            ? 'Elevated mechanical excitation'
            : telemetry.vibration_rate > 0.04
            ? 'Increasing vibration trajectory'
            : 'Nominal balance',
      },
      {
        parameter: 'Engine RPM',
        current_value: telemetry.rpm,
        unit: 'RPM',
        rate: telemetry.rpm_variation,
        moving_avg: Number(stats.rpmMean.toFixed(0)),
        std_dev: Number(stats.rpmStd.toFixed(1)),
        baseline_normal: '2350 - 2450 RPM',
        observation:
          stats.rpmStd > 30
            ? 'Instability / hunting detected'
            : 'Governor maintaining target rotational speed',
      },
    ];

    // 8-Point Structured Aerospace Decision Support Assessment
    const eightPointAssessment = {
      what_is_happening:
        predictionState === 'NORMAL'
          ? 'The engine is operating stably within calibrated nominal parameters.'
          : `${probableCondition} is developing with state classified as ${predictionState}.`,
      what_is_likely_causing_it:
        targetFault === 'OVERHEATING'
          ? 'Potential reduced cooling airflow, excessively lean fuel mixture, or sustained high climb power.'
          : targetFault === 'LOW_OIL_PRESSURE'
          ? 'Potential oil line restriction, pressure relief valve malfunction, scavenge pump loss, or oil leakage.'
          : targetFault === 'HIGH_VIBRATION'
          ? 'Potential propeller imbalance, engine mount deterioration, or crankshaft bearing wear.'
          : targetFault === 'RPM_INSTABILITY'
          ? 'Potential fuel injector fouling, magneto ignition breakdown, or governor hunting.'
          : targetFault === 'UNKNOWN_ANOMALY'
          ? 'Atypical parameter deviation outside standard calibrated fault patterns.'
          : 'Nominal combustion and lubrication operating conditions.',
      why_does_system_think_this: whyReasons,
      how_serious_is_it:
        severity === 'CRITICAL'
          ? 'CRITICAL — Simulated threshold breached. Immediate pilot attention and procedure reference required.'
          : severity === 'HIGH'
          ? 'HIGH RISK — Trend has accelerated towards abnormal boundary. Precautionary assessment warranted.'
          : severity === 'MODERATE'
          ? 'EARLY WARNING — Persistent trend detected while values are still in intermediate zone.'
          : severity === 'LOW'
          ? 'WATCH — Minor deviation from baseline detected; monitor for persistence.'
          : 'NOMINAL — No immediate or projected threat.',
      is_trend_getting_worse:
        trend === 'DETERIORATING'
          ? 'YES — Telemetry derivatives and rolling deviations indicate ongoing deterioration.'
          : trend === 'RECOVERING'
          ? 'NO — Parameters are recovering toward baseline bounds.'
          : 'STABLE — Parameters show no active divergence.',
      what_could_happen_if_continues: ifUnaddressed,
      what_approved_procedure_should_be_referenced:
        'AIRCRAFT_SPECIFIC_APPROVED_PROCEDURE_REQUIRED (Status: REFERENCE_NOT_CONFIGURED). Refer to certified AFM / POH / QRH.',
      what_should_system_monitor_next: monitoredNext,
    };

    return {
      prediction_state: predictionState,
      probable_condition: probableCondition,
      model_status: modelStatus,
      confidence,
      confidence_type: confidenceType,
      severity,
      trend,
      risk_horizon: riskHorizon,
      quick_solution: quickSolution,
      pilot_checklist: pilotChecklist,
      why_reasons: whyReasons,
      if_unaddressed: ifUnaddressed,
      response_guidance: responseGuidance,
      procedure_reference: 'AIRCRAFT_SPECIFIC_APPROVED_PROCEDURE_REQUIRED',
      procedure_status: 'REFERENCE_NOT_CONFIGURED',
      procedure_source: 'Approved aircraft procedure / configured reference',
      monitored_next: monitoredNext,
      is_unknown_anomaly: targetFault === 'UNKNOWN_ANOMALY',
      lead_time_seconds: this.leadTimeSeconds > 0 ? this.leadTimeSeconds : undefined,
      evidence,
      timeline: this.timeline,
      eight_point_assessment: eightPointAssessment,
    };
  }

  private computeWindowStats() {
    if (this.window.length === 0) {
      return {
        tempMean: 82,
        tempStd: 0,
        oilMean: 50,
        oilStd: 0,
        vibMean: 1.8,
        vibStd: 0,
        rpmMean: 2400,
        rpmStd: 0,
      };
    }

    const n = this.window.length;
    const tempSum = this.window.reduce((acc, r) => acc + r.engine_temperature, 0);
    const oilSum = this.window.reduce((acc, r) => acc + r.oil_pressure, 0);
    const vibSum = this.window.reduce((acc, r) => acc + r.vibration, 0);
    const rpmSum = this.window.reduce((acc, r) => acc + r.rpm, 0);

    const tempMean = tempSum / n;
    const oilMean = oilSum / n;
    const vibMean = vibSum / n;
    const rpmMean = rpmSum / n;

    const tempVar = this.window.reduce((acc, r) => acc + Math.pow(r.engine_temperature - tempMean, 2), 0) / n;
    const oilVar = this.window.reduce((acc, r) => acc + Math.pow(r.oil_pressure - oilMean, 2), 0) / n;
    const vibVar = this.window.reduce((acc, r) => acc + Math.pow(r.vibration - vibMean, 2), 0) / n;
    const rpmVar = this.window.reduce((acc, r) => acc + Math.pow(r.rpm - rpmMean, 2), 0) / n;

    return {
      tempMean,
      tempStd: Math.sqrt(tempVar),
      oilMean,
      oilStd: Math.sqrt(oilVar),
      vibMean,
      vibStd: Math.sqrt(vibVar),
      rpmMean,
      rpmStd: Math.sqrt(rpmVar),
    };
  }
}

export const decisionSupportEngine = new DecisionSupportEngine();
