import { FaultType, SimulationMode, RawTelemetryInput } from './types';

// Box-Muller transform for normal distribution noise
function gaussianNoise(mean = 0, stdev = 1): number {
  const u1 = Math.max(1e-6, Math.random());
  const u2 = Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdev * randStdNormal;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class AeroEngineSimulator {
  private mode: SimulationMode = 'HEALTHY';
  private faultStep = 0;
  private autoCycleTimer = 0;
  private autoModeSequence: FaultType[] = [
    'HEALTHY',
    'OVERHEATING',
    'HEALTHY',
    'LOW_OIL_PRESSURE',
    'HEALTHY',
    'HIGH_VIBRATION',
    'HEALTHY',
    'RPM_INSTABILITY',
  ];
  private autoModeIndex = 0;

  // Physical continuous state
  private state = {
    throttle: 70.0, // %
    rpm: 2400.0,
    engine_temp: 82.0, // °C
    oil_pressure: 50.0, // PSI
    oil_temp: 80.0, // °C
    fuel_flow: 22.0, // L/h
    manifold_pressure: 25.0, // inHg
    vibration: 1.8, // mm/s
    battery_voltage: 28.1, // V
  };

  public setMode(mode: SimulationMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.faultStep = 0;
      // Do NOT snap values immediately! Allow smooth gradual physical transition
    }
  }

  public getMode(): SimulationMode {
    return this.mode;
  }

  public reset(): void {
    this.mode = 'HEALTHY';
    this.faultStep = 0;
    this.autoCycleTimer = 0;
    this.autoModeIndex = 0;
    this.state = {
      throttle: 70.0,
      rpm: 2400.0,
      engine_temp: 82.0,
      oil_pressure: 50.0,
      oil_temp: 80.0,
      fuel_flow: 22.0,
      manifold_pressure: 25.0,
      vibration: 1.8,
      battery_voltage: 28.1,
    };
  }

  public nextStep(dtSeconds = 1.0): RawTelemetryInput {
    let activeFault: FaultType = 'HEALTHY';

    if (this.mode === 'AUTO') {
      this.autoCycleTimer += dtSeconds;
      if (this.autoCycleTimer >= 30) {
        // Switch fault mode every 30 seconds in AUTO demo
        this.autoCycleTimer = 0;
        this.autoModeIndex = (this.autoModeIndex + 1) % this.autoModeSequence.length;
        this.faultStep = 0;
      }
      activeFault = this.autoModeSequence[this.autoModeIndex];
    } else {
      activeFault = this.mode;
    }

    this.faultStep += dtSeconds;

    // Continuous throttle control input with gentle cruise variance
    if (activeFault === 'HEALTHY') {
      const targetThrottle = 70.0 + Math.sin(Date.now() / 12000) * 2.2 + Math.sin(Date.now() / 25000) * 1.5;
      this.state.throttle += (targetThrottle - this.state.throttle) * 0.15 * dtSeconds;
      this.state.throttle = clamp(this.state.throttle, 66.0, 74.0);
    }

    switch (activeFault) {
      case 'OVERHEATING':
        this.injectOverheating(dtSeconds);
        break;
      case 'LOW_OIL_PRESSURE':
        this.injectLowOilPressure(dtSeconds);
        break;
      case 'HIGH_VIBRATION':
        this.injectHighVibration(dtSeconds);
        break;
      case 'RPM_INSTABILITY':
        this.injectRpmInstability(dtSeconds);
        break;
      case 'HEALTHY':
      default:
        this.recoverToHealthy(dtSeconds);
        break;
    }

    // Alternator output remains stable around 28V with small electrical flutter
    this.state.battery_voltage = clamp(
      this.state.battery_voltage + (28.05 - this.state.battery_voltage) * 0.2 * dtSeconds + gaussianNoise(0, 0.04),
      27.6,
      28.5
    );

    return {
      rpm: round(this.state.rpm, 1),
      engine_temperature: round(this.state.engine_temp, 2),
      oil_pressure: round(this.state.oil_pressure, 2),
      oil_temperature: round(this.state.oil_temp, 2),
      fuel_flow: round(this.state.fuel_flow, 2),
      manifold_pressure: round(this.state.manifold_pressure, 2),
      vibration: round(this.state.vibration, 2),
      battery_voltage: round(this.state.battery_voltage, 2),
      throttle_position: round(this.state.throttle, 1),
      fault: activeFault,
    };
  }

  /**
   * FAULT 1: Gradual Overheating
   * Cylinder Head Temperature steadily climbs from current value:
   * 82 -> 84 -> 87 -> 91 -> 96 -> 103°C+
   * Secondary effects: oil temp rises, oil pressure softens slightly
   */
  private injectOverheating(dt: number): void {
    // Thermal rise proportional to severity over time
    const thermalGrowthRate = Math.min(1.2, 0.4 + this.faultStep * 0.04) * dt;
    this.state.engine_temp = clamp(
      this.state.engine_temp + thermalGrowthRate + gaussianNoise(0, 0.08),
      70,
      126
    );

    // Oil temperature follows cylinder head temperature with thermal inertia
    const targetOilTemp = this.state.engine_temp - 3.5;
    this.state.oil_temp += (targetOilTemp - this.state.oil_temp) * 0.12 * dt;

    // Hot oil loses viscosity: oil pressure declines mildly
    if (this.state.oil_temp > 92) {
      this.state.oil_pressure = clamp(this.state.oil_pressure - 0.25 * dt, 30, 52);
    }

    // RPM and manifold pressure slightly increase with combustion heat
    const targetRpm = 2400 + (this.state.throttle - 70) * 12 + gaussianNoise(0, 8);
    this.state.rpm += (targetRpm - this.state.rpm) * 0.2 * dt;
    this.state.fuel_flow = clamp(22.0 + (this.state.rpm - 2400) * 0.01 + gaussianNoise(0, 0.08), 18, 28);
    this.state.manifold_pressure = clamp(25.0 + (this.state.throttle - 70) * 0.15 + gaussianNoise(0, 0.08), 22, 28);
    this.state.vibration = clamp(1.8 + (this.state.engine_temp > 102 ? 0.6 : 0) + gaussianNoise(0, 0.08), 1.2, 4.5);
  }

  /**
   * FAULT 2: Gradual Low Oil Pressure
   * Lubrication system pressure decay from current value:
   * 50 -> 47 -> 43 -> 39 -> 34 -> 28 -> 22 PSI
   * Secondary effects: bearing friction increases vibration & oil temp
   */
  private injectLowOilPressure(dt: number): void {
    // Gradual decay rate
    const decayRate = Math.min(1.5, 0.6 + this.faultStep * 0.05) * dt;
    this.state.oil_pressure = clamp(
      this.state.oil_pressure - decayRate + gaussianNoise(0, 0.12),
      12,
      55
    );

    // Friction penalty as oil pressure drops below critical lubrication threshold
    if (this.state.oil_pressure < 35) {
      const frictionDeficit = (35 - this.state.oil_pressure) * 0.12;
      this.state.vibration = clamp(1.8 + frictionDeficit + gaussianNoise(0, 0.15), 1.6, 6.8);
      this.state.oil_temp = clamp(this.state.oil_temp + 0.35 * dt, 75, 106);
    }

    const targetRpm = 2390 + (this.state.throttle - 70) * 10 + gaussianNoise(0, 10);
    this.state.rpm += (targetRpm - this.state.rpm) * 0.2 * dt;
    this.state.engine_temp = clamp(82.0 + (this.state.throttle - 70) * 0.15 + gaussianNoise(0, 0.12), 76, 92);
    this.state.fuel_flow = clamp(21.9 + gaussianNoise(0, 0.08), 18, 26);
    this.state.manifold_pressure = clamp(24.9 + gaussianNoise(0, 0.08), 22, 28);
  }

  /**
   * FAULT 3: High Vibration
   * Propeller imbalance / bearing wear harmonic:
   * Vibration increases gradually: 1.8 -> 2.3 -> 3.1 -> 4.2 -> 5.5 -> 7.0 mm/s
   */
  private injectHighVibration(dt: number): void {
    const targetVib = Math.min(7.6, 1.8 + this.faultStep * 0.28);
    this.state.vibration = clamp(
      this.state.vibration + (targetVib - this.state.vibration) * 0.35 * dt + gaussianNoise(0, 0.25),
      1.5,
      8.8
    );

    // Mechanical vibration introduces small flutter in RPM and sensors
    const flutter = gaussianNoise(0, 25);
    this.state.rpm = clamp(2400 + (this.state.throttle - 70) * 10 + flutter, 2280, 2520);
    this.state.engine_temp = clamp(82.5 + gaussianNoise(0, 0.15), 78, 88);
    this.state.oil_pressure = clamp(49.2 + gaussianNoise(0, 0.4), 43, 54);
    this.state.oil_temp = clamp(81.2 + gaussianNoise(0, 0.2), 77, 86);
    this.state.fuel_flow = clamp(22.1 + gaussianNoise(0, 0.12), 19, 26);
    this.state.manifold_pressure = clamp(25.1 + gaussianNoise(0, 0.1), 22, 28);
  }

  /**
   * FAULT 4: RPM Instability
   * Governor hunting and fuel surging:
   * Progressive oscillation: 2400 -> 2470 -> 2310 -> 2520 -> 2260 -> 2580 RPM
   */
  private injectRpmInstability(dt: number): void {
    // Amplitude increases over time from 100 to 360 RPM
    const waveAmp = Math.min(360, 100 + this.faultStep * 18);
    const oscillation = Math.sin(this.faultStep * 2.1) * waveAmp;
    const chaoticFlutter = gaussianNoise(0, 45);
    const targetRpm = 2400 + oscillation + chaoticFlutter;

    this.state.rpm = clamp(
      this.state.rpm + (targetRpm - this.state.rpm) * 0.45 * dt,
      1750,
      3050
    );

    // Coupled parameters: Manifold pressure and fuel flow fluctuate in sympathy
    const rpmDelta = this.state.rpm - 2400;
    const targetMap = 25.0 + rpmDelta * 0.007 + gaussianNoise(0, 0.18);
    this.state.manifold_pressure = clamp(
      this.state.manifold_pressure + (targetMap - this.state.manifold_pressure) * 0.35 * dt,
      18,
      31
    );

    const targetFuel = 22.0 + rpmDelta * 0.01 + gaussianNoise(0, 0.2);
    this.state.fuel_flow = clamp(
      this.state.fuel_flow + (targetFuel - this.state.fuel_flow) * 0.35 * dt,
      15,
      32
    );

    this.state.vibration = clamp(1.9 + Math.abs(rpmDelta) * 0.0018 + gaussianNoise(0, 0.15), 1.5, 4.2);
    this.state.oil_pressure = clamp(50.0 + rpmDelta * 0.004 + gaussianNoise(0, 0.3), 42, 57);
    this.state.engine_temp = clamp(83.0 + gaussianNoise(0, 0.2), 79, 89);
    this.state.oil_temp = clamp(81.0 + gaussianNoise(0, 0.15), 77, 86);
  }

  /**
   * Healthy Baseline Recovery:
   * Smoothly and gradually returns all engine parameters to nominal operating envelope.
   */
  /**
   * Healthy Baseline Recovery:
   * Smoothly and continuously breathes within nominal operating envelope.
   * Gives natural, visible needle movement and reading variance without exceeding safe limits.
   */
  private recoverToHealthy(dt: number): void {
    // 1. RPM wandering with propeller governor and combustion torque dynamics
    const targetRpm =
      2400.0 +
      Math.sin(this.faultStep * 0.35) * 65.0 +
      Math.cos(this.faultStep * 0.18) * 35.0 +
      (this.state.throttle - 70.0) * 12.0 +
      gaussianNoise(0, 18.0);
    this.state.rpm += (targetRpm - this.state.rpm) * 0.45 * dt;
    this.state.rpm = clamp(this.state.rpm, 2280, 2520);

    const rpmDeltaNorm = (this.state.rpm - 2400.0) / 200.0;

    // 2. Manifold Pressure responds with throttle and intake breathing
    const targetMap =
      25.0 +
      rpmDeltaNorm * 1.1 +
      Math.sin(this.faultStep * 0.28) * 0.8 +
      gaussianNoise(0, 0.22);
    this.state.manifold_pressure += (targetMap - this.state.manifold_pressure) * 0.4 * dt;
    this.state.manifold_pressure = clamp(this.state.manifold_pressure, 23.3, 26.7);

    // 3. Fuel flow responds to RPM and manifold pressure
    const targetFuelFlow =
      22.2 +
      rpmDeltaNorm * 1.4 +
      (this.state.manifold_pressure - 25.0) * 0.5 +
      Math.cos(this.faultStep * 0.3) * 0.6 +
      gaussianNoise(0, 0.25);
    this.state.fuel_flow += (targetFuelFlow - this.state.fuel_flow) * 0.4 * dt;
    this.state.fuel_flow = clamp(this.state.fuel_flow, 19.8, 24.6);

    // 4. Vibration RMS with natural mechanical harmonics
    const targetVibration =
      1.80 +
      Math.sin(this.faultStep * 0.48) * 0.22 +
      Math.cos(this.faultStep * 0.24) * 0.15 +
      gaussianNoise(0, 0.08);
    this.state.vibration += (targetVibration - this.state.vibration) * 0.48 * dt;
    this.state.vibration = clamp(this.state.vibration, 1.45, 2.18);

    // 5. Oil Pressure pulses with engine speed and pump cycles
    const targetOilPress =
      50.5 +
      rpmDeltaNorm * 1.8 +
      Math.cos(this.faultStep * 0.25) * 1.4 +
      gaussianNoise(0, 0.35);
    this.state.oil_pressure += (targetOilPress - this.state.oil_pressure) * 0.38 * dt;
    this.state.oil_pressure = clamp(this.state.oil_pressure, 47.4, 54.8);

    // 6. Cylinder Head Temp with thermal inertia and power correlation
    const targetCht =
      82.0 +
      rpmDeltaNorm * 1.6 +
      Math.sin(this.faultStep * 0.14) * 1.5 +
      gaussianNoise(0, 0.2);
    this.state.engine_temp += (targetCht - this.state.engine_temp) * 0.22 * dt;
    this.state.engine_temp = clamp(this.state.engine_temp, 78.8, 85.8);

    // 7. Oil temperature tracks cylinder temperature
    const targetOilTemp = 80.0 + (this.state.engine_temp - 82.0) * 0.45 + gaussianNoise(0, 0.15);
    this.state.oil_temp += (targetOilTemp - this.state.oil_temp) * 0.18 * dt;
    this.state.oil_temp = clamp(this.state.oil_temp, 77.0, 84.0);
  }

  /**
   * Corrective Pilot Action
   * Simulates pilot executing cockpit checklist: reduces throttle to cooling power,
   * enriches mixture, and transitions system safely to nominal HEALTHY parameters.
   */
  public applyPilotCorrection(): { action: string; result: string } {
    const previousMode = this.mode;
    this.mode = 'HEALTHY';
    this.faultStep = 0;
    this.state.throttle = 64.0;
    return {
      action: `Pilot checklist executed for ${previousMode}. Power adjusted to 64%, mixture enriched, cooling initiated.`,
      result: 'Closed-loop recovery initiated. Engine telemetry returning to nominal flight envelope.',
    };
  }
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
