import {
  Alert,
  ComponentHealth,
  DigitalTwinState,
  FaultType,
  HealthStatus,
  RiskLevel,
  SimulationMode,
  SimulationStatus,
  TelemetryRecord,
} from '../types';

type TelemetryListener = (data: {
  twinState: DigitalTwinState;
  history: TelemetryRecord[];
  alerts: Alert[];
  isConnected: boolean;
}) => void;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function gaussianNoise(mean = 0, stdev = 1): number {
  const u1 = Math.max(1e-6, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdev;
}

function round(n: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

const AUTO_SEQUENCE: FaultType[] = [
  'HEALTHY',
  'OVERHEATING',
  'HEALTHY',
  'LOW_OIL_PRESSURE',
  'HEALTHY',
  'HIGH_VIBRATION',
  'HEALTHY',
  'RPM_INSTABILITY',
];

class TelemetryService {
  private listeners: Set<TelemetryListener> = new Set();
  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private simTimer: NodeJS.Timeout | null = null;
  private lastServerMessageTime = 0;
  private isConnected = false;

  // Simulation physics state
  private mode: SimulationMode = 'HEALTHY';
  private status: SimulationStatus = 'RUNNING';
  private intervalMs = 800;
  private faultStep = 0;
  private autoCycleTimer = 0;
  private autoModeIndex = 0;
  private recordCounter = 1;

  private engineState = {
    throttle: 70.0,
    rpm: 2400.0,
    engine_temp: 82.0,
    oil_pressure: 50.0,
    oil_temp: 80.0,
    fuel_flow: 22.0,
    manifold_pressure: 25.0,
    vibration: 1.8,
    battery_voltage: 28.05,
  };

  private prevRecord: TelemetryRecord | null = null;
  private currentTwinState: DigitalTwinState;
  private history: TelemetryRecord[] = [];
  private alerts: Alert[] = [];

  constructor() {
    // Generate initial valid initial telemetry record
    const initialRec: TelemetryRecord = {
      id: this.recordCounter++,
      timestamp: new Date().toISOString(),
      rpm: 2400.0,
      engine_temperature: 82.0,
      oil_pressure: 50.0,
      oil_temperature: 80.0,
      fuel_flow: 22.0,
      manifold_pressure: 25.0,
      vibration: 1.8,
      battery_voltage: 28.05,
      throttle_position: 70.0,
      fault: 'HEALTHY',
      health_status: 'HEALTHY',
      temperature_rate: 0.0,
      oil_pressure_rate: 0.0,
      vibration_rate: 0.0,
      rpm_variation: 0.0,
      manifold_pressure_rate: 0.0,
      fuel_flow_rate: 0.0,
      anomaly_score: 0.03,
      prediction_confidence: 0.97,
    };

    this.prevRecord = initialRec;
    this.history = [initialRec];

    this.currentTwinState = {
      timestamp: initialRec.timestamp,
      current_telemetry: initialRec,
      engine_health: 'HEALTHY',
      health_score: 98,
      current_fault: 'HEALTHY',
      predicted_fault: 'HEALTHY',
      risk_level: 'NORMAL',
      prediction_confidence: 0.97,
      recent_trends: {
        temperature_trend: 'STABLE',
        oil_pressure_trend: 'STABLE',
        vibration_trend: 'NOMINAL',
        rpm_stability: 'STABLE',
      },
      component_status: {
        cylinder_head: { status: 'HEALTHY', index: 68, detail: '82.0°C (STABLE)' },
        lubrication_system: { status: 'HEALTHY', index: 83, detail: '50.0 PSI / 80.0°C' },
        crankshaft_bearings: { status: 'HEALTHY', index: 23, detail: '1.80 mm/s (NOMINAL)' },
        valvetrain_ignition: { status: 'HEALTHY', index: 86, detail: '2400 RPM (STABLE)' },
      },
      simulation_mode: 'HEALTHY',
      simulation_status: 'RUNNING',
      interval_ms: this.intervalMs,
    };

    this.initNetwork();
    this.startSimulationLoop();
  }

  // Subscribe to live telemetry state
  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    // Send immediate current state
    listener({
      twinState: this.currentTwinState,
      history: this.history,
      alerts: this.alerts,
      isConnected: this.isConnected,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): DigitalTwinState {
    return this.currentTwinState;
  }

  public getHistory(): TelemetryRecord[] {
    return this.history;
  }

  public getAlerts(): Alert[] {
    return this.alerts;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  private notify(): void {
    const data = {
      twinState: this.currentTwinState,
      history: this.history,
      alerts: this.alerts,
      isConnected: this.isConnected,
    };
    this.listeners.forEach((fn) => fn(data));
  }

  // -------------------------------------------------------------
  // Network: WebSocket + Fast Polling Fallback
  // -------------------------------------------------------------
  private initNetwork(): void {
    if (typeof window === 'undefined') return;

    // Fetch initial state from REST API
    this.fetchInitialRestData();

    // Connect WebSocket
    this.connectWebSocket();

    // Fallback polling: if WebSocket is disconnected or has not produced
    // updates in > 1800ms, pull from REST endpoint
    this.pollTimer = setInterval(() => {
      const now = Date.now();
      if (!this.isConnected || now - this.lastServerMessageTime > 1800) {
        this.pollServerState();
      }
    }, 750);
  }

  private async fetchInitialRestData(): Promise<void> {
    try {
      const [stateRes, historyRes, alertsRes] = await Promise.all([
        fetch('/api/digital-twin/state').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/telemetry/recent?limit=50').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/alerts/recent?limit=30').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (stateRes && stateRes.current_telemetry) {
        this.applyServerTwinState(stateRes);
      }
      if (historyRes && Array.isArray(historyRes) && historyRes.length > 0) {
        this.history = historyRes.slice().reverse();
        this.notify();
      }
      if (alertsRes && Array.isArray(alertsRes)) {
        this.alerts = alertsRes;
        this.notify();
      }
    } catch {
      // Offline fallback continues smoothly
    }
  }

  private connectWebSocket(): void {
    if (typeof window === 'undefined') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.isConnected = true;
        this.lastServerMessageTime = Date.now();
        this.notify();
      };

      ws.onmessage = (event) => {
        this.lastServerMessageTime = Date.now();
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'initial_state' || payload.type === 'init') {
            if (payload.digital_twin) this.applyServerTwinState(payload.digital_twin);
          } else if (payload.type === 'telemetry_update' || payload.type === 'telemetry') {
            if (payload.digital_twin) this.applyServerTwinState(payload.digital_twin);
            if (payload.alerts && Array.isArray(payload.alerts)) {
              this.handleIncomingAlerts(payload.alerts);
            }
          } else if (payload.type === 'alert' && payload.alert) {
            this.handleIncomingAlerts([payload.alert]);
          } else if (payload.type === 'status_update' && payload.digital_twin) {
            this.applyServerTwinState(payload.digital_twin);
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        this.notify();
        if (!this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            this.connectWebSocket();
          }, 2500);
        }
      };

      ws.onerror = () => {
        this.isConnected = false;
        this.notify();
      };
    } catch {
      this.isConnected = false;
      this.notify();
    }
  }

  private async pollServerState(): Promise<void> {
    try {
      const res = await fetch('/api/digital-twin/state');
      if (res.ok) {
        const data = await res.json();
        if (data && data.current_telemetry) {
          this.applyServerTwinState(data);
        }
      }
    } catch {
      // Ignore polling errors
    }
  }

  private applyServerTwinState(serverState: DigitalTwinState): void {
    const cur = serverState.current_telemetry;
    if (!cur) return;

    // Sync internal physical simulation state with server authoritative values
    this.engineState.throttle = cur.throttle_position;
    this.engineState.rpm = cur.rpm;
    this.engineState.engine_temp = cur.engine_temperature;
    this.engineState.oil_pressure = cur.oil_pressure;
    this.engineState.oil_temp = cur.oil_temperature;
    this.engineState.fuel_flow = cur.fuel_flow;
    this.engineState.manifold_pressure = cur.manifold_pressure;
    this.engineState.vibration = cur.vibration;
    this.engineState.battery_voltage = cur.battery_voltage;

    this.mode = serverState.simulation_mode || this.mode;
    this.status = serverState.simulation_status || this.status;
    this.intervalMs = serverState.interval_ms || this.intervalMs;

    this.currentTwinState = serverState;

    // Append to history without duplicate IDs
    const last = this.history[this.history.length - 1];
    if (!last || last.id !== cur.id) {
      this.history = [...this.history, cur].slice(-150);
    }
    this.prevRecord = cur;
    this.notify();
  }

  private handleIncomingAlerts(newAlerts: Alert[]): void {
    if (!newAlerts.length) return;
    const existingIds = new Set(this.alerts.map((a) => a.id));
    const toAdd = newAlerts.filter((a) => !existingIds.has(a.id));
    if (toAdd.length > 0) {
      this.alerts = [...toAdd, ...this.alerts].slice(0, 100);
      this.notify();
    }
  }

  // -------------------------------------------------------------
  // Simulation Loop: Continuous Stateful Interpolation / Local Step
  // Ensures the engine is ALWAYS alive and moving smoothly even if network lags
  // -------------------------------------------------------------
  private startSimulationLoop(): void {
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      this.tick();
    }, this.intervalMs);
  }

  private tick(): void {
    if (this.status !== 'RUNNING') return;

    // If server has sent a fresh update within the last 1200ms, let server lead
    const now = Date.now();
    if (now - this.lastServerMessageTime < 1200) {
      return;
    }

    // Otherwise, step the physics model locally so values NEVER freeze!
    const dt = this.intervalMs / 1000.0;
    this.stepPhysics(dt);
  }

  private stepPhysics(dt: number): void {
    let activeFault: FaultType = 'HEALTHY';

    if (this.mode === 'AUTO') {
      this.autoCycleTimer += dt;
      if (this.autoCycleTimer >= 28) {
        this.autoCycleTimer = 0;
        this.autoModeIndex = (this.autoModeIndex + 1) % AUTO_SEQUENCE.length;
        this.faultStep = 0;
      }
      activeFault = AUTO_SEQUENCE[this.autoModeIndex];
    } else {
      activeFault = this.mode;
    }

    this.faultStep += dt;

    // Continuous throttle control input with gentle cruise variance
    if (activeFault === 'HEALTHY') {
      const targetThrottle = 70.0 + Math.sin(Date.now() / 12000) * 2.2 + Math.sin(Date.now() / 25000) * 1.5;
      this.engineState.throttle += (targetThrottle - this.engineState.throttle) * 0.15 * dt;
      this.engineState.throttle = clamp(this.engineState.throttle, 66.0, 74.0);
    }

    // Execute stateful parameter updates based on mode
    switch (activeFault) {
      case 'OVERHEATING': {
        const thermalGrowthRate = Math.min(1.2, 0.4 + this.faultStep * 0.04) * dt;
        this.engineState.engine_temp = clamp(
          this.engineState.engine_temp + thermalGrowthRate + gaussianNoise(0, 0.08),
          70,
          126
        );
        const targetOilTemp = this.engineState.engine_temp - 3.5;
        this.engineState.oil_temp += (targetOilTemp - this.engineState.oil_temp) * 0.12 * dt;
        if (this.engineState.oil_temp > 92) {
          this.engineState.oil_pressure = clamp(this.engineState.oil_pressure - 0.25 * dt, 30, 52);
        }
        const targetRpm = 2400 + (this.engineState.throttle - 70) * 12 + gaussianNoise(0, 8);
        this.engineState.rpm += (targetRpm - this.engineState.rpm) * 0.2 * dt;
        this.engineState.fuel_flow = clamp(22.0 + (this.engineState.rpm - 2400) * 0.01 + gaussianNoise(0, 0.08), 18, 28);
        this.engineState.manifold_pressure = clamp(25.0 + (this.engineState.throttle - 70) * 0.15 + gaussianNoise(0, 0.08), 22, 28);
        this.engineState.vibration = clamp(1.8 + (this.engineState.engine_temp > 102 ? 0.6 : 0) + gaussianNoise(0, 0.08), 1.2, 4.5);
        break;
      }

      case 'LOW_OIL_PRESSURE': {
        const decayRate = Math.min(1.5, 0.6 + this.faultStep * 0.05) * dt;
        this.engineState.oil_pressure = clamp(
          this.engineState.oil_pressure - decayRate + gaussianNoise(0, 0.12),
          12,
          55
        );
        if (this.engineState.oil_pressure < 35) {
          const frictionDeficit = (35 - this.engineState.oil_pressure) * 0.12;
          this.engineState.vibration = clamp(1.8 + frictionDeficit + gaussianNoise(0, 0.15), 1.6, 6.8);
          this.engineState.oil_temp = clamp(this.engineState.oil_temp + 0.35 * dt, 75, 106);
        }
        const targetRpm = 2390 + (this.engineState.throttle - 70) * 10 + gaussianNoise(0, 10);
        this.engineState.rpm += (targetRpm - this.engineState.rpm) * 0.2 * dt;
        this.engineState.engine_temp = clamp(82.0 + (this.engineState.throttle - 70) * 0.15 + gaussianNoise(0, 0.12), 76, 92);
        this.engineState.fuel_flow = clamp(21.9 + gaussianNoise(0, 0.08), 18, 26);
        this.engineState.manifold_pressure = clamp(24.9 + gaussianNoise(0, 0.08), 22, 28);
        break;
      }

      case 'HIGH_VIBRATION': {
        const targetVib = Math.min(7.6, 1.8 + this.faultStep * 0.28);
        this.engineState.vibration = clamp(
          this.engineState.vibration + (targetVib - this.engineState.vibration) * 0.35 * dt + gaussianNoise(0, 0.25),
          1.5,
          8.8
        );
        const flutter = gaussianNoise(0, 25);
        this.engineState.rpm = clamp(2400 + (this.engineState.throttle - 70) * 10 + flutter, 2280, 2520);
        this.engineState.engine_temp = clamp(82.5 + gaussianNoise(0, 0.15), 78, 88);
        this.engineState.oil_pressure = clamp(49.2 + gaussianNoise(0, 0.4), 43, 54);
        this.engineState.oil_temp = clamp(81.2 + gaussianNoise(0, 0.2), 77, 86);
        this.engineState.fuel_flow = clamp(22.1 + gaussianNoise(0, 0.12), 19, 26);
        this.engineState.manifold_pressure = clamp(25.1 + gaussianNoise(0, 0.1), 22, 28);
        break;
      }

      case 'RPM_INSTABILITY': {
        const waveAmp = Math.min(360, 100 + this.faultStep * 18);
        const oscillation = Math.sin(this.faultStep * 2.1) * waveAmp;
        const targetRpm = 2400 + oscillation + gaussianNoise(0, 45);
        this.engineState.rpm = clamp(
          this.engineState.rpm + (targetRpm - this.engineState.rpm) * 0.45 * dt,
          1750,
          3050
        );
        const rpmDelta = this.engineState.rpm - 2400;
        this.engineState.manifold_pressure = clamp(25.0 + rpmDelta * 0.007 + gaussianNoise(0, 0.18), 18, 31);
        this.engineState.fuel_flow = clamp(22.0 + rpmDelta * 0.01 + gaussianNoise(0, 0.2), 15, 32);
        this.engineState.vibration = clamp(1.9 + Math.abs(rpmDelta) * 0.0018 + gaussianNoise(0, 0.15), 1.5, 4.2);
        this.engineState.oil_pressure = clamp(50.0 + rpmDelta * 0.004 + gaussianNoise(0, 0.3), 42, 57);
        this.engineState.engine_temp = clamp(83.0 + gaussianNoise(0, 0.2), 79, 89);
        this.engineState.oil_temp = clamp(81.0 + gaussianNoise(0, 0.15), 77, 86);
        break;
      }

      case 'HEALTHY':
      default: {
        const throttleDelta = this.engineState.throttle - 70.0;
        const targetRpm = 2400.0 + throttleDelta * 14.0 + gaussianNoise(0, 8.0);
        const targetCht = 82.0 + throttleDelta * 0.18 + (this.engineState.rpm - 2400) * 0.004 + gaussianNoise(0, 0.1);
        const targetOilPress = 50.0 + (this.engineState.rpm - 2400) * 0.003 - (this.engineState.oil_temp - 80) * 0.08 + gaussianNoise(0, 0.2);
        const targetOilTemp = 80.0 + (this.engineState.engine_temp - 82) * 0.4 + gaussianNoise(0, 0.12);
        const targetFuelFlow = 22.0 + throttleDelta * 0.28 + (this.engineState.rpm - 2400) * 0.004 + gaussianNoise(0, 0.12);
        const targetMap = 25.0 + throttleDelta * 0.16 + gaussianNoise(0, 0.08);
        const targetVibration = 1.80 + (this.engineState.rpm - 2400) * 0.0006 + gaussianNoise(0, 0.035);

        this.engineState.rpm += (targetRpm - this.engineState.rpm) * 0.32 * dt;
        this.engineState.engine_temp += (targetCht - this.engineState.engine_temp) * 0.12 * dt;
        this.engineState.oil_pressure += (targetOilPress - this.engineState.oil_pressure) * 0.25 * dt;
        this.engineState.oil_temp += (targetOilTemp - this.engineState.oil_temp) * 0.15 * dt;
        this.engineState.fuel_flow += (targetFuelFlow - this.engineState.fuel_flow) * 0.3 * dt;
        this.engineState.manifold_pressure += (targetMap - this.engineState.manifold_pressure) * 0.3 * dt;
        this.engineState.vibration += (targetVibration - this.engineState.vibration) * 0.28 * dt;

        this.engineState.rpm = clamp(this.engineState.rpm, 2360, 2460);
        this.engineState.engine_temp = clamp(this.engineState.engine_temp, 80.5, 84.5);
        this.engineState.oil_pressure = clamp(this.engineState.oil_pressure, 48.0, 52.0);
        this.engineState.oil_temp = clamp(this.engineState.oil_temp, 78.5, 82.0);
        this.engineState.fuel_flow = clamp(this.engineState.fuel_flow, 21.0, 23.5);
        this.engineState.manifold_pressure = clamp(this.engineState.manifold_pressure, 24.2, 25.8);
        this.engineState.vibration = clamp(this.engineState.vibration, 1.70, 1.95);
        break;
      }
    }

    this.engineState.battery_voltage = clamp(
      this.engineState.battery_voltage + (28.05 - this.engineState.battery_voltage) * 0.2 * dt + gaussianNoise(0, 0.04),
      27.6,
      28.5
    );

    // Calculate rates from previous step
    const prev = this.prevRecord || this.currentTwinState.current_telemetry;
    const effectiveDt = Math.max(0.1, dt);
    const rpmRate = (this.engineState.rpm - prev.rpm) / effectiveDt;
    const tempRate = (this.engineState.engine_temp - prev.engine_temperature) / effectiveDt;
    const oilPressRate = (this.engineState.oil_pressure - prev.oil_pressure) / effectiveDt;
    const vibRate = (this.engineState.vibration - prev.vibration) / effectiveDt;
    const mapRate = (this.engineState.manifold_pressure - prev.manifold_pressure) / effectiveDt;
    const fuelRate = (this.engineState.fuel_flow - prev.fuel_flow) / effectiveDt;

    // Assess health status
    let healthStatus: HealthStatus = 'HEALTHY';
    if (
      this.engineState.engine_temp > 105 ||
      this.engineState.oil_pressure < 25 ||
      this.engineState.vibration > 6.0 ||
      this.engineState.rpm > 2950 ||
      this.engineState.rpm < 1800
    ) {
      healthStatus = 'CRITICAL';
    } else if (
      this.engineState.engine_temp > 94 ||
      this.engineState.oil_pressure < 38 ||
      this.engineState.vibration > 3.5 ||
      tempRate > 0.5 ||
      oilPressRate < -0.6 ||
      Math.abs(rpmRate) > 150
    ) {
      healthStatus = 'WARNING';
    }

    // Health Score calculation (0 - 100)
    let healthScore = 98;
    if (healthStatus === 'CRITICAL') {
      healthScore = Math.max(15, Math.round(55 - this.faultStep * 2));
    } else if (healthStatus === 'WARNING') {
      healthScore = Math.max(50, Math.round(82 - this.faultStep * 1.5));
    }

    const rec: TelemetryRecord = {
      id: this.recordCounter++,
      timestamp: new Date().toISOString(),
      rpm: round(this.engineState.rpm, 1),
      engine_temperature: round(this.engineState.engine_temp, 2),
      oil_pressure: round(this.engineState.oil_pressure, 2),
      oil_temperature: round(this.engineState.oil_temp, 2),
      fuel_flow: round(this.engineState.fuel_flow, 2),
      manifold_pressure: round(this.engineState.manifold_pressure, 2),
      vibration: round(this.engineState.vibration, 2),
      battery_voltage: round(this.engineState.battery_voltage, 2),
      throttle_position: round(this.engineState.throttle, 1),
      fault: activeFault,
      health_status: healthStatus,
      temperature_rate: round(tempRate, 2),
      oil_pressure_rate: round(oilPressRate, 2),
      vibration_rate: round(vibRate, 2),
      rpm_variation: round(rpmRate, 1),
      manifold_pressure_rate: round(mapRate, 2),
      fuel_flow_rate: round(fuelRate, 2),
      anomaly_score: activeFault === 'HEALTHY' ? 0.03 : Math.min(0.95, 0.4 + this.faultStep * 0.04),
      prediction_confidence: 0.96,
    };

    this.prevRecord = rec;
    this.history = [...this.history, rec].slice(-150);

    const riskLevel: RiskLevel =
      healthStatus === 'CRITICAL' ? 'CRITICAL' : healthStatus === 'WARNING' ? 'ELEVATED' : 'NORMAL';

    this.currentTwinState = {
      timestamp: rec.timestamp,
      current_telemetry: rec,
      engine_health: healthStatus,
      health_score: healthScore,
      current_fault: activeFault,
      predicted_fault: activeFault,
      risk_level: riskLevel,
      prediction_confidence: 0.96,
      recent_trends: {
        temperature_trend: tempRate > 0.4 ? 'RAPID_CLIMB' : tempRate > 0.1 ? 'RISING' : 'STABLE',
        oil_pressure_trend: oilPressRate < -0.4 ? 'RAPID_DECAY' : oilPressRate < -0.1 ? 'FALLING' : 'STABLE',
        vibration_trend: vibRate > 0.3 ? 'CRITICAL_SPIKE' : vibRate > 0.1 ? 'ELEVATED' : 'NOMINAL',
        rpm_stability: Math.abs(rpmRate) > 100 ? 'HUNTING' : 'STABLE',
      },
      component_status: {
        cylinder_head: {
          status: rec.engine_temperature > 105 ? 'CRITICAL' : rec.engine_temperature > 94 ? 'WARNING' : 'HEALTHY',
          index: Math.round(clamp(rec.engine_temperature, 40, 130)),
          detail: `${rec.engine_temperature.toFixed(1)}°C (${tempRate > 0.1 ? 'RISING' : 'STABLE'})`,
        },
        lubrication_system: {
          status: rec.oil_pressure < 25 ? 'CRITICAL' : rec.oil_pressure < 38 ? 'WARNING' : 'HEALTHY',
          index: Math.round(clamp(rec.oil_pressure, 10, 80)),
          detail: `${rec.oil_pressure.toFixed(1)} PSI / ${rec.oil_temperature.toFixed(1)}°C`,
        },
        crankshaft_bearings: {
          status: rec.vibration > 5.5 ? 'CRITICAL' : rec.vibration > 3.0 ? 'WARNING' : 'HEALTHY',
          index: Math.round(clamp(rec.vibration * 12, 0, 100)),
          detail: `${rec.vibration.toFixed(2)} mm/s (${vibRate > 0.1 ? 'ELEVATED' : 'NOMINAL'})`,
        },
        valvetrain_ignition: {
          status: Math.abs(rpmRate) > 150 ? 'WARNING' : 'HEALTHY',
          index: Math.round(clamp(rec.rpm / 32, 0, 100)),
          detail: `${Math.round(rec.rpm)} RPM (${Math.abs(rpmRate) > 30 ? `Δ ${rpmRate.toFixed(0)}/s` : 'STABLE'})`,
        },
      },
      simulation_mode: this.mode,
      simulation_status: this.status,
      interval_ms: this.intervalMs,
    };

    // If critical condition develops locally, generate alert
    if (healthStatus === 'CRITICAL' || healthStatus === 'WARNING') {
      const alertType =
        rec.engine_temperature > 94
          ? 'CHT_OVERHEAT'
          : rec.oil_pressure < 38
          ? 'LOW_OIL_PRESSURE'
          : rec.vibration > 3.5
          ? 'HIGH_VIBRATION'
          : 'RPM_HUNTING';

      const existingRecent = this.alerts.slice(0, 5).find((a) => a.type === alertType);
      if (!existingRecent) {
        const newAlert: Alert = {
          id: Date.now(),
          timestamp: rec.timestamp,
          telemetry_id: rec.id,
          type: alertType,
          severity: healthStatus,
          message: `${alertType.replace('_', ' ')} detected: ${
            alertType === 'CHT_OVERHEAT'
              ? `${rec.engine_temperature.toFixed(1)}°C exceeds limit`
              : alertType === 'LOW_OIL_PRESSURE'
              ? `${rec.oil_pressure.toFixed(1)} PSI below normal range`
              : alertType === 'HIGH_VIBRATION'
              ? `${rec.vibration.toFixed(2)} mm/s RMS vibration threshold exceeded`
              : `RPM variation ±${Math.abs(rpmRate).toFixed(0)} RPM/s`
          }`,
          parameter:
            alertType === 'CHT_OVERHEAT'
              ? 'engine_temperature'
              : alertType === 'LOW_OIL_PRESSURE'
              ? 'oil_pressure'
              : alertType === 'HIGH_VIBRATION'
              ? 'vibration'
              : 'rpm',
          value:
            alertType === 'CHT_OVERHEAT'
              ? rec.engine_temperature
              : alertType === 'LOW_OIL_PRESSURE'
              ? rec.oil_pressure
              : alertType === 'HIGH_VIBRATION'
              ? rec.vibration
              : rec.rpm,
          threshold:
            alertType === 'CHT_OVERHEAT'
              ? 94
              : alertType === 'LOW_OIL_PRESSURE'
              ? 38
              : alertType === 'HIGH_VIBRATION'
              ? 3.5
              : 150,
          acknowledged: false,
        };
        this.alerts = [newAlert, ...this.alerts].slice(0, 100);
      }
    }

    this.notify();
  }

  // -------------------------------------------------------------
  // User Actions (Synchronized with Backend & Local State)
  // -------------------------------------------------------------
  public async setMode(mode: SimulationMode): Promise<void> {
    this.mode = mode;
    this.faultStep = 0;
    this.currentTwinState.simulation_mode = mode;
    this.notify();

    try {
      await fetch('/api/simulation/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch {
      // Backend request failed, local state continues
    }
  }

  public async togglePlayPause(): Promise<void> {
    const nextStatus: SimulationStatus = this.status === 'RUNNING' ? 'STOPPED' : 'RUNNING';
    this.status = nextStatus;
    this.currentTwinState.simulation_status = nextStatus;
    this.notify();

    const endpoint = nextStatus === 'STOPPED' ? '/api/simulation/pause' : '/api/simulation/resume';
    try {
      await fetch(endpoint, { method: 'POST' });
    } catch {
      // Offline fallback
    }
  }

  public async reset(): Promise<void> {
    this.mode = 'HEALTHY';
    this.status = 'RUNNING';
    this.faultStep = 0;
    this.autoCycleTimer = 0;
    this.autoModeIndex = 0;
    this.engineState = {
      throttle: 70.0,
      rpm: 2400.0,
      engine_temp: 82.0,
      oil_pressure: 50.0,
      oil_temp: 80.0,
      fuel_flow: 22.0,
      manifold_pressure: 25.0,
      vibration: 1.8,
      battery_voltage: 28.05,
    };
    this.currentTwinState.simulation_mode = 'HEALTHY';
    this.currentTwinState.simulation_status = 'RUNNING';
    this.notify();

    try {
      await fetch('/api/simulation/reset', { method: 'POST' });
    } catch {
      // Offline fallback
    }
  }

  public async setInterval(ms: number): Promise<void> {
    const valid = clamp(ms, 200, 5000);
    this.intervalMs = valid;
    this.currentTwinState.interval_ms = valid;
    this.startSimulationLoop();
    this.notify();

    try {
      await fetch('/api/simulation/interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_ms: valid }),
      });
    } catch {
      // Offline fallback
    }
  }

  public async acknowledgeAlert(id: number): Promise<void> {
    this.alerts = this.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a));
    this.notify();

    try {
      await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // Offline fallback
    }
  }

  public async clearAlerts(): Promise<void> {
    this.alerts = [];
    this.notify();

    try {
      await fetch('/api/alerts/clear', { method: 'POST' });
    } catch {
      // Offline fallback
    }
  }
}

export const telemetryService = new TelemetryService();
