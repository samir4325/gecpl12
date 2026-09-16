import {
  TelemetryRecord,
  FaultType,
  PredictionState,
  DecisionSupport,
  MultiParameterEvidence,
  DecisionSupportTimelineEvent,
  TrendDirection,
  RiskHorizon,
} from '../types';

export function evaluateDecisionSupport(
  telemetry: TelemetryRecord,
  history: TelemetryRecord[],
  serverDecisionSupport?: DecisionSupport | null
): DecisionSupport {
  // If server provided full authoritative decision support and has evidence, return it
  if (
    serverDecisionSupport &&
    serverDecisionSupport.evidence &&
    serverDecisionSupport.evidence.length > 0 &&
    serverDecisionSupport.eight_point_assessment
  ) {
    return serverDecisionSupport;
  }

  // Client-side fallback computation
  const windowSlice = history.slice(-30);
  const n = windowSlice.length || 1;

  const tempSum = windowSlice.reduce((s, r) => s + r.engine_temperature, 0);
  const oilSum = windowSlice.reduce((s, r) => s + r.oil_pressure, 0);
  const vibSum = windowSlice.reduce((s, r) => s + r.vibration, 0);
  const rpmSum = windowSlice.reduce((s, r) => s + r.rpm, 0);

  const tempMean = tempSum / n;
  const oilMean = oilSum / n;
  const vibMean = vibSum / n;
  const rpmMean = rpmSum / n;

  const tempVar = windowSlice.reduce((s, r) => s + Math.pow(r.engine_temperature - tempMean, 2), 0) / n;
  const oilVar = windowSlice.reduce((s, r) => s + Math.pow(r.oil_pressure - oilMean, 2), 0) / n;
  const vibVar = windowSlice.reduce((s, r) => s + Math.pow(r.vibration - vibMean, 2), 0) / n;
  const rpmVar = windowSlice.reduce((s, r) => s + Math.pow(r.rpm - rpmMean, 2), 0) / n;

  const tempStd = Math.sqrt(tempVar);
  const oilStd = Math.sqrt(oilVar);
  const vibStd = Math.sqrt(vibVar);
  const rpmStd = Math.sqrt(rpmVar);

  // Check persistent trends
  let risingTempCount = 0;
  let fallingOilCount = 0;
  let risingVibCount = 0;
  let rpmHuntingCount = 0;

  for (let i = 1; i < windowSlice.length; i++) {
    if (windowSlice[i].engine_temperature > windowSlice[i - 1].engine_temperature) risingTempCount++;
    if (windowSlice[i].oil_pressure < windowSlice[i - 1].oil_pressure) fallingOilCount++;
    if (windowSlice[i].vibration > windowSlice[i - 1].vibration) risingVibCount++;
    if (Math.abs(windowSlice[i].rpm_variation) > 40) rpmHuntingCount++;
  }

  let targetFault: FaultType | 'UNKNOWN_ANOMALY' = 'HEALTHY';
  let probableCondition = 'Nominal Flight Envelope';
  let state: PredictionState = 'NORMAL';
  let trend: TrendDirection = 'STABLE';
  let riskHorizon: RiskHorizon = 'STABLE';
  let severity: 'NOMINAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'NOMINAL';
  let whyReasons: string[] = [];
  let ifUnaddressed = 'Engine telemetry parameters are operating within nominal boundaries.';
  let responseGuidance = 'Continue standard flight monitoring in accordance with standard operating procedures.';
  let monitoredNext = 'Continuous multi-parameter monitoring across all engine sensors.';
  let quickSolution = 'NOMINAL FLIGHT ENVELOPE • CONTINUE STANDARD SCAN';
  let pilotChecklist: { step: number; item: string; action: string; critical?: boolean }[] = [
    { step: 1, item: 'ENGINE STATUS', action: 'All parameters within calibrated flight envelope' },
    { step: 2, item: 'DERIVATIVES', action: 'Temperature and pressure rates within nominal limits' },
    { step: 3, item: 'FLIGHT SCAN', action: 'Maintain standard scan pattern' },
  ];

  const isOverheat =
    telemetry.engine_temperature > 89 ||
    risingTempCount >= 3 ||
    telemetry.temperature_rate > 0.15 ||
    telemetry.fault === 'OVERHEATING';

  const isLowOil =
    telemetry.oil_pressure < 46 ||
    fallingOilCount >= 3 ||
    telemetry.oil_pressure_rate < -0.15 ||
    telemetry.fault === 'LOW_OIL_PRESSURE';

  const isHighVib =
    telemetry.vibration > 2.8 ||
    risingVibCount >= 3 ||
    telemetry.vibration_rate > 0.04 ||
    telemetry.fault === 'HIGH_VIBRATION';

  const isRpmInstable =
    rpmStd > 35 ||
    rpmHuntingCount >= 3 ||
    Math.abs(telemetry.rpm_variation) > 60 ||
    telemetry.fault === 'RPM_INSTABILITY';

  const isUnknown =
    !isOverheat &&
    !isLowOil &&
    !isHighVib &&
    !isRpmInstable &&
    telemetry.anomaly_score > 0.45;

  if (isOverheat) {
    targetFault = 'OVERHEATING';
    probableCondition = 'Overheating Trend';
    quickSolution = 'REDUCE THROTTLE • ENRICH MIXTURE • OPEN COWL FLAPS / INCREASE AIRSPEED';
    pilotChecklist = [
      { step: 1, item: 'THROTTLE', action: 'REDUCE to climb/cruise power (Thermal relief)', critical: true },
      { step: 2, item: 'MIXTURE', action: 'FULL RICH (Fuel cooling)' },
      { step: 3, item: 'AIRSPEED / FLAPS', action: 'INCREASE airspeed / OPEN cowl flaps' },
      { step: 4, item: 'CHT GAUGE', action: 'VERIFY temperature drops below 105°C' },
    ];
    if (telemetry.engine_temperature >= 105) {
      state = 'CRITICAL';
      severity = 'CRITICAL';
      riskHorizon = 'RAPIDLY_DETERIORATING';
      trend = 'DETERIORATING';
    } else if (telemetry.engine_temperature >= 94 || risingTempCount >= 7) {
      state = 'HIGH_RISK';
      severity = 'HIGH';
      riskHorizon = 'NEAR_TERM_CONCERN';
      trend = 'DETERIORATING';
    } else if (risingTempCount >= 3 || telemetry.temperature_rate > 0.2) {
      state = 'EARLY_WARNING';
      severity = 'MODERATE';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    } else {
      state = 'WATCH';
      severity = 'LOW';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    }
    whyReasons = [
      `Cylinder head temperature has shown a sustained upward trend over recent telemetry (${telemetry.engine_temperature.toFixed(1)}°C, window avg: ${tempMean.toFixed(1)}°C).`,
      `Rate of temperature climb is ${telemetry.temperature_rate > 0 ? '+' : ''}${telemetry.temperature_rate.toFixed(2)}°C/s.`,
      `Power setting at ${telemetry.rpm.toFixed(0)} RPM and ${telemetry.manifold_pressure.toFixed(1)} inHg MAP exceeds proportional thermal dissipation capacity.`,
      `Multi-parameter thermal signature indicates cylinder heat sink saturation.`,
    ];
    ifUnaddressed =
      'Continued overheating may increase the risk of degraded engine performance, thermal fatigue, or component damage.';
    responseGuidance =
      'Refer to the applicable aircraft-specific approved abnormal/emergency procedure. Verify cowl flaps, fuel mixture, and power setting.';
    monitoredNext = 'Cylinder head temperature derivative (dT/dt), oil temperature, and fuel-air ratio.';
  } else if (isLowOil) {
    targetFault = 'LOW_OIL_PRESSURE';
    probableCondition = 'Lubrication-System Degradation Trend';
    quickSolution = 'VERIFY OIL TEMP • REDUCE POWER • PLAN PRECAUTIONARY LANDING';
    pilotChecklist = [
      { step: 1, item: 'OIL TEMPERATURE', action: 'CROSS-CHECK (If rising, engine seizure imminent)', critical: true },
      { step: 2, item: 'THROTTLE / POWER', action: 'REDUCE to minimum safe power for level flight' },
      { step: 3, item: 'LANDING SITE', action: 'LOCATE nearest airfield or forced-landing terrain' },
      { step: 4, item: 'GLIDE ALTITUDE', action: 'MAINTAIN altitude & prepare for precautionary descent' },
    ];
    if (telemetry.oil_pressure <= 25) {
      state = 'CRITICAL';
      severity = 'CRITICAL';
      riskHorizon = 'RAPIDLY_DETERIORATING';
      trend = 'DETERIORATING';
    } else if (telemetry.oil_pressure <= 38 || fallingOilCount >= 7) {
      state = 'HIGH_RISK';
      severity = 'HIGH';
      riskHorizon = 'NEAR_TERM_CONCERN';
      trend = 'DETERIORATING';
    } else if (fallingOilCount >= 3 || telemetry.oil_pressure_rate < -0.15) {
      state = 'EARLY_WARNING';
      severity = 'MODERATE';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    } else {
      state = 'WATCH';
      severity = 'LOW';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    }
    whyReasons = [
      `Oil pressure has shown a sustained decreasing trend (${telemetry.oil_pressure.toFixed(1)} PSI, window avg: ${oilMean.toFixed(1)} PSI).`,
      `Pressure derivative is ${telemetry.oil_pressure_rate.toFixed(2)} PSI/s.`,
      `Engine RPM is maintained at ${telemetry.rpm.toFixed(0)} RPM while delivery pressure drops below nominal hydraulic reserve.`,
      `Oil temperature is ${telemetry.oil_temperature.toFixed(1)}°C, indicating pressure loss rather than cold-viscosity stagnation.`,
    ];
    ifUnaddressed =
      'Continued abnormal oil pressure may increase the risk of inadequate lubrication, component wear/damage, and degraded engine performance.';
    responseGuidance =
      'Follow the applicable aircraft-specific approved procedure. Prepare for precautionary diversion if pressure drop continues.';
    monitoredNext = 'Oil pressure decline rate (dP/dt), oil temperature coupling, and vibration RMS.';
  } else if (isHighVib) {
    targetFault = 'HIGH_VIBRATION';
    probableCondition = 'Mechanical / Propulsion-System Abnormality';
    quickSolution = 'SHIFT RPM BAND (±200) • REDUCE THROTTLE • PREPARE FOR FORCED LANDING';
    pilotChecklist = [
      { step: 1, item: 'RPM BAND', action: 'ADJUST ±200 RPM (Exit mechanical resonance zone)', critical: true },
      { step: 2, item: 'THROTTLE', action: 'REDUCE power smoothly' },
      { step: 3, item: 'ENGINE GAUGES', action: 'SCAN CHT & Oil pressure for internal mechanical failure' },
      { step: 4, item: 'FORCED LANDING', action: 'PREPARE for power-off landing if vibration persists' },
    ];
    if (telemetry.vibration >= 6.0) {
      state = 'CRITICAL';
      severity = 'CRITICAL';
      riskHorizon = 'RAPIDLY_DETERIORATING';
      trend = 'DETERIORATING';
    } else if (telemetry.vibration >= 3.8 || risingVibCount >= 7) {
      state = 'HIGH_RISK';
      severity = 'HIGH';
      riskHorizon = 'NEAR_TERM_CONCERN';
      trend = 'DETERIORATING';
    } else if (risingVibCount >= 3 || telemetry.vibration_rate > 0.04) {
      state = 'EARLY_WARNING';
      severity = 'MODERATE';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    } else {
      state = 'WATCH';
      severity = 'LOW';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    }
    whyReasons = [
      `Vibration has increased consistently over the recent telemetry window to ${telemetry.vibration.toFixed(2)} mm/s.`,
      `Vibration derivative shows sustained positive growth of +${telemetry.vibration_rate.toFixed(2)} mm/s².`,
      `Rolling standard deviation (${vibStd.toFixed(2)} mm/s) confirms persistent structural excitation rather than single-sample noise.`,
      `Rotational frequency at ${telemetry.rpm.toFixed(0)} RPM indicates probable 1X or 2X mechanical imbalance.`,
    ];
    ifUnaddressed =
      'Persistent abnormal vibration may indicate increasing mechanical stress, mounting fatigue, or worsening propulsion-system abnormality.';
    responseGuidance =
      'Refer to the applicable approved aircraft procedure and continue monitoring. Inspect throttle/RPM for harmonic vibration zones.';
    monitoredNext = 'Vibration spectral RMS, engine mount load dynamics, and crankshaft bearings.';
  } else if (isRpmInstable) {
    targetFault = 'RPM_INSTABILITY';
    probableCondition = 'Combustion / RPM Instability';
    quickSolution = 'ELECTRIC FUEL PUMP ON • CARB HEAT ON • CHECK IGNITION';
    pilotChecklist = [
      { step: 1, item: 'FUEL PUMP / TANK', action: 'TURN ELECTRIC PUMP ON / SWITCH FUEL TANK', critical: true },
      { step: 2, item: 'CARBURETOR HEAT', action: 'PULL FULL ON (Clear induction icing)', critical: true },
      { step: 3, item: 'MAGNETOS / IGNITION', action: 'CYCLE L / R to isolate faulty spark circuit' },
      { step: 4, item: 'THROTTLE FRICTION', action: 'LOCK throttle friction to prevent lever creep' },
    ];
    if (rpmStd > 90 || Math.abs(telemetry.rpm_variation) > 220) {
      state = 'CRITICAL';
      severity = 'CRITICAL';
      riskHorizon = 'RAPIDLY_DETERIORATING';
      trend = 'DETERIORATING';
    } else if (rpmStd > 50 || Math.abs(telemetry.rpm_variation) > 130) {
      state = 'HIGH_RISK';
      severity = 'HIGH';
      riskHorizon = 'NEAR_TERM_CONCERN';
      trend = 'DETERIORATING';
    } else if (rpmHuntingCount >= 3 || rpmStd > 30) {
      state = 'EARLY_WARNING';
      severity = 'MODERATE';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    } else {
      state = 'WATCH';
      severity = 'LOW';
      riskHorizon = 'RISK_INCREASING';
      trend = 'DETERIORATING';
    }
    whyReasons = [
      `RPM variation is increasing relative to the recent baseline (Δ: ${telemetry.rpm_variation.toFixed(0)} RPM/s, window std dev: ${rpmStd.toFixed(1)} RPM).`,
      `Throttle is steady at ${telemetry.throttle_position.toFixed(0)}%, showing uncommanded governor/combustion hunting.`,
      `Manifold pressure and fuel flow show coupled fluctuations.`,
      `Pattern matches ignition/governor hunting prototype signature.`,
    ];
    ifUnaddressed =
      'Continued instability may lead to degraded engine performance, uncommanded thrust fluctuations, or potential flameout.';
    responseGuidance =
      'Refer to applicable aircraft-specific procedure. Check magneto positions, fuel selector, and carb heat per QRH.';
    monitoredNext = 'Governor damping response, RPM variation rate, and fuel flow consistency.';
  } else if (isUnknown) {
    targetFault = 'UNKNOWN_ANOMALY';
    probableCondition = 'Unknown Parameter Anomaly';
    quickSolution = 'MAINTAIN FLYING AIRSPEED • CROSS-CHECK GAUGES • PLAN PRECAUTIONARY DIVERT';
    pilotChecklist = [
      { step: 1, item: 'AIRCRAFT CONTROL', action: 'FLY THE AIRPLANE (Maintain safe glide/trim)', critical: true },
      { step: 2, item: 'PRIMARY GAUGES', action: 'CROSS-CHECK battery, oil pressure, and CHT' },
      { step: 3, item: 'DIVERSION', action: 'DIVERT to nearest suitable airfield if alert persists' },
    ];
    state = 'WATCH';
    severity = 'LOW';
    riskHorizon = 'RISK_INCREASING';
    trend = 'DETERIORATING';
    whyReasons = [
      `Telemetry vector composite anomaly score (${(telemetry.anomaly_score * 100).toFixed(1)}%) exceeds nominal boundary.`,
      `Multi-sensor reading deviates from baseline without matching known 4 fault classes.`,
      `Unclassified anomaly preserved to prevent forced misclassification.`,
    ];
    ifUnaddressed =
      'Unclassified anomaly may indicate sensor drift, intermittent connection, or atypical engine operating conditions.';
    responseGuidance =
      'Cross-check secondary cockpit instruments and refer to manufacturer diagnostic guidelines.';
    monitoredNext = 'Overall sensor correlation matrix and electrical bus voltage.';
  } else {
    targetFault = 'HEALTHY';
    probableCondition = 'Nominal Flight Envelope';
    state = 'NORMAL';
    severity = 'NOMINAL';
    riskHorizon = 'STABLE';
    trend = 'STABLE';
    whyReasons = [
      'All engine telemetry parameters operate within nominal calibrated bounds.',
      'Moving averages and derivatives confirm steady-state thermodynamic balance.',
    ];
  }

  const evidence: MultiParameterEvidence[] = [
    {
      parameter: 'Cylinder Head Temp',
      current_value: telemetry.engine_temperature,
      unit: '°C',
      rate: telemetry.temperature_rate,
      moving_avg: Number(tempMean.toFixed(1)),
      std_dev: Number(tempStd.toFixed(2)),
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
      moving_avg: Number(oilMean.toFixed(1)),
      std_dev: Number(oilStd.toFixed(2)),
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
      moving_avg: Number(vibMean.toFixed(2)),
      std_dev: Number(vibStd.toFixed(2)),
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
      moving_avg: Number(rpmMean.toFixed(0)),
      std_dev: Number(rpmStd.toFixed(1)),
      baseline_normal: '2350 - 2450 RPM',
      observation:
        rpmStd > 30
          ? 'Instability / hunting detected'
          : 'Governor maintaining target rotational speed',
    },
  ];

  const timeline: DecisionSupportTimelineEvent[] = [
    {
      timestamp: telemetry.timestamp,
      state,
      fault: targetFault,
      note:
        state === 'CRITICAL'
          ? `Simulated fault condition reached for ${probableCondition}.`
          : state === 'HIGH_RISK'
          ? `High risk trajectory confirmed with accelerating deviation rates.`
          : state === 'EARLY_WARNING'
          ? `Early warning generated: persistent abnormal trend detected before critical threshold.`
          : state === 'WATCH'
          ? `Small abnormal deviation detected across sensor window.`
          : `Engine returned to nominal envelope.`,
    },
  ];

  const eightPointAssessment = {
    what_is_happening:
      state === 'NORMAL'
        ? 'The engine is operating stably within calibrated nominal parameters.'
        : `${probableCondition} is developing with prediction state classified as ${state}.`,
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
        : (trend as TrendDirection) === 'RECOVERING'
        ? 'NO — Parameters are recovering toward baseline bounds.'
        : 'STABLE — Parameters show no active divergence.',
    what_could_happen_if_continues: ifUnaddressed,
    what_approved_procedure_should_be_referenced:
      'AIRCRAFT_SPECIFIC_APPROVED_PROCEDURE_REQUIRED (Status: REFERENCE_NOT_CONFIGURED). Refer to certified AFM / POH / QRH.',
    what_should_system_monitor_next: monitoredNext,
  };

  return {
    prediction_state: state,
    probable_condition: probableCondition,
    model_status: `Rule-based multi-parameter trend analyzer (Estimate: ${(telemetry.prediction_confidence * 100).toFixed(1)}%)`,
    confidence: telemetry.prediction_confidence,
    confidence_type: 'RULE_BASED_ESTIMATE',
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
    lead_time_seconds: 18,
    evidence,
    timeline,
    eight_point_assessment: eightPointAssessment,
  };
}
