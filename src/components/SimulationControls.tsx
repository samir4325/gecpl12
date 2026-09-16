import React from 'react';
import {
  AlertOctagon,
  Download,
  Flame,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { FaultType, SimulationStatus } from '../types';

interface SimulationControlsProps {
  currentMode: FaultType | 'AUTO';
  simulationStatus: SimulationStatus;
  intervalMs: number;
  onSetMode: (mode: FaultType | 'AUTO') => void;
  onTogglePlayPause: () => void;
  onResetSimulation: () => void;
  onSetInterval: (ms: number) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  currentMode,
  simulationStatus,
  intervalMs,
  onSetMode,
  onTogglePlayPause,
  onResetSimulation,
  onSetInterval,
}) => {
  const isRunning = simulationStatus === 'RUNNING';

  const faultModes: {
    mode: FaultType | 'AUTO';
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      mode: 'HEALTHY',
      label: 'Nominal Cruise',
      description: 'Standard safe flight envelope',
      icon: <Gauge className="w-4 h-4 text-emerald-600" />,
      color: 'hover:border-emerald-400 hover:bg-emerald-50/50',
    },
    {
      mode: 'OVERHEATING',
      label: 'Thermal Runaway',
      description: 'Cooling jacket loss (CHT > 94°C)',
      icon: <Flame className="w-4 h-4 text-orange-600" />,
      color: 'hover:border-orange-400 hover:bg-orange-50/50',
    },
    {
      mode: 'LOW_OIL_PRESSURE',
      label: 'Oil System Decay',
      description: 'Oil pump cavitation (< 38 PSI)',
      icon: <AlertOctagon className="w-4 h-4 text-blue-600" />,
      color: 'hover:border-blue-400 hover:bg-blue-50/50',
    },
    {
      mode: 'HIGH_VIBRATION',
      label: 'Bearing Degradation',
      description: 'Bearing wear (> 3.5 mm/s RMS)',
      icon: <TrendingUp className="w-4 h-4 text-indigo-600" />,
      color: 'hover:border-indigo-400 hover:bg-indigo-50/50',
    },
    {
      mode: 'RPM_INSTABILITY',
      label: 'Governor Surge',
      description: 'Speed oscillation & fluctuation',
      icon: <Zap className="w-4 h-4 text-amber-600" />,
      color: 'hover:border-amber-400 hover:bg-amber-50/50',
    },
    {
      mode: 'AUTO',
      label: 'Auto Flight Cycle',
      description: 'Takeoff, Climb, Cruise & Descent',
      icon: <Workflow className="w-4 h-4 text-sky-600" />,
      color: 'hover:border-sky-400 hover:bg-sky-50/50',
    },
  ];

  const handleExport = (format: 'csv' | 'json') => {
    window.location.href = `/api/telemetry/export?format=${format}&limit=500`;
  };

  return (
    <div
      id="simulation-controls-panel"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col gap-4"
    >
      {/* Header & Execution Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Physics Simulation & Fault Injection Testbench
            </h2>
            <p className="text-xs text-slate-500">
              Inject real-time degradation modes or run complete mission flight profiles
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Play/Pause */}
          <button
            id="sim-play-pause-btn"
            onClick={onTogglePlayPause}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
              isRunning
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Sim</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Resume Sim</span>
              </>
            )}
          </button>

          {/* Reset */}
          <button
            id="sim-reset-btn"
            onClick={onResetSimulation}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-colors"
            title="Reset engine physics state to nominal cruise"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Speed Selection */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
            {[
              { label: '2 Hz', ms: 500 },
              { label: '1 Hz', ms: 1000 },
              { label: '0.5 Hz', ms: 2000 },
            ].map((s) => (
              <button
                key={s.ms}
                onClick={() => onSetInterval(s.ms)}
                className={`px-2 py-1 rounded-md font-medium transition-all ${
                  intervalMs === s.ms
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Blackbox Telemetry Export */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs"
              title="Export recorded telemetry as CSV"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>CSV Log</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fault Injection Mode Buttons */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Select Operating Profile / Inject Failure Signature
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {faultModes.map((fm) => {
            const isActive = currentMode === fm.mode;
            return (
              <button
                key={fm.mode}
                id={`mode-btn-${fm.mode.toLowerCase()}`}
                onClick={() => onSetMode(fm.mode)}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-sky-500/50'
                    : `bg-slate-50 text-slate-800 border-slate-200 ${fm.color}`
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="p-1 rounded-md bg-white/80 dark:bg-slate-800/80 shadow-xs">
                    {fm.icon}
                  </div>
                  {isActive && (
                    <span className="text-[10px] font-mono uppercase font-bold text-sky-400">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold">{fm.label}</div>
                  <div
                    className={`text-[10px] mt-0.5 leading-tight ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {fm.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
