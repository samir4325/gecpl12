import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  Flame,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { TelemetryRecord } from '../types';

interface TelemetryChartsProps {
  history: TelemetryRecord[];
  onClearHistory?: () => void;
}

type ChartTab = 'thermal' | 'lubrication' | 'vibration' | 'powertrain' | 'unified';

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  history,
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<ChartTab>('thermal');
  const [timeWindow, setTimeWindow] = useState<number>(60); // 30, 60, 120 seconds
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Slice data based on selected timeWindow
  const chartData = React.useMemo(() => {
    const records = isPaused ? history : history.slice(-timeWindow);
    return records.map((r, i) => {
      // Format time label: seconds ago or HH:MM:SS
      const d = new Date(r.timestamp);
      const timeStr = isNaN(d.getTime())
        ? `${i}s`
        : d.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });
      return {
        time: timeStr,
        rpm: Math.round(r.rpm),
        temp: Number(r.engine_temperature.toFixed(1)),
        tempRate: Number(r.temperature_rate.toFixed(2)),
        oilPress: Number(r.oil_pressure.toFixed(1)),
        oilPressRate: Number(r.oil_pressure_rate.toFixed(2)),
        oilTemp: Number(r.oil_temperature.toFixed(1)),
        vib: Number(r.vibration.toFixed(2)),
        vibRate: Number(r.vibration_rate.toFixed(2)),
        rpmVar: Number(r.rpm_variation.toFixed(1)),
        map: Number(r.manifold_pressure.toFixed(1)),
        fuel: Number(r.fuel_flow.toFixed(1)),
        anomaly: Number((r.anomaly_score * 100).toFixed(1)),
      };
    });
  }, [history, timeWindow, isPaused]);

  return (
    <div
      id="telemetry-strip-charts"
      className={`bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col ${
        isExpanded ? 'fixed inset-4 z-50 overflow-y-auto' : ''
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Real-Time Telemetry & Rate-of-Change Strip Charts
            </h2>
            <p className="text-xs text-slate-500">
              High-frequency multi-channel physics telemetry with threshold boundary limits
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time Window Buttons */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 text-xs">
            {[30, 60, 120].map((sec) => (
              <button
                key={sec}
                onClick={() => setTimeWindow(sec)}
                className={`px-2 py-1 rounded-md font-medium transition-all ${
                  timeWindow === sec
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>

          {/* Pause / Resume */}
          <button
            id="chart-pause-toggle-btn"
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${
              isPaused
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title={isPaused ? 'Resume chart streaming' : 'Pause chart streaming'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Clear Buffer */}
          {onClearHistory && (
            <button
              onClick={onClearHistory}
              className="p-1.5 rounded-lg border bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 transition-colors"
              title="Clear chart buffer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Expand Fullscreen Toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg border bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 transition-colors"
            title={isExpanded ? 'Exit expanded view' : 'Expand full screen'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveTab('thermal')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'thermal'
              ? 'bg-orange-50 text-orange-800 border border-orange-200 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-orange-500" />
          Thermal & CHT (°C)
        </button>
        <button
          onClick={() => setActiveTab('lubrication')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'lubrication'
              ? 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Gauge className="w-3.5 h-3.5 text-blue-500" />
          Lubrication (PSI)
        </button>
        <button
          onClick={() => setActiveTab('vibration')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'vibration'
              ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-indigo-500" />
          Vibration RMS (mm/s)
        </button>
        <button
          onClick={() => setActiveTab('powertrain')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'powertrain'
              ? 'bg-teal-50 text-teal-800 border border-teal-200 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-teal-500" />
          RPM & Manifold
        </button>
        <button
          onClick={() => setActiveTab('unified')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'unified'
              ? 'bg-slate-800 text-white font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Unified 4-Grid
        </button>
      </div>

      {/* Chart View Content */}
      <div className="w-full">
        {activeTab === 'thermal' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">
                Engine Temperature & Thermal Rate Derivative
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                  CHT Temp (°C)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  Oil Temp (°C)
                </span>
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  -- Critical Limit (105°C)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[50, 125]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <ReferenceLine y={105} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'CRITICAL (105°C)', fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={94} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'WARNING (94°C)', fill: '#f59e0b', fontSize: 10 }} />
                  <Area type="monotone" dataKey="temp" stroke="#ea580c" strokeWidth={2} fill="url(#tempGrad)" name="CHT Temp (°C)" />
                  <Line type="monotone" dataKey="oilTemp" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Oil Temp (°C)" />
                  <Line type="monotone" dataKey="tempRate" stroke="#6366f1" strokeWidth={1.5} dot={false} name="Rate (°C/s)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'lubrication' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">
                Oil Pressure & Decay Velocity
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  Oil Pressure (PSI)
                </span>
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  -- Min Limit (25 PSI)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="oilGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[0, 75]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'CRITICAL MIN (25 PSI)', fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={38} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'WARNING (38 PSI)', fill: '#f59e0b', fontSize: 10 }} />
                  <Area type="monotone" dataKey="oilPress" stroke="#0284c7" strokeWidth={2} fill="url(#oilGrad2)" name="Oil Pressure (PSI)" />
                  <Line type="monotone" dataKey="oilPressRate" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="Rate (PSI/s)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'vibration' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">
                Bearing Mechanical RMS Vibration & Rate
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                  Vibration RMS (mm/s)
                </span>
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  -- Critical Limit (6.0 mm/s)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vibGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[0, 8.5]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <ReferenceLine y={6.0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'CRITICAL (6.0 mm/s)', fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={3.5} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'WARNING (3.5 mm/s)', fill: '#f59e0b', fontSize: 10 }} />
                  <Area type="monotone" dataKey="vib" stroke="#4f46e5" strokeWidth={2} fill="url(#vibGrad)" name="Vibration (mm/s)" />
                  <Line type="monotone" dataKey="vibRate" stroke="#ec4899" strokeWidth={1.5} dot={false} name="Rate (mm/s²)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'powertrain' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span className="font-semibold text-slate-700">
                Engine Tachometer (RPM) & Manifold Pressure
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                  RPM
                </span>
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  -- Redline (2950 RPM)
                </span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[1600, 3100]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '11px',
                    }}
                  />
                  <ReferenceLine y={2950} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'REDLINE (2950 RPM)', fill: '#ef4444', fontSize: 10 }} />
                  <ReferenceLine y={2100} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'CRUISE MIN', fill: '#10b981', fontSize: 10 }} />
                  <Line type="monotone" dataKey="rpm" stroke="#0d9488" strokeWidth={2} dot={false} name="RPM" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === 'unified' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Temp mini */}
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>CHT Temperature (°C)</span>
                <span className="text-orange-600 font-mono font-bold">
                  {chartData[chartData.length - 1]?.temp || 0} °C
                </span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[60, 120]} tick={{ fontSize: 9 }} />
                    <ReferenceLine y={105} stroke="#ef4444" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="temp" stroke="#ea580c" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Oil Press mini */}
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Oil Pressure (PSI)</span>
                <span className="text-blue-600 font-mono font-bold">
                  {chartData[chartData.length - 1]?.oilPress || 0} PSI
                </span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[10, 70]} tick={{ fontSize: 9 }} />
                    <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="oilPress" stroke="#0284c7" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Vibration mini */}
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>Vibration RMS (mm/s)</span>
                <span className="text-indigo-600 font-mono font-bold">
                  {chartData[chartData.length - 1]?.vib || 0} mm/s
                </span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 8]} tick={{ fontSize: 9 }} />
                    <ReferenceLine y={6.0} stroke="#ef4444" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="vib" stroke="#4f46e5" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Anomaly Score mini */}
            <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>AI Anomaly Score (%)</span>
                <span className="text-rose-600 font-mono font-bold">
                  {chartData[chartData.length - 1]?.anomaly || 0}%
                </span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                    <Area type="monotone" dataKey="anomaly" stroke="#e11d48" fill="#fda4af" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
