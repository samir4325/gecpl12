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
import { DecisionSupportPanel } from './components/DecisionSupportPanel';
import { EarlyWarningBanner } from './components/EarlyWarningBanner';
import { ExplainabilityModal } from './components/ExplainabilityModal';
import { AlertFeed } from './components/AlertFeed';
import { SimulationControls } from './components/SimulationControls';
import { ModelEvaluationModal } from './components/ModelEvaluationModal';
import { FirebaseModal } from './components/FirebaseModal';
import { audioNotifier } from './utils/audio';
import { telemetryService } from './services/telemetryService';

export default function App() {
  const [twinState, setTwinState] = useState<DigitalTwinState>(() => telemetryService.getState());
  const [history, setHistory] = useState<TelemetryRecord[]>(() => telemetryService.getHistory());
  const [alerts, setAlerts] = useState<Alert[]>(() => telemetryService.getAlerts());
  const [isConnected, setIsConnected] = useState<boolean>(() => telemetryService.getIsConnected());
  const [isMuted, setIsMuted] = useState<boolean>(audioNotifier.getIsMuted());
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);
  const [isExplainabilityModalOpen, setIsExplainabilityModalOpen] = useState<boolean>(false);
  const [rightPanelView, setRightPanelView] = useState<'DECISION_SUPPORT' | 'AI_DIAGNOSTICS'>('DECISION_SUPPORT');
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseSyncStatus | null>(null);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);

  const lastAlertIdRef = useRef<number>(0);
  const lastPredictionStateRef = useRef<string>('NORMAL');

  // Fetch ML status and Firebase status
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

  const fetchMlStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ml/status');
      if (res.ok) {
        const data = await res.json();
        setModelMetrics(data);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    // Single source of truth telemetry subscription
    const unsubscribe = telemetryService.subscribe((data) => {
      setTwinState(data.twinState);
      setHistory(data.history);
      setAlerts(data.alerts);
      setIsConnected(data.isConnected);

      // Check audio alerts
      if (data.alerts.length > 0) {
        const topAlert = data.alerts[0];
        if (topAlert && topAlert.id > lastAlertIdRef.current) {
          lastAlertIdRef.current = topAlert.id;
          if (topAlert.severity === 'CRITICAL') {
            audioNotifier.playCritical();
          } else {
            audioNotifier.playWarning();
          }
        }
      }

      // Voice callout on prediction change
      const ds = data.twinState?.decision_support;
      if (ds && ds.prediction_state !== lastPredictionStateRef.current) {
        const prev = lastPredictionStateRef.current;
        lastPredictionStateRef.current = ds.prediction_state;

        if (ds.prediction_state === 'CRITICAL') {
          audioNotifier.speakCallout(`Warning: ${ds.probable_condition}`);
        } else if (ds.prediction_state === 'EARLY_WARNING' || ds.prediction_state === 'HIGH_RISK') {
          audioNotifier.speakCallout(`Caution: ${ds.probable_condition}`);
        } else if (ds.prediction_state === 'NORMAL' && prev !== 'NORMAL') {
          audioNotifier.speakCallout('All engine parameters returned to nominal flight envelope.');
        }
      }
    });

    fetchMlStatus();
    fetchFirebaseStatus();

    const firebaseInterval = setInterval(() => {
      fetchFirebaseStatus();
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(firebaseInterval);
    };
  }, [fetchMlStatus, fetchFirebaseStatus]);

  // Actions delegate to central telemetry service
  const handleSetMode = async (mode: FaultType | 'AUTO') => {
    await telemetryService.setMode(mode);
  };

  const handleTogglePlayPause = async () => {
    await telemetryService.togglePlayPause();
  };

  const handleResetSimulation = async () => {
    await telemetryService.reset();
  };

  const handleSetInterval = async (ms: number) => {
    await telemetryService.setInterval(ms);
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
    await telemetryService.acknowledgeAlert(id);
  };

  const handleClearAlerts = async () => {
    await telemetryService.clearAlerts();
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
        onOpenDecisionModal={() => setIsExplainabilityModalOpen(true)}
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
              onClick={async () => {
                try {
                  await fetch('/api/firebase/sync', { method: 'POST' });
                  await fetchFirebaseStatus();
                } catch {
                  // ignore
                }
              }}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              title="Force immediate sync to Firebase"
            >
              Sync Now
            </button>
            <button
              onClick={() => setIsFirebaseModalOpen(true)}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer"
            >
              View Cloud Data &rarr;
            </button>
          </div>
        </div>

        {/* Real-time Early-Warning & Decision-Support Banner */}
        <EarlyWarningBanner
          twinState={twinState}
          history={history}
          onOpenExplainabilityModal={() => setIsExplainabilityModalOpen(true)}
          onSelectFaultMode={handleSetMode}
        />

        {/* 2. Cockpit Flight Instruments Cluster */}
        <GaugeCluster telemetry={twinState?.current_telemetry || null} />

        {/* 3. Digital Twin Schematic & AI Diagnostics / Decision Support Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Engine Cutaway Digital Twin (8 cols on XL) */}
          <div className="xl:col-span-8">
            <DigitalTwinEngineView twinState={twinState} />
          </div>

          {/* Decision Support & AI Diagnostics (4 cols on XL) */}
          <div className="xl:col-span-4 space-y-3">
            {/* View Tab Switcher */}
            <div className="flex p-1 bg-slate-200/80 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setRightPanelView('DECISION_SUPPORT')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  rightPanelView === 'DECISION_SUPPORT'
                    ? 'bg-white text-indigo-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Decision Support
              </button>
              <button
                onClick={() => setRightPanelView('AI_DIAGNOSTICS')}
                className={`flex-1 py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  rightPanelView === 'AI_DIAGNOSTICS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                AI Model &amp; Probs
              </button>
            </div>

            {rightPanelView === 'DECISION_SUPPORT' ? (
              <DecisionSupportPanel
                twinState={twinState}
                history={history}
                onOpenExplainabilityModal={() => setIsExplainabilityModalOpen(true)}
              />
            ) : (
              <AIDiagnosticsPanel
                twinState={twinState}
                onOpenModelModal={() => setIsModelModalOpen(true)}
                onOpenDecisionModal={() => setIsExplainabilityModalOpen(true)}
              />
            )}
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

      {/* Explainability & 8-Point Decision Support Modal */}
      <ExplainabilityModal
        isOpen={isExplainabilityModalOpen}
        onClose={() => setIsExplainabilityModalOpen(false)}
        twinState={twinState}
        history={history}
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
