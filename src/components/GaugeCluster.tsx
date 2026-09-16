import React from 'react';
import {
  Activity,
  Battery,
  Flame,
  Gauge,
  Sliders,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { TelemetryRecord } from '../types';

interface GaugeClusterProps {
  telemetry: TelemetryRecord | null;
}

interface GaugeItemProps {
  id: string;
  title: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  greenRange: [number, number];
  yellowRange: [number, number];
  redRange: [number, number];
  rate?: number;
  rateUnit?: string;
  icon: React.ReactNode;
  decimals?: number;
}

const CircularGauge: React.FC<GaugeItemProps> = ({
  id,
  title,
  value,
  unit,
  min,
  max,
  greenRange,
  yellowRange,
  redRange,
  rate,
  rateUnit,
  icon,
  decimals = 1,
}) => {
  // Clamp value
  const clampedVal = Math.max(min, Math.min(max, value));
  // 240-degree arc from -120 to +120
  const percent = (clampedVal - min) / (max - min);
  const angle = -120 + percent * 240;

  // Determine state
  const isRed =
    (clampedVal >= redRange[0] && clampedVal <= redRange[1]) ||
    (redRange[0] === redRange[1] && clampedVal >= redRange[0]);
  const isYellow =
    !isRed && clampedVal >= yellowRange[0] && clampedVal <= yellowRange[1];

  const statusColor = isRed
    ? 'text-rose-600 dark:text-rose-400'
    : isYellow
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-900 dark:text-slate-100';

  const arcColor = isRed ? '#ef4444' : isYellow ? '#f59e0b' : '#10b981';

  return (
    <div
      id={id}
      className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col items-center justify-between shadow-xs relative overflow-hidden transition-all hover:border-slate-300"
    >
      {/* Gauge Title & Icon */}
      <div className="w-full flex items-center justify-between text-xs mb-1">
        <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
          {icon}
          <span>{title}</span>
        </div>
        {rate !== undefined && (
          <div
            className={`flex items-center gap-0.5 font-mono text-[10px] font-medium ${
              Math.abs(rate) > 0.01
                ? rate > 0
                  ? 'text-amber-600'
                  : 'text-blue-600'
                : 'text-slate-400'
            }`}
          >
            {rate > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : rate < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : null}
            <span>
              {rate > 0 ? '+' : ''}
              {rate.toFixed(decimals === 0 ? 1 : decimals)}
              {rateUnit ? ` ${rateUnit}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* SVG Arc Gauge */}
      <div className="relative w-32 h-24 flex items-center justify-center">
        <svg viewBox="0 0 120 90" className="w-full h-full overflow-visible">
          {/* Background Arc */}
          <path
            d="M 20 80 A 45 45 0 1 1 100 80"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Active Value Arc */}
          <path
            d="M 20 80 A 45 45 0 1 1 100 80"
            fill="none"
            stroke={arcColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="210"
            strokeDashoffset={210 - 210 * percent}
            className="transition-all duration-300"
          />

          {/* Center Needle Pivot */}
          <circle cx="60" cy="65" r="4" fill="#334155" />

          {/* Needle Indicator */}
          <g transform={`rotate(${angle} 60 65)`} className="transition-transform duration-300">
            <line x1="60" y1="65" x2="60" y2="28" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" />
            <polygon points="60,24 57,32 63,32" fill="#0f172a" />
          </g>
        </svg>

        {/* Readout Value */}
        <div className="absolute bottom-0 text-center">
          <span className={`text-base font-bold font-mono tracking-tight ${statusColor}`}>
            {value.toFixed(decimals)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono ml-0.5">{unit}</span>
        </div>
      </div>

      {/* Range Scale Markers */}
      <div className="w-full flex items-center justify-between text-[9px] font-mono text-slate-600 mt-1 border-t border-slate-100 pt-1">
        <span>{min}</span>
        <span className="text-emerald-700 font-semibold">
          NORM: {greenRange[0]}-{greenRange[1]}
        </span>
        <span>{max}</span>
      </div>
    </div>
  );
};

export const GaugeCluster: React.FC<GaugeClusterProps> = ({ telemetry }) => {
  const t = telemetry || {
    rpm: 2400,
    engine_temperature: 82.0,
    oil_pressure: 50.0,
    oil_temperature: 80.0,
    fuel_flow: 22.0,
    manifold_pressure: 25.0,
    vibration: 1.8,
    battery_voltage: 28.0,
    throttle_position: 70.0,
    temperature_rate: 0,
    oil_pressure_rate: 0,
    vibration_rate: 0,
    rpm_variation: 0,
    id: 0,
    timestamp: '',
    fault: 'HEALTHY',
    health_status: 'HEALTHY',
    anomaly_score: 0,
    prediction_confidence: 1,
  };

  return (
    <div id="flight-instrument-cluster" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-slate-700" />
          <h2 className="text-sm font-bold text-slate-900">Cockpit Flight Instruments</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <Battery className="w-3.5 h-3.5 text-slate-400" />
            {t.battery_voltage.toFixed(1)} V
          </span>
          <span className="flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Throttle: {t.throttle_position.toFixed(0)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* 1. Tachometer */}
        <CircularGauge
          id="gauge-rpm"
          title="Tachometer"
          value={t.rpm}
          unit="RPM"
          min={1600}
          max={3200}
          greenRange={[2100, 2600]}
          yellowRange={[2600, 2850]}
          redRange={[2950, 3200]}
          rate={t.rpm_variation}
          rateUnit="Δ/s"
          icon={<Activity className="w-3.5 h-3.5 text-sky-600" />}
          decimals={0}
        />

        {/* 2. CHT Temperature */}
        <CircularGauge
          id="gauge-cht"
          title="Cyl Head Temp"
          value={t.engine_temperature}
          unit="°C"
          min={40}
          max={130}
          greenRange={[75, 92]}
          yellowRange={[92, 105]}
          redRange={[105, 130]}
          rate={t.temperature_rate}
          rateUnit="°C/s"
          icon={<Flame className="w-3.5 h-3.5 text-orange-600" />}
          decimals={1}
        />

        {/* 3. Oil Pressure */}
        <CircularGauge
          id="gauge-oil-press"
          title="Oil Pressure"
          value={t.oil_pressure}
          unit="PSI"
          min={10}
          max={80}
          greenRange={[45, 65]}
          yellowRange={[25, 45]}
          redRange={[10, 25]}
          rate={t.oil_pressure_rate}
          rateUnit="PSI/s"
          icon={<Gauge className="w-3.5 h-3.5 text-blue-600" />}
          decimals={1}
        />

        {/* 4. Vibration Sensor */}
        <CircularGauge
          id="gauge-vibration"
          title="Vibration RMS"
          value={t.vibration}
          unit="mm/s"
          min={0.5}
          max={8.0}
          greenRange={[0.5, 2.5]}
          yellowRange={[2.5, 5.5]}
          redRange={[5.5, 8.0]}
          rate={t.vibration_rate}
          rateUnit="mm/s²"
          icon={<Activity className="w-3.5 h-3.5 text-indigo-600" />}
          decimals={2}
        />

        {/* 5. Manifold Absolute Pressure (MAP) */}
        <CircularGauge
          id="gauge-map"
          title="Manifold Press"
          value={t.manifold_pressure}
          unit="inHg"
          min={15}
          max={35}
          greenRange={[22, 28]}
          yellowRange={[28, 32]}
          redRange={[32, 35]}
          icon={<Gauge className="w-3.5 h-3.5 text-teal-600" />}
          decimals={1}
        />

        {/* 6. Fuel Flow */}
        <CircularGauge
          id="gauge-fuel-flow"
          title="Fuel Flow"
          value={t.fuel_flow}
          unit="L/h"
          min={10}
          max={45}
          greenRange={[18, 28]}
          yellowRange={[28, 36]}
          redRange={[36, 45]}
          icon={<Activity className="w-3.5 h-3.5 text-purple-600" />}
          decimals={1}
        />
      </div>
    </div>
  );
};
