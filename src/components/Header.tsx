import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { DigitalTwinState } from '../types';

interface HeaderProps {
  twinState: DigitalTwinState | null;
  isConnected: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenModelModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  twinState,
  isConnected,
  isMuted,
  onToggleMute,
  onOpenModelModal,
}) => {
  const healthStatus = twinState?.engine_health || 'HEALTHY';
  const healthScore = twinState?.health_score ?? 100;
  const riskLevel = twinState?.risk_level || 'NORMAL';
  const mode = twinState?.simulation_mode || 'HEALTHY';

  const getStatusBadge = () => {
    switch (healthStatus) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-rose-600" />
            CRITICAL HEALTH
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            ATTENTION REQUIRED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            ALL SYSTEMS NOMINAL
          </span>
        );
    }
  };

  const getRiskBadge = () => {
    const colors: Record<string, string> = {
      NORMAL: 'bg-slate-100 text-slate-700 border-slate-300',
      ELEVATED: 'bg-blue-50 text-blue-700 border-blue-300',
      HIGH: 'bg-amber-50 text-amber-700 border-amber-300',
      CRITICAL: 'bg-rose-50 text-rose-700 border-rose-300',
    };
    return (
      <span
        className={`px-2.5 py-0.5 rounded text-xs font-mono font-medium border ${
          colors[riskLevel] || colors.NORMAL
        }`}
      >
        RISK: {riskLevel}
      </span>
    );
  };

  return (
    <header
      id="aerotwin-header"
      className="bg-white border-b border-slate-200 px-4 py-3 sm:px-6 sticky top-0 z-30 shadow-xs"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Title & Engine Spec */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <Gauge className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                AeroTwin
              </h1>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600 border border-slate-200">
                ROTAX 914F / DRDO SIH26054
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              AI-Enabled Real-Time Digital Twin &bull; Aero Piston Health Prognostics
            </p>
          </div>
        </div>

        {/* Status Indicators & Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Health status */}
          {getStatusBadge()}

          {/* Risk Level */}
          {getRiskBadge()}

          {/* Health Score Pill */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-500">Health Index</span>
            <span
              className={`font-mono text-xs font-bold ${
                healthScore < 60
                  ? 'text-rose-600'
                  : healthScore < 85
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {healthScore}%
            </span>
          </div>

          {/* Simulation Mode */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-mono">
            <span className="text-slate-400">MODE:</span>
            <span className="font-semibold text-slate-800">{mode}</span>
          </div>

          {/* WebSocket Connection */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border font-medium ${
              isConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
            title={isConnected ? 'Live WebSocket telemetry active' : 'Connecting to simulation server...'}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>LIVE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span>RECONNECTING</span>
              </>
            )}
          </div>

          {/* Mute/Sound Toggle */}
          <button
            id="audio-mute-toggle"
            onClick={onToggleMute}
            className={`p-1.5 rounded-lg border transition-colors ${
              isMuted
                ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                : 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100'
            }`}
            title={isMuted ? 'Audio alarms muted (click to enable)' : 'Audio alarms active (click to mute)'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* ML Model Metrics button */}
          <button
            id="open-ml-modal-btn"
            onClick={onOpenModelModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>AI Model Stats</span>
          </button>
        </div>
      </div>
    </header>
  );
};
