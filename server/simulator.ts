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
      if (mode === 'OVERHEATING' && this.state.engine_temp < 92) {
        this.state.engine_temp = 92.0;
      } else if (mode === 'LOW_OIL_PRESSURE' && this.state.oil_pressure > 38) {
        this.state.oil_pressure = 37.0;
      } else if (mode === 'HIGH_VIBRATION' && this.state.vibration < 3.2) {
        this.state.vibration = 3.5;
      } else if (mode === 'HEALTHY') {
        this.state.engine_temp = 82.0;
        this.state.oil_pressure = 50.0;
        this.state.oil_temp = 80.0;
        this.state.vibration = 1.8;
        this.state.rpm = 2400.0;
      }
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

    // Gradual throttle cruise variation in healthy state
    if (activeFault === 'HEALTHY') {
      const targetThrottle = 68.0 + Math.sin(Date.now() / 15000) * 5.0;
      this.state.throttle += (targetThrottle - this.state.throttle) * 0.05 * dtSeconds;
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

    // Battery voltage remains standard alternator 28V with small noise
    this.state.battery_voltage = clamp(28.0 + gaussianNoise(0, 0.08), 26.5, 29.5);

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
   * Gradual rise in cylinder head and coolant temperature:
   * 82 -> 85 -> 89 -> 94 -> 101 -> 112°C+
   * Secondary effects: oil temp rises, oil pressure thins.
   */
  private injectOverheating(dt: number): void {
    const rampRate = 0.8 * dt; // ~0.8°C per second rise
    this.state.engine_temp = clamp(this.state.engine_temp + rampRate + gaussianNoise(0, 0.1), 80, 125);

    // Oil temperature follows cylinder temperature with lag
    const targetOilTemp = this.state.engine_temp - 4.0;
    this.state.oil_temp += (targetOilTemp - this.state.oil_temp) * 0.15 * dt;

    // High oil temp causes viscosity loss, lowering pressure slightly
    if (this.state.oil_temp > 95) {
      this.state.oil_pressure = clamp(this.state.oil_pressure - 0.2 * dt, 32, 55);
    }

    // Normal RPM and manifold pressure maintained
    const targetRpm = 2400 + gaussianNoise(0, 15);
    this.state.rpm += (targetRpm - this.state.rpm) * 0.2 * dt;
    this.state.fuel_flow = 22.0 + (this.state.rpm - 2400) * 0.01 + gaussianNoise(0, 0.1);
    this.state.manifold_pressure = 25.0 + gaussianNoise(0, 0.1);
    this.state.vibration = clamp(1.8 + (this.state.engine_temp > 105 ? 0.8 : 0) + gaussianNoise(0, 0.1), 1.0, 5.0);
  }

  /**
   * FAULT 2: Low Oil Pressure
   * Sustained or gradual decay in lubrication pressure:
   * 48 -> 43 -> 37 -> 30 -> 24 -> 16 PSI.
   * Secondary effects: bearing friction causes vibration and oil temp rise.
   */
  private injectLowOilPressure(dt: number): void {
    const decayRate = 1.0 * dt; // ~1 PSI/s drop
    this.state.oil_pressure = clamp(this.state.oil_pressure - decayRate + gaussianNoise(0, 0.15), 12, 55);

    // Loss of lubrication increases friction: vibration and oil temp rise
    if (this.state.oil_pressure < 32) {
      const frictionPenalty = (32 - this.state.oil_pressure) * 0.1;
      this.state.vibration = clamp(1.8 + frictionPenalty + gaussianNoise(0, 0.2), 1.5, 6.5);
      this.state.oil_temp = clamp(this.state.oil_temp + 0.3 * dt, 75, 108);
    }

    this.state.engine_temp = clamp(82.0 + gaussianNoise(0, 0.2), 78, 92);
    const targetRpm = 2380 + gaussianNoise(0, 15);
    this.state.rpm += (targetRpm - this.state.rpm) * 0.2 * dt;
    this.state.fuel_flow = 21.8 + gaussianNoise(0, 0.1);
    this.state.manifold_pressure = 24.8 + gaussianNoise(0, 0.1);
  }

  /**
   * FAULT 3: High Vibration
   * Propeller unbalance / dynamic structural harmonic:
   * Vibration increases from 1.8 -> 3.2 -> 4.5 -> 6.2 -> 7.8 mm/s with erratic bursts.
   */
  private injectHighVibration(dt: number): void {
    const targetVib = Math.min(2.0 + this.faultStep * 0.35, 7.5);
    this.state.vibration = clamp(targetVib + gaussianNoise(0, 0.4), 1.5, 9.0);

    // Small engine temperature and RPM flutter from severe oscillation
    this.state.engine_temp = clamp(83.0 + gaussianNoise(0, 0.2), 80, 88);
    this.state.oil_pressure = clamp(49.0 + gaussianNoise(0, 0.5), 44, 54);
    this.state.oil_temp = clamp(81.0 + gaussianNoise(0, 0.2), 78, 86);
    this.state.rpm = clamp(2400 + gaussianNoise(0, 35), 2250, 2550);
    this.state.fuel_flow = 22.1 + gaussianNoise(0, 0.2);
    this.state.manifold_pressure = 25.1 + gaussianNoise(0, 0.2);
  }

  /**
   * FAULT 4: RPM Instability
   * Governor hunt / fuel metering surge:
   * Severe oscillations (2450 -> 2720 -> 2190 -> 2850 -> 2100 RPM).
   * Manifold pressure and fuel flow fluctuate in sympathy.
   */
  private injectRpmInstability(dt: number): void {
    // Oscillate with frequency and chaotic perturbation
    const wave = Math.sin(this.faultStep * 2.2) * 350;
    const chaoticBurst = gaussianNoise(0, 120);
    this.state.rpm = clamp(2400 + wave + chaoticBurst, 1700, 3100);

    // Correlated manifold pressure and fuel flow
    this.state.manifold_pressure = clamp(25.0 + (this.state.rpm - 2400) * 0.008 + gaussianNoise(0, 0.3), 18, 30);
    this.state.fuel_flow = clamp(22.0 + (this.state.rpm - 2400) * 0.012 + gaussianNoise(0, 0.3), 15, 32);

    // Secondary slight vibration increase due to speed changes
    this.state.vibration = clamp(2.2 + Math.abs(wave) * 0.003 + gaussianNoise(0, 0.2), 1.6, 4.5);
    this.state.engine_temp = clamp(84.0 + gaussianNoise(0, 0.3), 80, 90);
    this.state.oil_pressure = clamp(50.0 + (this.state.rpm - 2400) * 0.005 + gaussianNoise(0, 0.4), 40, 58);
    this.state.oil_temp = clamp(81.5 + gaussianNoise(0, 0.2), 78, 86);
  }

  /**
   * Healthy Baseline Recovery:
   * Smoothly returns all engine parameters to nominal operating envelope.
   */
  private recoverToHealthy(dt: number): void {
    const target = {
      rpm: 2400 + (this.state.throttle - 70) * 15 + gaussianNoise(0, 12),
      engine_temp: 82.0 + (this.state.throttle - 70) * 0.15 + gaussianNoise(0, 0.15),
      oil_pressure: 50.0 + gaussianNoise(0, 0.3),
      oil_temp: 80.0 + gaussianNoise(0, 0.2),
      fuel_flow: 22.0 + (this.state.throttle - 70) * 0.25 + gaussianNoise(0, 0.15),
      manifold_pressure: 25.0 + (this.state.throttle - 70) * 0.12 + gaussianNoise(0, 0.1),
      vibration: 1.8 + gaussianNoise(0, 0.1),
    };

    // Smooth relaxation towards nominal
    this.state.rpm += (target.rpm - this.state.rpm) * 0.3 * dt;
    this.state.engine_temp += (target.engine_temp - this.state.engine_temp) * 0.2 * dt;
    this.state.oil_pressure += (target.oil_pressure - this.state.oil_pressure) * 0.3 * dt;
    this.state.oil_temp += (target.oil_temp - this.state.oil_temp) * 0.2 * dt;
    this.state.fuel_flow += (target.fuel_flow - this.state.fuel_flow) * 0.3 * dt;
    this.state.manifold_pressure += (target.manifold_pressure - this.state.manifold_pressure) * 0.3 * dt;
    this.state.vibration += (target.vibration - this.state.vibration) * 0.3 * dt;

    // Keep clamped
    this.state.rpm = clamp(this.state.rpm, 1800, 2900);
    this.state.engine_temp = clamp(this.state.engine_temp, 70, 95);
    this.state.oil_pressure = clamp(this.state.oil_pressure, 42, 58);
    this.state.oil_temp = clamp(this.state.oil_temp, 72, 88);
    this.state.fuel_flow = clamp(this.state.fuel_flow, 18, 28);
    this.state.manifold_pressure = clamp(this.state.manifold_pressure, 22, 28);
    this.state.vibration = clamp(this.state.vibration, 1.4, 2.4);
  }
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
