import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  HelpCircle,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  BrainCircuit,
  Activity,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { DigitalTwinState, TelemetryRecord } from '../types';
import { evaluateDecisionSupport } from '../utils/decisionSupport';

interface ExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  twinState: DigitalTwinState | null;
  history: TelemetryRecord[];
}

export const ExplainabilityModal: React.FC<ExplainabilityModalProps> = ({
  isOpen,
  onClose,
  twinState,
  history,
}) => {
  if (!isOpen) return null;

  const telemetry = twinState?.current_telemetry;
  const ds = evaluateDecisionSupport(
    telemetry || ({} as TelemetryRecord),
    history,
    twinState?.decision_support
  );

  const [activeTab, setActiveTab] = useState<'EIGHT_POINT' | 'TIMELINE' | 'EVIDENCE' | 'SAFETY'>('EIGHT_POINT');

  const assessment = ds.eight_point_assessment;
  const state = ds.prediction_state;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Explainable Decision-Support &amp; Early-Warning Analysis
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  SIH26054 Architecture
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Aerospace-grade 8-point inquiry, trend verification, and timeline validation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Condition Summary Bar */}
        <div className="bg-indigo-950 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-300">PREDICTION STATE:</span>
            <span
              className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                state === 'CRITICAL'
                  ? 'bg-rose-500 text-white'
                  : state === 'HIGH_RISK'
                  ? 'bg-rose-600 text-white'
                  : state === 'EARLY_WARNING'
                  ? 'bg-amber-500 text-white'
                  : state === 'WATCH'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              {state.replace(/_/g, ' ')}
            </span>
            <span className="font-semibold text-slate-200">{ds.probable_condition}</span>
          </div>

          <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px]">
            <span>Trend: <strong className="text-white">{ds.trend}</strong></span>
            <span>Horizon: <strong className="text-white">{ds.risk_horizon.replace(/_/g, ' ')}</strong></span>
            <span>Confidence: <strong className="text-emerald-400">{(ds.confidence * 100).toFixed(1)}%</strong></span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-4 px-6 border-b border-slate-200 text-xs font-semibold bg-white">
          <button
            onClick={() => setActiveTab('EIGHT_POINT')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'EIGHT_POINT'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            1. Aerospace 8-Point Assessment
          </button>
          <button
            onClick={() => setActiveTab('TIMELINE')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'TIMELINE'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            2. Prediction Timeline Validation
          </button>
          <button
            onClick={() => setActiveTab('EVIDENCE')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'EVIDENCE'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            3. Multi-Parameter Evidence
          </button>
          <button
            onClick={() => setActiveTab('SAFETY')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'SAFETY'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            4. Safety &amp; Honesty Disclaimers
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: 8-POINT STRUCTURED AEROSPACE ASSESSMENT */}
          {activeTab === 'EIGHT_POINT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. What is happening? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">1</span>
                    <span>WHAT IS HAPPENING?</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.what_is_happening}
                  </p>
                </div>

                {/* 2. What is likely causing it? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">2</span>
                    <span>WHAT IS LIKELY CAUSING IT?</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.what_is_likely_causing_it}
                  </p>
                </div>

                {/* 3. Why does the system think this? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 md:col-span-2">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">3</span>
                    <span>WHY DOES THE SYSTEM THINK THIS? (EXPLAINABLE EVIDENCE)</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {assessment.why_does_system_think_this.map((why, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span>{why}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. How serious is it? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">4</span>
                    <span>HOW SERIOUS IS IT?</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.how_serious_is_it}
                  </p>
                  <div className="mt-2 text-[11px] font-mono text-slate-500">
                    Severity Rating: <strong>{ds.severity}</strong> &bull; Horizon: <strong>{ds.risk_horizon}</strong>
                  </div>
                </div>

                {/* 5. Is the trend getting worse? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">5</span>
                    <span>IS THE TREND GETTING WORSE?</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.is_trend_getting_worse}
                  </p>
                </div>

                {/* 6. What could happen if it continues? */}
                <div className="bg-amber-50/80 rounded-xl p-4 border border-amber-200 md:col-span-2">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center text-[10px] text-amber-900">6</span>
                    <span>WHAT COULD HAPPEN IF IT CONTINUES? ("IF UNADDRESSED")</span>
                  </div>
                  <p className="text-xs text-amber-950 font-medium leading-relaxed">
                    {assessment.what_could_happen_if_continues}
                  </p>
                  <p className="text-[10px] text-amber-700 mt-2 italic">
                    Note: Predictions are probabilistic ("may", "could", "possible risk") and depend on model calibration and environmental variables.
                  </p>
                </div>

                {/* 7. What approved procedure should be referenced? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">7</span>
                    <span>WHAT APPROVED PROCEDURE SHOULD BE REFERENCED?</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.what_approved_procedure_should_be_referenced}
                  </p>
                  <div className="mt-2 p-2 bg-white rounded border border-slate-200 text-[11px] font-mono text-slate-600">
                    <div>Reference: {ds.procedure_reference}</div>
                    <div className="text-amber-700 font-bold mt-0.5">Status: {ds.procedure_status}</div>
                    <div className="text-slate-400 mt-0.5">Source: {ds.procedure_source}</div>
                  </div>
                </div>

                {/* 8. What should the system monitor next? */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase mb-1">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[10px]">8</span>
                    <span>WHAT SHOULD THE SYSTEM MONITOR NEXT? (AFTER-ACTION)</span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {assessment.what_should_system_monitor_next}
                  </p>
                  <div className="mt-2 text-[11px] text-slate-500">
                    The health prognostics loop continues active tracking to assess stabilization or recovery.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PREDICTION TIMELINE VALIDATION */}
          {activeTab === 'TIMELINE' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-950">
                <div className="font-bold flex items-center gap-2 mb-1 text-sm">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>Early-Warning Lead Time Validation: [Prediction Time &lt; Fault Time]</span>
                </div>
                <p className="leading-relaxed">
                  Demonstrates that the rate-derivative and moving-window prognostics layer detected the developing condition
                  <strong> before</strong> the simulated telemetry breached critical abnormal thresholds.
                </p>
                <div className="mt-2 font-mono text-[11px] text-indigo-800 bg-white/80 p-2 rounded border border-indigo-200">
                  SYNTHETIC SIMULATION VALIDATION &bull; Prototype testing benchmark (Not certified aircraft flight data)
                </div>
              </div>

              {/* Timeline Items */}
              <div className="relative border-l-2 border-slate-200 ml-4 pl-4 space-y-4 text-xs">
                {ds.timeline && ds.timeline.length > 0 ? (
                  ds.timeline.map((evt, idx) => {
                    const timeStr = new Date(evt.timestamp).toLocaleTimeString();
                    return (
                      <div key={idx} className="relative">
                        {/* Dot */}
                        <div
                          className={`absolute -left-[23px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            evt.state === 'CRITICAL'
                              ? 'bg-rose-500'
                              : evt.state === 'HIGH_RISK'
                              ? 'bg-rose-400'
                              : evt.state === 'EARLY_WARNING'
                              ? 'bg-amber-500'
                              : evt.state === 'WATCH'
                              ? 'bg-amber-300'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold font-mono text-xs">
                              {evt.state.replace(/_/g, ' ')}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">{timeStr}</span>
                          </div>
                          <p className="text-slate-700">{evt.note}</p>
                          {evt.lead_time_seconds !== undefined && (
                            <div className="mt-1 font-mono text-[11px] text-indigo-700 font-bold">
                              Early Warning Lead Time: ~{evt.lead_time_seconds}s before simulated critical breach
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-slate-500">Timeline events initializing...</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MULTI-PARAMETER EVIDENCE */}
          {activeTab === 'EVIDENCE' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600">
                Multi-sensor cross-correlation ensures the system does not diagnose faults based on a single sensor reading alone.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ds.evidence.map((ev) => (
                  <div key={ev.parameter} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 text-xs">{ev.parameter}</span>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {ev.current_value.toFixed(1)} {ev.unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-200 my-2 text-[10px] font-mono text-slate-600">
                      <div>
                        <span className="text-slate-400 block">Derivative</span>
                        <span className="font-bold">
                          {ev.rate > 0 ? '+' : ''}{ev.rate.toFixed(2)}/s
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Window Mean</span>
                        <span className="font-bold">{ev.moving_avg}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Std Dev</span>
                        <span className="font-bold">{ev.std_dev}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600">
                      <strong>Observation:</strong> {ev.observation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SAFETY & HONESTY REQUIREMENTS */}
          {activeTab === 'SAFETY' && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-amber-950">
                <div className="font-bold text-sm flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>MANDATORY AEROSPACE SAFETY &amp; HONESTY DECLARATIONS</span>
                </div>
                <p>
                  As an engineering decision-support prototype developed under Smart India Hackathon (SIH26054 / DRDO),
                  the following strict design boundaries are enforced:
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block mb-0.5">1. Synthetic Telemetry:</strong>
                  This prototype uses synthetic/simulated telemetry data for demonstration and development. The generated values are not official DRDO data.
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block mb-0.5">2. Demo Thresholds:</strong>
                  The simulated thresholds and rate margins are not certified aircraft operating limits.
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block mb-0.5">3. Probabilistic Estimates:</strong>
                  Predictions are prototype estimates and are not certified flight-safety predictions or guaranteed remaining flight times.
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block mb-0.5">4. Pilot-in-Command Primacy:</strong>
                  The system is a decision-support prototype and does not replace qualified pilots, maintenance engineers, aircraft-specific approved procedures (AFM/POH/QRH), or certification requirements.
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block mb-0.5">5. No Uncertified Flight Commands:</strong>
                  The system does not issue flight-control or engine-governor commands.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>AeroTwin SIH26054 &bull; Explainable Prognostics Layer</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold transition-colors cursor-pointer"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};
