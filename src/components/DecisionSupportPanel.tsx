import React, { useState } from 'react';
import {
  ShieldAlert,
  HelpCircle,
  Activity,
  FileText,
  AlertTriangle,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
  CheckCircle2,
  Sparkles,
  Layers,
  ArrowRight,
  Zap,
  Check,
  Loader2,
  CheckSquare,
} from 'lucide-react';
import { DigitalTwinState, TelemetryRecord } from '../types';
import { evaluateDecisionSupport } from '../utils/decisionSupport';
import { audioNotifier } from '../utils/audio';

interface DecisionSupportPanelProps {
  twinState: DigitalTwinState | null;
  history: TelemetryRecord[];
  onOpenExplainabilityModal: () => void;
}

export const DecisionSupportPanel: React.FC<DecisionSupportPanelProps> = ({
  twinState,
  history,
  onOpenExplainabilityModal,
}) => {
  const telemetry = twinState?.current_telemetry;
  const ds = evaluateDecisionSupport(
    telemetry || ({} as TelemetryRecord),
    history,
    twinState?.decision_support
  );

  const [activeTab, setActiveTab] = useState<'CHECKLIST' | 'OVERVIEW' | 'TREND' | 'EVIDENCE'>('CHECKLIST');
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const state = ds.prediction_state;
  const isAbnormal = state !== 'NORMAL';

  const handleExecutePilotAction = async () => {
    setIsExecutingAction(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/simulation/execute-pilot-action', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(data.action || 'Checklist executed! Engine recovering.');
        audioNotifier.speakCallout('Pilot action confirmed. Engine stabilizing.');
        setTimeout(() => setActionFeedback(null), 7000);
      } else {
        setActionFeedback('Action command failed.');
      }
    } catch {
      setActionFeedback('Failed to execute pilot action.');
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Determine badge colors based on prediction state
  const getStateBadgeStyle = () => {
    switch (state) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse';
      case 'HIGH_RISK':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'EARLY_WARNING':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'WATCH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  const getTrendIcon = () => {
    switch (ds.trend) {
      case 'DETERIORATING':
        return <TrendingDown className="w-3.5 h-3.5 text-rose-600 inline mr-1" />;
      case 'RECOVERING':
        return <TrendingUp className="w-3.5 h-3.5 text-emerald-600 inline mr-1" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-slate-500 inline mr-1" />;
    }
  };

  // Recent 15 data points for mini sparkline trend
  const recent15 = history.slice(-15);
  const relevantParam =
    state === 'NORMAL'
      ? 'engine_temperature'
      : ds.probable_condition.toLowerCase().includes('oil')
      ? 'oil_pressure'
      : ds.probable_condition.toLowerCase().includes('vib')
      ? 'vibration'
      : ds.probable_condition.toLowerCase().includes('rpm')
      ? 'rpm'
      : 'engine_temperature';

  const paramValues = recent15.map((r) => r[relevantParam as keyof TelemetryRecord] as number).filter((v) => typeof v === 'number');
  const minVal = paramValues.length > 0 ? Math.min(...paramValues) : 0;
  const maxVal = paramValues.length > 0 ? Math.max(...paramValues) : 100;
  const range = Math.max(0.001, maxVal - minVal);

  const sparklinePoints = paramValues
    .map((val, idx) => {
      const x = (idx / Math.max(1, paramValues.length - 1)) * 180;
      const y = 42 - ((val - minVal) / range) * 36;
      return `${x},${y}`;
    })
    .join(' ');

  const checklist = ds.pilot_checklist || [];

  return (
    <div
      id="engine-decision-support-card"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
    >
      <div>
        {/* Header with Title and Quick Link */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                state === 'CRITICAL' || state === 'HIGH_RISK'
                  ? 'bg-rose-100 text-rose-700'
                  : state === 'EARLY_WARNING'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  PILOT DECISION SUPPORT
                </h2>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-semibold">
                  Direct Action Mode
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Actionable 1-2-3 Checklists &bull; Predictive Diagnostics
              </p>
            </div>
          </div>

          <button
            onClick={onOpenExplainabilityModal}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 transition-colors cursor-pointer"
          >
            <span>8-Point Analysis</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status Callout Banner */}
        <div
          className={`rounded-xl p-3.5 border mb-3.5 transition-all ${
            state === 'CRITICAL' || state === 'HIGH_RISK'
              ? 'bg-rose-50 border-rose-200'
              : state === 'EARLY_WARNING'
              ? 'bg-amber-50 border-amber-200'
              : state === 'WATCH'
              ? 'bg-amber-50/60 border-amber-200/80'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-slate-600">STATUS:</span>
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${getStateBadgeStyle()}`}
              >
                {state.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
              <span>Horizon:</span>
              <span className="font-semibold text-slate-900 capitalize">
                {ds.risk_horizon.toLowerCase().replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-slate-700 min-w-[120px]">CONDITION:</span>
              <span className="font-bold text-slate-900 text-sm">{ds.probable_condition}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="font-bold text-slate-700 min-w-[120px]">QUICK SOLUTION:</span>
              <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                {ds.quick_solution || 'CONTINUE NOMINAL SCAN'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 border-b border-slate-200 mb-3 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('CHECKLIST')}
            className={`pb-2 px-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              activeTab === 'CHECKLIST'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Pilot Checklist</span>
          </button>
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`pb-2 px-2 font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'OVERVIEW'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Why &amp; Consequence
          </button>
          <button
            onClick={() => setActiveTab('TREND')}
            className={`pb-2 px-2 font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'TREND'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Telemetry Trajectory
          </button>
          <button
            onClick={() => setActiveTab('EVIDENCE')}
            className={`pb-2 px-2 font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'EVIDENCE'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Coupled Parameters
          </button>
        </div>

        {/* Tab 0: DIRECT PILOT ACTION CHECKLIST (1-2-3 Steps) */}
        {activeTab === 'CHECKLIST' && (
          <div className="space-y-3 text-xs">
            <div className="space-y-2">
              {checklist.map((step) => (
                <div
                  key={step.step}
                  className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${
                    step.critical
                      ? 'bg-rose-50 border-rose-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                      step.critical
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {step.step}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">
                        {step.item}
                      </span>
                      {step.critical && (
                        <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded">
                          CRITICAL
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-0.5">
                      {step.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive Pilot Action Button */}
            {isAbnormal && (
              <div className="pt-2">
                <button
                  onClick={handleExecutePilotAction}
                  disabled={isExecutingAction}
                  className="w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isExecutingAction ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Executing Pilot Recovery...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-current text-amber-400" />
                      <span>Simulate Pilot Action (Demo Recovery)</span>
                    </>
                  )}
                </button>

                {actionFeedback && (
                  <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center gap-1.5 font-medium animate-fadeIn">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{actionFeedback}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 1: WHY THIS ALERT & IF UNADDRESSED */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-3 text-xs">
            <div>
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>WHY THIS PREDICTION?</span>
              </div>
              <ul className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-700">
                {ds.why_reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>IF UNADDRESSED:</span>
              </div>
              <p className="bg-amber-50/70 border border-amber-200 text-amber-900 p-2.5 rounded-lg text-xs leading-relaxed">
                {ds.if_unaddressed}
              </p>
            </div>

            <div>
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-600" />
                <span>RESPONSE GUIDANCE &amp; PROCEDURE:</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-700 space-y-1">
                <p className="font-medium text-slate-900">{ds.response_guidance}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/80 font-mono">
                  <span>Ref: {ds.procedure_reference}</span>
                  <span className="text-amber-700 font-semibold bg-amber-100/60 px-1.5 py-0.2 rounded">
                    {ds.procedure_status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: TREND GRAPH & RATE DERIVATIVE */}
        {activeTab === 'TREND' && (
          <div className="space-y-3 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Recent Trend: {relevantParam.replace(/_/g, ' ').toUpperCase()}
                </span>
                <span className="font-mono text-slate-600 font-bold">
                  {paramValues.length > 0 ? paramValues[paramValues.length - 1].toFixed(1) : '--'}{' '}
                  {relevantParam.includes('temp')
                    ? '°C'
                    : relevantParam.includes('press')
                    ? 'PSI'
                    : relevantParam.includes('vib')
                    ? 'mm/s'
                    : 'RPM'}
                </span>
              </div>

              {/* SVG Sparkline */}
              <div className="h-14 w-full bg-white border border-slate-200 rounded flex items-center justify-center relative overflow-hidden px-2">
                <svg className="w-full h-full" viewBox="0 0 180 44" preserveAspectRatio="none">
                  {/* Baseline grid */}
                  <line x1="0" y1="22" x2="180" y2="22" stroke="#e2e8f0" strokeDasharray="3,3" />
                  {sparklinePoints && (
                    <polyline
                      fill="none"
                      stroke={state === 'CRITICAL' || state === 'HIGH_RISK' ? '#e11d48' : state === 'EARLY_WARNING' ? '#d97706' : '#059669'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={sparklinePoints}
                    />
                  )}
                </svg>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                <span>T - 15 sec</span>
                <span>Moving Window (1 Hz)</span>
                <span>Current</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block">Rate of Change (d/dt):</span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {telemetry
                    ? relevantParam === 'engine_temperature'
                      ? `${telemetry.temperature_rate > 0 ? '+' : ''}${telemetry.temperature_rate.toFixed(2)} °C/s`
                      : relevantParam === 'oil_pressure'
                      ? `${telemetry.oil_pressure_rate.toFixed(2)} PSI/s`
                      : relevantParam === 'vibration'
                      ? `${telemetry.vibration_rate > 0 ? '+' : ''}${telemetry.vibration_rate.toFixed(2)} mm/s²`
                      : `${telemetry.rpm_variation.toFixed(0)} RPM/s`
                    : '0.00'}
                </span>
              </div>
              <div className="bg-slate-50 p-2 rounded border border-slate-200">
                <span className="text-slate-500 block">Confidence Source:</span>
                <span className="font-semibold text-slate-800 text-xs">
                  {ds.confidence_type === 'ML_MODEL_OUTPUT' ? 'Trained RF Model' : 'Rule-Based Rate'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: MULTI-PARAMETER EVIDENCE */}
        {activeTab === 'EVIDENCE' && (
          <div className="space-y-2 text-xs">
            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
              Multi-Parameter Evidence Matrix
            </div>
            {ds.evidence.map((ev) => (
              <div key={ev.parameter} className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">{ev.parameter}</span>
                  <span className="font-mono font-bold text-slate-900">
                    {ev.current_value.toFixed(1)} {ev.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                  <span>Rate: {ev.rate > 0 ? '+' : ''}{ev.rate.toFixed(2)}/s</span>
                  <span>Normal: {ev.baseline_normal}</span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 italic">
                  {ev.observation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / What System Monitors Next */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
          <span className="font-semibold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
            <span>CONTINUOUS MONITORING:</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400">Closed-Loop</span>
        </div>
        <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
          {ds.monitored_next}
        </p>

        <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Source: {ds.procedure_source}</span>
          <span className="font-mono text-slate-400">SIH26054 Decision Engine</span>
        </div>
      </div>
    </div>
  );
};
