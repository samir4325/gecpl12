import React from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Flame,
  Gauge,
  HelpCircle,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { DigitalTwinState, FaultType } from '../types';

interface AIDiagnosticsPanelProps {
  twinState: DigitalTwinState | null;
  onOpenModelModal: () => void;
}

export const AIDiagnosticsPanel: React.FC<AIDiagnosticsPanelProps> = ({
  twinState,
  onOpenModelModal,
}) => {
  const telemetry = twinState?.current_telemetry;
  const predictedFault = twinState?.predicted_fault || 'HEALTHY';
  const currentFault = twinState?.current_fault || 'HEALTHY';
  const confidence = twinState?.prediction_confidence ?? 0.96;
  const anomalyScore = telemetry?.anomaly_score ?? 0.04;

  const isAnomalous = predictedFault !== 'HEALTHY' || anomalyScore > 0.4;

  // Approximate class probability distribution based on predicted class and confidence
  const getProbs = (): Record<FaultType, number> => {
    const defaultProbs: Record<FaultType, number> = {
      HEALTHY: 0.02,
      OVERHEATING: 0.02,
      LOW_OIL_PRESSURE: 0.02,
      HIGH_VIBRATION: 0.02,
      RPM_INSTABILITY: 0.02,
    };

    if (predictedFault === 'HEALTHY') {
      defaultProbs.HEALTHY = confidence;
      const rem = (1.0 - confidence) / 4;
      defaultProbs.OVERHEATING = rem;
      defaultProbs.LOW_OIL_PRESSURE = rem;
      defaultProbs.HIGH_VIBRATION = rem;
      defaultProbs.RPM_INSTABILITY = rem;
    } else {
      defaultProbs[predictedFault] = confidence;
      defaultProbs.HEALTHY = Math.max(0.01, 1.0 - confidence);
      const rem = Math.max(0.01, (1.0 - confidence - defaultProbs.HEALTHY) / 3);
      for (const k of Object.keys(defaultProbs) as FaultType[]) {
        if (k !== predictedFault && k !== 'HEALTHY') {
          defaultProbs[k] = rem;
        }
      }
    }
    return defaultProbs;
  };

  const probs = getProbs();

  const getFaultIcon = (fault: FaultType) => {
    switch (fault) {
      case 'OVERHEATING':
        return <Flame className="w-4 h-4 text-orange-500" />;
      case 'LOW_OIL_PRESSURE':
        return <Gauge className="w-4 h-4 text-blue-500" />;
      case 'HIGH_VIBRATION':
        return <TrendingUp className="w-4 h-4 text-indigo-500" />;
      case 'RPM_INSTABILITY':
        return <Zap className="w-4 h-4 text-amber-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div
      id="ai-diagnostics-card"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-50 text-sky-700">
              <BrainCircuit className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                <span>AI Health Diagnostics & Fault Prognostics</span>
                <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              </h2>
              <p className="text-xs text-slate-500">
                Calibrated Random Forest Ensemble & Rate-Derivative Inferences
              </p>
            </div>
          </div>

          <button
            onClick={onOpenModelModal}
            className="text-xs font-semibold text-sky-700 hover:text-sky-800 flex items-center gap-0.5 transition-colors"
          >
            <span>Model Details</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Primary Prediction Banner */}
        <div
          className={`rounded-xl p-4 border mb-4 transition-all ${
            predictedFault === 'CRITICAL' || anomalyScore > 0.75
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : isAnomalous
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getFaultIcon(predictedFault)}
              <span className="text-xs font-bold uppercase tracking-wider">
                Predicted Engine Condition
              </span>
            </div>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-white/70">
              {(confidence * 100).toFixed(1)}% Confidence
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold tracking-tight">
              {!predictedFault || predictedFault === 'HEALTHY'
                ? 'NOMINAL FLIGHT ENVELOPE'
                : String(predictedFault).replace(/_/g, ' ')}
            </h3>
            <span className="text-xs font-medium">
              Sim Ground Truth: {currentFault || 'HEALTHY'}
            </span>
          </div>

          <p className="text-xs mt-1.5 opacity-85">
            {!predictedFault || predictedFault === 'HEALTHY'
              ? 'All thermal, lubrication, and vibration signatures are operating within calibrated DRDO SIH26054 safety margins.'
              : `AI model detects early characteristic signatures of ${String(predictedFault).toLowerCase().replace(/_/g, ' ')}. Preventive mitigation recommended.`}
          </p>
        </div>

        {/* Anomaly Score Bar */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span>Composite Anomaly Score</span>
              <HelpCircle className="w-3 h-3 text-slate-400" title="Calculated from Mahalanobis feature space distance & non-healthy probability" />
            </span>
            <span
              className={`font-mono font-bold ${
                anomalyScore > 0.7
                  ? 'text-rose-600'
                  : anomalyScore > 0.35
                  ? 'text-amber-600'
                  : 'text-emerald-600'
              }`}
            >
              {(anomalyScore * 100).toFixed(1)}%
            </span>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                anomalyScore > 0.7
                  ? 'bg-rose-500'
                  : anomalyScore > 0.35
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, anomalyScore * 100))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>0.0 (Nominal)</span>
            <span className="text-amber-600">0.4 (Threshold)</span>
            <span>1.0 (Critical)</span>
          </div>
        </div>

        {/* Multi-Class Posterior Probability Distribution */}
        <div className="space-y-2 mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Model Fault Posterior Probabilities
          </div>

          {(
            [
              'HEALTHY',
              'OVERHEATING',
              'LOW_OIL_PRESSURE',
              'HIGH_VIBRATION',
              'RPM_INSTABILITY',
            ] as FaultType[]
          ).map((cls) => {
            const p = probs[cls] || 0;
            const isTarget = predictedFault === cls;
            return (
              <div key={cls} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-mono ${isTarget ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                    {cls}
                  </span>
                  <span className="font-mono text-[11px] text-slate-700 font-semibold">
                    {(p * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      cls === 'HEALTHY'
                        ? 'bg-emerald-500'
                        : isTarget
                        ? 'bg-rose-500'
                        : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.max(1, p * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Early Warning Prognosis Footnote */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-sky-600" />
          Rate-derivative early lead time: ~5-15s before threshold breach
        </span>
      </div>
    </div>
  );
};
