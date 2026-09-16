import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Filter,
  Info,
  Trash2,
} from 'lucide-react';
import { Alert } from '../types';

interface AlertFeedProps {
  alerts: Alert[];
  onAcknowledgeAlert?: (id: number) => void;
  onClearAlerts?: () => void;
}

export const AlertFeed: React.FC<AlertFeedProps> = ({
  alerts,
  onAcknowledgeAlert,
  onClearAlerts,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');

  const filteredAlerts = (alerts || []).filter((a) => {
    if (!a) return false;
    if (filterSeverity === 'ALL') return true;
    return a.severity === filterSeverity;
  });

  const criticalCount = (alerts || []).filter((a) => a && a.severity === 'CRITICAL').length;
  const warningCount = (alerts || []).filter((a) => a && a.severity === 'WARNING').length;

  return (
    <div
      id="aerotwin-alert-feed"
      className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col h-full max-h-[500px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-rose-50 text-rose-700">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Prognostics & Alarm Feed</span>
              {alerts.length > 0 && (
                <span className="px-2 py-0.2 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 font-mono">
                  {alerts.length}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Derivative rate warnings, threshold exceedances, and AI early alerts
            </p>
          </div>
        </div>

        {/* Clear alerts */}
        {alerts.length > 0 && onClearAlerts && (
          <button
            onClick={onClearAlerts}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            title="Clear all alerts"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 mb-3 text-xs">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <button
          onClick={() => setFilterSeverity('ALL')}
          className={`px-2.5 py-1 rounded-md font-medium transition-all ${
            filterSeverity === 'ALL'
              ? 'bg-slate-900 text-white font-semibold'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All ({alerts.length})
        </button>
        <button
          onClick={() => setFilterSeverity('CRITICAL')}
          className={`px-2.5 py-1 rounded-md font-medium transition-all ${
            filterSeverity === 'CRITICAL'
              ? 'bg-rose-600 text-white font-semibold'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
          }`}
        >
          Critical ({criticalCount})
        </button>
        <button
          onClick={() => setFilterSeverity('WARNING')}
          className={`px-2.5 py-1 rounded-md font-medium transition-all ${
            filterSeverity === 'WARNING'
              ? 'bg-amber-500 text-white font-semibold'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          Warnings ({warningCount})
        </button>
      </div>

      {/* Alert List Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredAlerts.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-slate-400">
            <CheckCheck className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-xs font-semibold text-slate-700">All Systems Nominal</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              No active warnings or threshold exceedances registered.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const isCritical = alert.severity === 'CRITICAL';
            const date = alert.timestamp ? new Date(alert.timestamp) : new Date();
            const timeStr = isNaN(date.getTime())
              ? 'Now'
              : date.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' });

            const alertTitle = String(alert.type || alert.parameter || 'SYSTEM_ALERT').replace(/_/g, ' ');

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border text-xs transition-all ${
                  isCritical
                    ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                    : 'bg-amber-50/60 border-amber-200 text-amber-950'
                } ${alert.acknowledged ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {isCritical ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs">{alertTitle}</span>
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-bold ${
                            isCritical
                              ? 'bg-rose-200 text-rose-800'
                              : 'bg-amber-200 text-amber-800'
                          }`}
                        >
                          {alert.severity || 'WARNING'}
                        </span>
                      </div>
                      <p className="text-xs mt-1 text-slate-700">{alert.message || 'Anomaly detected'}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-slate-500">
                        <span>Time: {timeStr}</span>
                        {alert.parameter && (
                          <span>
                            {alert.parameter}: {alert.value} {alert.threshold !== undefined ? `(Limit: ${alert.threshold})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acknowledge button */}
                  {onAcknowledgeAlert && !alert.acknowledged && (
                    <button
                      onClick={() => onAcknowledgeAlert(alert.id)}
                      className="p-1 rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors shrink-0"
                      title="Acknowledge alert"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
