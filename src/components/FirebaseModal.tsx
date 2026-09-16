import React, { useState, useEffect } from 'react';
import {
  X,
  Database,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Server,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { FirebaseSyncStatus } from '../types';

interface FirebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: FirebaseSyncStatus | null;
  onRefreshStatus: () => Promise<void>;
}

export const FirebaseModal: React.FC<FirebaseModalProps> = ({
  isOpen,
  onClose,
  status,
  onRefreshStatus,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [liveJson, setLiveJson] = useState<string | null>(null);
  const [isLoadingJson, setIsLoadingJson] = useState(false);

  useEffect(() => {
    if (isOpen && status?.database_url) {
      loadFirebaseJson();
    }
  }, [isOpen, status?.database_url]);

  const loadFirebaseJson = async () => {
    if (!status?.database_url) return;
    setIsLoadingJson(true);
    try {
      const res = await fetch(`${status.database_url}/digital_twin.json`);
      if (res.ok) {
        const data = await res.json();
        setLiveJson(JSON.stringify(data, null, 2));
      } else {
        setLiveJson('// Failed to read from Firebase: HTTP ' + res.status);
      }
    } catch (err: unknown) {
      setLiveJson('// Error fetching from Firebase: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoadingJson(false);
    }
  };

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/firebase/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult(`Synced successfully (${data.status.total_synced_records} total records)`);
      } else {
        setTestResult(data.error || data.message || 'Sync failed');
      }
      await onRefreshStatus();
      loadFirebaseJson();
    } catch (err: unknown) {
      setTestResult('Network error syncing to Firebase');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/firebase/test', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult(`Connection OK! Ping latency: ${data.status.latency_ms}ms`);
      } else {
        setTestResult(`Ping failed: ${data.message || 'Check database rules'}`);
      }
      await onRefreshStatus();
    } catch {
      setTestResult('Failed to reach backend test endpoint');
    } finally {
      setIsTesting(false);
    }
  };

  const dbUrl = status?.database_url || 'https://gecpl12-57603-default-rtdb.firebaseio.com';
  const isConnected = status?.connected ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="firebase-sync-modal"
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Firebase Realtime Database
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                    isConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      CONNECTED
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      DISCONNECTED
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cloud Telemetry Streaming &bull; Remote Command Interface
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-700">
          {/* Connection URL Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>TARGET FIREBASE REALTIME DATABASE</span>
              <span className="font-mono text-slate-700 font-normal">
                Project: {status?.project_id || 'gecpl12-57603'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded border border-slate-200">
              <span className="font-mono text-xs text-slate-800 truncate select-all">
                {dbUrl}
              </span>
              <a
                href={dbUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium shrink-0"
              >
                <span>Open</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Sync Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Total Synced</span>
              </div>
              <div className="text-lg font-bold font-mono text-slate-900">
                {status?.total_synced_records ?? 0}
              </div>
              <div className="text-[11px] text-slate-400">Records sent</div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Server className="w-3.5 h-3.5 text-sky-500" />
                <span>Roundtrip Ping</span>
              </div>
              <div className="text-lg font-bold font-mono text-slate-900">
                {status?.latency_ms ?? 0} ms
              </div>
              <div className="text-[11px] text-emerald-600 font-medium">Low latency</div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Last Sync</span>
              </div>
              <div className="text-xs font-mono text-slate-800 truncate">
                {status?.last_sync_timestamp
                  ? new Date(status.last_sync_timestamp).toLocaleTimeString()
                  : 'Pending'}
              </div>
              <div className="text-[11px] text-slate-400">Auto sync active</div>
            </div>
          </div>

          {/* Feedback banner */}
          {testResult && (
            <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-800 flex items-center justify-between">
              <span>{testResult}</span>
              <button
                onClick={() => setTestResult(null)}
                className="text-sky-600 hover:text-sky-900 font-bold ml-2"
              >
                &times;
              </button>
            </div>
          )}

          {/* Cloud Nodes Reference */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Available Cloud Endpoints
            </h3>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
                <span className="text-slate-700">/digital_twin.json</span>
                <span className="text-slate-500 text-[11px]">Full twin state, health score & predictions</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
                <span className="text-slate-700">/telemetry/live.json</span>
                <span className="text-slate-500 text-[11px]">Real-time 1Hz sensor readings (RPM, CHT, etc.)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
                <span className="text-slate-700">/simulation_control.json</span>
                <span className="text-sky-600 text-[11px]">Remote cloud commands (Write to inject faults)</span>
              </div>
            </div>
          </div>

          {/* Live Data Viewer */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                <span>Live Cloud Snapshot (/digital_twin.json)</span>
              </div>
              <button
                onClick={loadFirebaseJson}
                disabled={isLoadingJson}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingJson ? 'animate-spin' : ''}`} />
                <span>Refresh Snapshot</span>
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono max-h-40 overflow-y-auto border border-slate-800 select-all">
              {isLoadingJson ? 'Loading live snapshot from Firebase...' : liveJson || '// No data loaded'}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>DRDO SIH26054 Cloud Bridge</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestPing}
              disabled={isTesting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {isTesting ? 'Testing...' : 'Test Ping'}
            </button>

            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
