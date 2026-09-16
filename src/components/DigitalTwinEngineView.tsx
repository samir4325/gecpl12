import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Flame,
  Gauge,
  HelpCircle,
  Layers,
  Thermometer,
  Zap,
} from 'lucide-react';
import { DigitalTwinState } from '../types';

interface DigitalTwinEngineViewProps {
  twinState: DigitalTwinState | null;
}

type ComponentKey =
  | 'cylinder_head'
  | 'lubrication_system'
  | 'crankshaft_bearings'
  | 'valvetrain_ignition';

export const DigitalTwinEngineView: React.FC<DigitalTwinEngineViewProps> = ({
  twinState,
}) => {
  const [selectedComponent, setSelectedComponent] =
    useState<ComponentKey>('cylinder_head');
  const [showThermalOverlay, setShowThermalOverlay] = useState(true);

  const telemetry = twinState?.current_telemetry;
  const components = twinState?.component_status;

  const engineTemp = telemetry?.engine_temperature ?? 82.0;
  const oilPress = telemetry?.oil_pressure ?? 50.0;
  const oilTemp = telemetry?.oil_temperature ?? 80.0;
  const vibration = telemetry?.vibration ?? 1.8;
  const rpm = telemetry?.rpm ?? 2400;
  const manifoldPress = telemetry?.manifold_pressure ?? 25.0;

  // Compute thermal gradient color for cylinder heads based on temperature
  const getCylinderColor = () => {
    if (!showThermalOverlay) return '#334155'; // Slate-700
    if (engineTemp > 105) return '#dc2626'; // Red-600
    if (engineTemp > 96) return '#ea580c'; // Orange-600
    if (engineTemp > 90) return '#d97706'; // Amber-600
    if (engineTemp > 80) return '#059669'; // Emerald-600
    return '#0284c7'; // Sky-600 (cool)
  };

  // Compute oil gallery color based on oil pressure
  const getOilSystemColor = () => {
    if (oilPress < 25) return '#dc2626';
    if (oilPress < 38) return '#d97706';
    return '#0284c7';
  };

  // Compute vibration stroke width & color for bearings
  const getBearingGlow = () => {
    if (vibration > 6.0) return 'stroke-rose-600 stroke-[3px] animate-pulse';
    if (vibration > 3.5) return 'stroke-amber-500 stroke-[2px]';
    return 'stroke-emerald-500 stroke-[1.5px]';
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'CRITICAL':
        return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'WARNING':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    }
  };

  const activeCompInfo = components ? components[selectedComponent] : null;

  return (
    <div
      id="digital-twin-schematic-card"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-700">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Aero Engine Digital Twin Schematic
            </h2>
            <p className="text-xs text-slate-500">
              Interactive 4-Cylinder Horizontally Opposed Powertrain Topology
            </p>
          </div>
        </div>

        {/* Thermal overlay toggle */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-thermal-overlay-btn"
            onClick={() => setShowThermalOverlay(!showThermalOverlay)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
              showThermalOverlay
                ? 'bg-amber-50 text-amber-800 border-amber-300'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>{showThermalOverlay ? 'Thermal Gradient ON' : 'Thermal Gradient OFF'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* SVG Engine Cross Section Schematic */}
        <div className="lg:col-span-8 bg-slate-950 rounded-xl p-4 relative overflow-hidden border border-slate-800 flex items-center justify-center min-h-[340px]">
          {/* Subtle grid background */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
              backgroundSize: '24px 24px',
            }}
          />

          <svg
            viewBox="0 0 720 400"
            className="w-full h-auto max-h-[380px] drop-shadow-md select-none"
          >
            <defs>
              <linearGradient id="crankCaseGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id="thermalGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={getCylinderColor()} stopOpacity="0.85" />
                <stop offset="100%" stopColor="#1e293b" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="oilGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={getOilSystemColor()} stopOpacity="0.7" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.3" />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Central Crankcase Block */}
            <rect
              x="240"
              y="110"
              width="240"
              height="180"
              rx="14"
              fill="url(#crankCaseGrad)"
              stroke="#334155"
              strokeWidth="2"
            />
            <text x="360" y="132" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="monospace">
              CRANKCASE HOUSING
            </text>

            {/* Left Bank: Cylinder 1 & 3 */}
            <g
              id="engine-cylinders-left"
              className="cursor-pointer group"
              onClick={() => setSelectedComponent('cylinder_head')}
            >
              {/* Cylinder 1 (Top Left) */}
              <rect
                x="80"
                y="110"
                width="150"
                height="70"
                rx="6"
                fill={getCylinderColor()}
                fillOpacity={showThermalOverlay ? '0.85' : '0.4'}
                stroke={selectedComponent === 'cylinder_head' ? '#38bdf8' : '#475569'}
                strokeWidth={selectedComponent === 'cylinder_head' ? '3' : '1.5'}
                className="transition-all duration-300"
              />
              {/* Cooling Fins */}
              {[115, 125, 135, 145, 155, 165].map((y) => (
                <line key={y} x1="70" y1={y} x2="80" y2={y} stroke="#94a3b8" strokeWidth="2" />
              ))}
              <text x="145" y="145" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                CYL #1 (CHT: {engineTemp.toFixed(1)}°C)
              </text>
              <text x="145" y="162" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                Piston & Comb. Chamber
              </text>

              {/* Cylinder 3 (Bottom Left) */}
              <rect
                x="80"
                y="200"
                width="150"
                height="70"
                rx="6"
                fill={getCylinderColor()}
                fillOpacity={showThermalOverlay ? '0.85' : '0.4'}
                stroke={selectedComponent === 'cylinder_head' ? '#38bdf8' : '#475569'}
                strokeWidth={selectedComponent === 'cylinder_head' ? '3' : '1.5'}
                className="transition-all duration-300"
              />
              {[205, 215, 225, 235, 245, 255].map((y) => (
                <line key={y} x1="70" y1={y} x2="80" y2={y} stroke="#94a3b8" strokeWidth="2" />
              ))}
              <text x="145" y="235" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                CYL #3 (CHT)
              </text>
              <text x="145" y="252" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                Piston & Comb. Chamber
              </text>
            </g>

            {/* Right Bank: Cylinder 2 & 4 */}
            <g
              id="engine-cylinders-right"
              className="cursor-pointer group"
              onClick={() => setSelectedComponent('cylinder_head')}
            >
              {/* Cylinder 2 (Top Right) */}
              <rect
                x="490"
                y="110"
                width="150"
                height="70"
                rx="6"
                fill={getCylinderColor()}
                fillOpacity={showThermalOverlay ? '0.85' : '0.4'}
                stroke={selectedComponent === 'cylinder_head' ? '#38bdf8' : '#475569'}
                strokeWidth={selectedComponent === 'cylinder_head' ? '3' : '1.5'}
                className="transition-all duration-300"
              />
              {[115, 125, 135, 145, 155, 165].map((y) => (
                <line key={y} x1="640" y1={y} x2="650" y2={y} stroke="#94a3b8" strokeWidth="2" />
              ))}
              <text x="565" y="145" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                CYL #2 (CHT: {engineTemp.toFixed(1)}°C)
              </text>
              <text x="565" y="162" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                Piston & Comb. Chamber
              </text>

              {/* Cylinder 4 (Bottom Right) */}
              <rect
                x="490"
                y="200"
                width="150"
                height="70"
                rx="6"
                fill={getCylinderColor()}
                fillOpacity={showThermalOverlay ? '0.85' : '0.4'}
                stroke={selectedComponent === 'cylinder_head' ? '#38bdf8' : '#475569'}
                strokeWidth={selectedComponent === 'cylinder_head' ? '3' : '1.5'}
                className="transition-all duration-300"
              />
              {[205, 215, 225, 235, 245, 255].map((y) => (
                <line key={y} x1="640" y1={y} x2="650" y2={y} stroke="#94a3b8" strokeWidth="2" />
              ))}
              <text x="565" y="235" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                CYL #4 (CHT)
              </text>
              <text x="565" y="252" textAnchor="middle" fill="#cbd5e1" fontSize="10">
                Piston & Comb. Chamber
              </text>
            </g>

            {/* Central Crankshaft & Main Bearings */}
            <g
              id="engine-crankshaft"
              className="cursor-pointer"
              onClick={() => setSelectedComponent('crankshaft_bearings')}
            >
              {/* Crankshaft Centerline */}
              <rect
                x="260"
                y="185"
                width="200"
                height="30"
                rx="6"
                fill="#334155"
                stroke={selectedComponent === 'crankshaft_bearings' ? '#38bdf8' : '#64748b'}
                strokeWidth={selectedComponent === 'crankshaft_bearings' ? '2.5' : '1.5'}
              />
              {/* Rotating Crank Web Journals */}
              <circle cx="295" cy="200" r="18" fill="#1e293b" stroke="#0284c7" strokeWidth="2" className={getBearingGlow()} />
              <circle cx="360" cy="200" r="22" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" className={getBearingGlow()} />
              <circle cx="425" cy="200" r="18" fill="#1e293b" stroke="#0284c7" strokeWidth="2" className={getBearingGlow()} />

              <text x="360" y="204" textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="bold">
                {rpm.toFixed(0)} RPM
              </text>
              <text x="360" y="238" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                VIB: {vibration.toFixed(2)} mm/s RMS
              </text>
            </g>

            {/* Oil Gallery & Lubrication Sump */}
            <g
              id="engine-lubrication"
              className="cursor-pointer"
              onClick={() => setSelectedComponent('lubrication_system')}
            >
              {/* Lower Oil Pan / Sump */}
              <path
                d="M 270 290 L 450 290 L 430 350 L 290 350 Z"
                fill="url(#oilGrad)"
                stroke={selectedComponent === 'lubrication_system' ? '#38bdf8' : '#0284c7'}
                strokeWidth={selectedComponent === 'lubrication_system' ? '2.5' : '1.5'}
              />
              {/* Oil Feed Pipelines */}
              <path
                d="M 360 330 L 360 260 M 360 260 L 230 260 M 360 260 L 490 260"
                fill="none"
                stroke={getOilSystemColor()}
                strokeWidth="3"
                strokeDasharray="4 3"
              />
              <text x="360" y="325" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">
                OIL SUMP: {oilPress.toFixed(1)} PSI
              </text>
              <text x="360" y="342" textAnchor="middle" fill="#bae6fd" fontSize="9">
                Temp: {oilTemp.toFixed(1)}°C
              </text>
            </g>

            {/* Dual CDI Ignition & Valvetrain Assembly */}
            <g
              id="engine-valvetrain"
              className="cursor-pointer"
              onClick={() => setSelectedComponent('valvetrain_ignition')}
            >
              {/* Top Valvetrain & Turbo manifold */}
              <rect
                x="280"
                y="40"
                width="160"
                height="50"
                rx="8"
                fill="#1e293b"
                stroke={selectedComponent === 'valvetrain_ignition' ? '#38bdf8' : '#475569'}
                strokeWidth={selectedComponent === 'valvetrain_ignition' ? '2.5' : '1.5'}
              />
              {/* Spark Pulse Indicators */}
              <circle cx="330" cy="65" r="8" fill="#eab308" className="animate-ping opacity-75" />
              <circle cx="330" cy="65" r="5" fill="#facc15" />
              <circle cx="390" cy="65" r="8" fill="#eab308" className="animate-ping opacity-75" />
              <circle cx="390" cy="65" r="5" fill="#facc15" />

              <text x="360" y="58" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                DUAL CDI IGNITION
              </text>
              <text x="360" y="78" textAnchor="middle" fill="#94a3b8" fontSize="9">
                MAP: {manifoldPress.toFixed(1)} inHg
              </text>
            </g>

            {/* Status Badges Overlay inside Canvas */}
            <g transform="translate(20, 20)">
              <rect width="180" height="48" rx="6" fill="#0f172a" fillOpacity="0.85" stroke="#334155" />
              <circle
                cx="16"
                cy="24"
                r="6"
                fill={
                  twinState?.engine_health === 'CRITICAL'
                    ? '#ef4444'
                    : twinState?.engine_health === 'WARNING'
                    ? '#f59e0b'
                    : '#10b981'
                }
              />
              <text x="32" y="20" fill="#f8fafc" fontSize="11" fontWeight="bold">
                DIGITAL TWIN TWIN-STATE
              </text>
              <text x="32" y="36" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                HEALTH: {twinState?.health_score ?? 100}% | {twinState?.risk_level ?? 'NORMAL'}
              </text>
            </g>
          </svg>
        </div>

        {/* Component Deep-Dive Inspection Panel */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Subsystem Diagnostics Explorer
          </div>

          {/* Selector Tabs */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setSelectedComponent('cylinder_head')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedComponent === 'cylinder_head'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cylinder Head
            </button>
            <button
              onClick={() => setSelectedComponent('lubrication_system')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedComponent === 'lubrication_system'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lubrication
            </button>
            <button
              onClick={() => setSelectedComponent('crankshaft_bearings')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedComponent === 'crankshaft_bearings'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Crankshaft
            </button>
            <button
              onClick={() => setSelectedComponent('valvetrain_ignition')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedComponent === 'valvetrain_ignition'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Valvetrain & CDI
            </button>
          </div>

          {/* Subsystem Details Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedComponent === 'cylinder_head' && <Flame className="w-4 h-4 text-orange-500" />}
                {selectedComponent === 'lubrication_system' && <Gauge className="w-4 h-4 text-sky-500" />}
                {selectedComponent === 'crankshaft_bearings' && <Gauge className="w-4 h-4 text-indigo-500" />}
                {selectedComponent === 'valvetrain_ignition' && <Zap className="w-4 h-4 text-amber-500" />}
                <span className="font-semibold text-sm text-slate-900 capitalize">
                  {selectedComponent.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold">
                {getStatusIcon(activeCompInfo?.status)}
                <span
                  className={
                    activeCompInfo?.status === 'CRITICAL'
                      ? 'text-rose-600'
                      : activeCompInfo?.status === 'WARNING'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }
                >
                  {activeCompInfo?.status || 'HEALTHY'}
                </span>
              </div>
            </div>

            {/* Health index bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Subsystem Integrity Index</span>
                <span className="font-mono font-bold text-slate-800">
                  {activeCompInfo ? activeCompInfo.index : 100}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (activeCompInfo?.index ?? 100) < 50
                      ? 'bg-rose-500'
                      : (activeCompInfo?.index ?? 100) < 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${activeCompInfo?.index ?? 100}%` }}
                />
              </div>
            </div>

            {/* Specific Physics Metrics */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Telemetry Status:</span>
                <span className="font-mono font-medium text-slate-800">
                  {activeCompInfo?.detail || 'Nominal operation'}
                </span>
              </div>

              {selectedComponent === 'cylinder_head' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">CHT Temperature:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {engineTemp.toFixed(1)} °C
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Thermal Rate:</span>
                    <span className="font-mono text-slate-700">
                      {telemetry?.temperature_rate !== undefined
                        ? `${telemetry.temperature_rate >= 0 ? '+' : ''}${telemetry.temperature_rate.toFixed(2)} °C/s`
                        : '0.00 °C/s'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Safety Limit:</span>
                    <span className="font-mono text-slate-500">105.0 °C (Warning: 94.0 °C)</span>
                  </div>
                </>
              )}

              {selectedComponent === 'lubrication_system' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Oil Line Pressure:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {oilPress.toFixed(1)} PSI
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Oil Sump Temp:</span>
                    <span className="font-mono text-slate-700">{oilTemp.toFixed(1)} °C</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Pressure Rate:</span>
                    <span className="font-mono text-slate-700">
                      {telemetry?.oil_pressure_rate !== undefined
                        ? `${telemetry.oil_pressure_rate >= 0 ? '+' : ''}${telemetry.oil_pressure_rate.toFixed(2)} PSI/s`
                        : '0.00 PSI/s'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Minimum Operational Limit:</span>
                    <span className="font-mono text-slate-500">25.0 PSI (Warning: 38.0 PSI)</span>
                  </div>
                </>
              )}

              {selectedComponent === 'crankshaft_bearings' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">RMS Vibration:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {vibration.toFixed(2)} mm/s
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Vibration Rate:</span>
                    <span className="font-mono text-slate-700">
                      {telemetry?.vibration_rate !== undefined
                        ? `${telemetry.vibration_rate >= 0 ? '+' : ''}${telemetry.vibration_rate.toFixed(2)} mm/s²`
                        : '0.00 mm/s²'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Vibration Limit:</span>
                    <span className="font-mono text-slate-500">6.0 mm/s (Warning: 3.5 mm/s)</span>
                  </div>
                </>
              )}

              {selectedComponent === 'valvetrain_ignition' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Engine Speed:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {rpm.toFixed(0)} RPM
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">RPM Delta Rate:</span>
                    <span className="font-mono text-slate-700">
                      {telemetry?.rpm_variation !== undefined
                        ? `±${telemetry.rpm_variation.toFixed(1)} RPM/s`
                        : '0.0 RPM/s'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Manifold Pressure:</span>
                    <span className="font-mono text-slate-700">{manifoldPress.toFixed(1)} inHg</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Operating Band:</span>
                    <span className="font-mono text-slate-500">2100 - 2850 RPM (Redline: 2950)</span>
                  </div>
                </>
              )}
            </div>

            {/* Quick Prognostic Summary */}
            <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-100 p-2.5 rounded-lg">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span>
                Digital Twin state updates every second via physics-calibrated state estimation
                and rate-of-change derivative analysis.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
