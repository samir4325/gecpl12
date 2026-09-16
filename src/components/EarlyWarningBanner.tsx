import React, { useState } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  Zap,
  Check,
  Loader2,
  Info,
} from 'lucide-react';
import { DigitalTwinState, TelemetryRecord } from '../types';
import { evaluateDecisionSupport } from '../utils/decisionSupport';
import { audioNotifier } from '../utils/audio';

interface EarlyWarningBannerProps {
  twinState: DigitalTwinState | null;
  history: TelemetryRecord[];
  onOpenExplainabilityModal: () => void;
  onSelectFaultMode?: (mode: string) => void;
}

export const EarlyWarningBanner: React.FC<EarlyWarningBannerProps> = ({
  twinState,
  history,
  onOpenExplainabilityModal,
  onSelectFaultMode,
}) => {
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const telemetry = twinState?.current_telemetry;
  const ds = evaluateDecisionSupport(
    telemetry || ({} as TelemetryRecord),
    history,
    twinState?.decision_support
  );

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
        setActionFeedback(data.action || 'Pilot corrective action applied. Engine stabilizing.');
        audioNotifier.speakCallout('Checklist executed. Engine returning to nominal.');
        setTimeout(() => setActionFeedback(null), 6000);
      } else {
        setActionFeedback('Action command failed. Please check engine status.');
      }
    } catch {
      setActionFeedback('Failed to execute pilot action.');
    } finally {
      setIsExecutingAction(false);
    }
  };

  // 1. Nominal State (Clean, calm, simple)
  if (!isAbnormal) {
    return (
      <div
        id="decision-support-nominal-banner"
        className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs"
      >
        <div className="flex items-center gap-2.5 text-slate-900">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs uppercase tracking-wide text-slate-800">
                PROGNOSIS: ALL ENGINES NOMINAL
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Operating within calibrated flight margins &bull; Telemetry derivatives stable
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSelectFaultMode && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onSelectFaultMode('OVERHEATING')}
                className="px-2.5 py-1 rounded text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                title="Inject Overheating fault to test Pilot Action Strip"
              >
                Test Overheat
              </button>
              <button
                onClick={() => onSelectFaultMode('LOW_OIL_PRESSURE')}
                className="px-2.5 py-1 rounded text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                title="Inject Low Oil Pressure fault"
              >
                Test Low Oil
              </button>
            </div>
          )}

          <button
            onClick={onOpenExplainabilityModal}
            className="px-3 py-1 rounded text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
          >
            Engineering Details &rarr;
          </button>
        </div>
      </div>
    );
  }

  // 2. Alert State (Clean, high-contrast, simple — no rainbow neon colors)
  const isCritical = state === 'CRITICAL';
  const isHighRisk = state === 'HIGH_RISK';

  const badgeStyle = isCritical
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : isHighRisk
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

  const borderStyle = isCritical
    ? 'border-rose-300 bg-white'
    : isHighRisk
    ? 'border-rose-200 bg-white'
    : 'border-slate-300 bg-white';

  const checklist = ds.pilot_checklist || [];

  return (
    <div
      id="early-warning-banner"
      className={`rounded-xl border p-4 shadow-xs transition-all ${borderStyle}`}
    >
      {/* Top Header: Clear, clean, scannable */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-semibold font-mono uppercase tracking-wide border ${badgeStyle}`}
            >
              {state.replace(/_/g, ' ')}
            </span>

            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {ds.probable_condition}
            </h2>

            <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
              Trend: {ds.trend.toLowerCase()} &bull; {ds.risk_horizon.toLowerCase().replace(/_/g, ' ')}
            </span>
          </div>

          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="font-semibold text-slate-700">Immediate Action:</span>
            <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {ds.quick_solution || 'EXECUTE CHECKLIST'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="execute-pilot-action-btn"
            onClick={handleExecutePilotAction}
            disabled={isExecutingAction}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isExecutingAction ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
                <span>Execute Pilot Action (Demo Recovery)</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenExplainabilityModal}
            className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-300 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>QRH Details</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Action Feedback Notification */}
      {actionFeedback && (
        <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-sm px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* DIRECT PILOT ACTION CHECKLIST (Clean 1-2-3-4 Cards) */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Direct Pilot Action Steps (POH/QRH):
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {checklist.map((step) => (
            <div
              key={step.step}
              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5"
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
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-900 uppercase truncate">
                    {step.item}
                  </span>
                  {step.critical && (
                    <span className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded">
                      CRITICAL
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 leading-snug font-medium">
                  {step.action}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Muted Sub-footer */}
      <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <Info className="w-3 h-3 text-slate-400" />
          <span>Decision Support Prototype &bull; Reference certified aircraft flight manual</span>
        </span>
        <span className="font-mono text-slate-500">
          Ref: {ds.procedure_reference}
        </span>
      </div>
    </div>
  );
};
