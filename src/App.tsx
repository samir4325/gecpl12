import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  DigitalTwinState,
  FaultType,
  FirebaseSyncStatus,
  ModelMetrics,
  SimulationStatus,
  TelemetryRecord,
} from './types';
import { Header } from './components/Header';
import { DigitalTwinEngineView } from './components/DigitalTwinEngineView';
import { GaugeCluster } from './components/GaugeCluster';
import { TelemetryCharts } from './components/TelemetryCharts';
import { AIDiagnosticsPanel } from './components/AIDiagnosticsPanel';
import { AlertFeed } from './components/AlertFeed';
import { SimulationControls } from './components/SimulationControls';
import { ModelEvaluationModal } from './components/ModelEvaluationModal';
import { FirebaseModal } from './components/FirebaseModal';
import { audioNotifier } from './utils/audio';

export default function App() {
  const [twinState, setTwinState] = useState<DigitalTwinState | null>(null);
  const [history, setHistory] = useState<TelemetryRecord[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(audioNotifier.getIsMuted());
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseSyncStatus | null>(null);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAlertIdRef = useRef<number>(0);

  // Play audio alarm on new alert
  const handleIncomingAlert = useCallback((alert: Alert) => {
    if (alert.id > lastAlertIdRef.current) {
      lastAlertIdRef.current = alert.id;
      if (alert.severity === 'CRITICAL') {
        audioNotifier.playCritical();
      } else {
        audioNotifier.playWarning();
      }
    }
  }, []);

  // Fetch initial state & ML metrics
  const fetchFirebaseStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/firebase/status');
      if (res.ok) {
        const data = await res.json();
        setFirebaseStatus(data);
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    try {
      const [stateRes, historyRes, alertsRes, mlRes] = await Promise.all([
        fetch('/api/digital-twin/state').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/telemetry/recent?limit=50').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/alerts/recent?limit=30').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/ml/status').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (stateRes) setTwinState(stateRes);
      if (historyRes && Array.isArray(historyRes)) {
        // Reverse so chronological order (oldest to newest)
        setHistory(historyRes.slice().reverse());
      }
      if (alertsRes && Array.isArray(alertsRes)) {
        setAlerts(alertsRes);
        if (alertsRes.length > 0) {
          lastAlertIdRef.current = Math.max(...alertsRes.map((a: Alert) => a.id));
        }
      }
      if (mlRes) setModelMetrics(mlRes);
    } catch {
      // Ignore network errors during initial load
    }
    fetchFirebaseStatus();
  }, [fetchFirebaseStatus]);

  // Establish WebSocket connection with auto-reconnect
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/telemetry`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'init' || payload.type === 'initial_state') {
            if (payload.digital_twin) setTwinState(payload.digital_twin);
            if (payload.recent_telemetry && Array.isArray(payload.recent_telemetry)) {
              setHistory(payload.recent_telemetry.slice().reverse());
            }
            if (payload.recent_alerts && Array.isArray(payload.recent_alerts)) {
              setAlerts(payload.recent_alerts);
            }
          } else if (payload.type === 'telemetry' || payload.type === 'telemetry_update') {
            if (payload.digital_twin) {
              setTwinState(payload.digital_twin);
              const rec = payload.digital_twin.current_telemetry;
              if (rec) {
                setHistory((prev) => {
                  const updated = [...prev, rec];
                  return updated.length > 150 ? updated.slice(-150) : updated;
                });
              }
            }
            if (payload.telemetry) {
              const rec: TelemetryRecord = payload.telemetry;
              setHistory((prev) => {
                const updated = [...prev, rec];
                return updated.length > 150 ? updated.slice(-150) : updated;
              });
            }
            if (payload.alerts && Array.isArray(payload.alerts) && payload.alerts.length > 0) {
              payload.alerts.forEach((alt: Alert) => handleIncomingAlert(alt));
              setAlerts((prev) => [...payload.alerts, ...prev].slice(0, 100));
            }
          } else if (payload.type === 'alert') {
            handleIncomingAlert(payload.alert);
            setAlerts((prev) => [payload.alert, ...prev].slice(0, 100));
          }
        } catch {
          // Ignore invalid JSON payload
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Schedule reconnect in 2 seconds
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, 2000);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    } catch {
      setIsConnected(false);
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      }
    }
  }, [handleIncomingAlert]);

  useEffect(() => {
    fetchInitialData();
    connectWebSocket();

    // Fallback polling every 2 seconds if WebSocket is disconnected
    const pollInterval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetch('/api/digital-twin/state')
          .then((r) => r.json())
          .then((data) => {
            if (data && data.current_telemetry) {
              setTwinState(data);
              setHistory((prev) => {
                const last = prev[prev.length - 1];
                if (!last || last.id !== data.current_telemetry.id) {
                  const updated = [...prev, data.current_telemetry];
                  return updated.length > 150 ? updated.slice(-150) : updated;
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }
    }, 2000);

    const firebaseInterval = setInterval(() => {
      fetchFirebaseStatus();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(firebaseInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchInitialData, connectWebSocket, fetchFirebaseStatus]);

  // Actions
  const handleSetMode = async (mode: FaultType | 'AUTO') => {
    try {
      const res = await fetch('/api/simulation/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.success && twinState) {
        setTwinState({ ...twinState, simulation_mode: mode });
      }
    } catch {
      // Error setting mode
    }
  };

  const handleTogglePlayPause = async () => {
    const isRunning = twinState?.simulation_status === 'RUNNING';
    const endpoint = isRunning ? '/api/simulation/pause' : '/api/simulation/resume';
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.success && twinState) {
        setTwinState({
          ...twinState,
          simulation_status: isRunning ? 'PAUSED' : 'RUNNING',
        });
      }
    } catch {
      // Error toggling simulation
    }
  };

  const handleResetSimulation = async () => {
    try {
      const res = await fetch('/api/simulation/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchInitialData();
      }
    } catch {
      // Error resetting simulation
    }
  };

  const handleSetInterval = async (ms: number) => {
    try {
      const res = await fetch('/api/simulation/interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_ms: ms }),
      });
      const data = await res.json();
      if (data.success && twinState) {
        setTwinState({ ...twinState, interval_ms: ms });
      }
    } catch {
      // Error setting interval
    }
  };

  const handleRetrain = async (samplesPerClass: number) => {
    const res = await fetch('/api/ml/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples_per_class: samplesPerClass }),
    });
    const data = await res.json();
    if (data.success && data.evaluation) {
      setModelMetrics(data.evaluation);
    } else {
      throw new Error(data.error || 'Failed to retrain model');
    }
  };

  const handleAcknowledgeAlert = async (id: number) => {
    try {
      await fetch('/api/alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
      );
    } catch {
      // Error acknowledging alert
    }
  };

  const handleClearAlerts = async () => {
    try {
      await fetch('/api/alerts/clear', { method: 'POST' });
      setAlerts([]);
    } catch {
      setAlerts([]);
    }
  };

  const handleToggleMute = () => {
    const newMuted = audioNotifier.toggleMute();
    setIsMuted(newMuted);
  };

  const currentMode = twinState?.simulation_mode || 'HEALTHY';
  const simStatus: SimulationStatus = twinState?.simulation_status || 'RUNNING';
  const intervalMs = twinState?.interval_ms || 1000;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* 1. Header */}
      <Header
        twinState={twinState}
        isConnected={isConnected}
        isMuted={isMuted}
        firebaseStatus={firebaseStatus}
        onToggleMute={handleToggleMute}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        onOpenFirebaseModal={() => setIsFirebaseModalOpen(true)}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Firebase RTDB Live Stream Status Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="text-xs">
              <span className="font-bold text-slate-800">Firebase RTDB Cloud Link:</span>{' '}
              <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {firebaseStatus?.database_url || 'https://gecpl12-57603-default-rtdb.firebaseio.com'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">Synced:</span>{' '}
              <span className="font-mono font-bold text-slate-800">
                {firebaseStatus?.total_synced_records ?? 0}
              </span>{' '}
              records
            </div>
            <div>
              <span className="text-slate-400">Ping:</span>{' '}
              <span className="font-mono font-bold text-emerald-600">
                {firebaseStatus?.latency_ms ?? 0}ms
              </span>
            </div>
            <button
              onClick={() => setIsFirebaseModalOpen(true)}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer"
            >
              View Cloud Data &rarr;
            </button>
          </div>
        </div>

        {/* 2. Cockpit Flight Instruments Cluster */}
        <GaugeCluster telemetry={twinState?.current_telemetry || null} />

        {/* 3. Digital Twin Schematic & AI Diagnostics Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Engine Cutaway Digital Twin (8 cols on XL) */}
          <div className="xl:col-span-8">
            <DigitalTwinEngineView twinState={twinState} />
          </div>

          {/* AI Health Diagnostics & Prognostics (4 cols on XL) */}
          <div className="xl:col-span-4">
            <AIDiagnosticsPanel
              twinState={twinState}
              onOpenModelModal={() => setIsModelModalOpen(true)}
            />
          </div>
        </div>

        {/* 4. Real-time Telemetry & Derivative Rate Strip Charts */}
        <TelemetryCharts
          history={history}
          onClearHistory={() => setHistory([])}
        />

        {/* 5. Simulation Testbench Controls & Fault Injector */}
        <SimulationControls
          currentMode={currentMode}
          simulationStatus={simStatus}
          intervalMs={intervalMs}
          onSetMode={handleSetMode}
          onTogglePlayPause={handleTogglePlayPause}
          onResetSimulation={handleResetSimulation}
          onSetInterval={handleSetInterval}
        />

        {/* 6. Real-time Prognostic Alarm Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
          <AlertFeed
            alerts={alerts}
            onAcknowledgeAlert={handleAcknowledgeAlert}
            onClearAlerts={handleClearAlerts}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            AeroTwin &bull; AI-Enabled Real-Time Digital Twin for Aero Piston Engine Health Prognostics (DRDO SIH26054)
          </span>
          <span className="font-mono text-slate-400">
            Node.js / Express / Vite / WASM SQLite / Random Forest Classifier
          </span>
        </div>
      </footer>

      {/* Model Evaluation & Retraining Dialog */}
      <ModelEvaluationModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        metrics={modelMetrics}
        onRetrain={handleRetrain}
      />

      {/* Firebase Realtime Database Cloud Sync Dialog */}
      <FirebaseModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
        status={firebaseStatus}
        onRefreshStatus={fetchFirebaseStatus}
      />
    </div>
  );
}
