import { useEffect, useState } from 'react';
import {
  Circle,
  Trophy,
  Activity,
  Rocket,
  Check,
} from 'lucide-react';
import type { ReadinessScore } from '../../hooks/useReadinessScore';
import { api } from '../../lib/api-client';

interface ActivationTimelineProps {
  data: ReadinessScore;
}

export function ActivationTimeline({ data }: ActivationTimelineProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'achievements'>('achievements');

  // Telemetria inteligente baseada em LocalStorage (evita floods em re-renders)
  useEffect(() => {
    try {
      const STORAGE_KEY = 'telemetry_unlocked_achievements';
      const rawStored = localStorage.getItem(STORAGE_KEY) || '[]';
      const storedAchievements: string[] = JSON.parse(rawStored);

      let hasNewUnlocks = false;
      const newUnlocks: string[] = [];

      data.achievements.forEach((ach) => {
        if (ach.unlocked && !storedAchievements.includes(ach.key)) {
          hasNewUnlocks = true;
          newUnlocks.push(ach.key);
          storedAchievements.push(ach.key);

          // Disparar telemetria de destrancamento
          void api.post('/tenant/telemetry', {
            event: 'achievement_unlocked',
            payload: { achievement: ach.key },
          }).catch(() => {});
        }
      });

      if (hasNewUnlocks) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storedAchievements));
      }

      // Telemetria quando fica pronto
      if (data.canActivate) {
        const READY_KEY = 'telemetry_store_ready_fired';
        if (localStorage.getItem(READY_KEY) !== 'true') {
          localStorage.setItem(READY_KEY, 'true');
          void api.post('/tenant/telemetry', {
            event: 'store_ready',
            payload: { score: data.score },
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignorar erros de storage silenciados
    }
  }, [data]);

  const { timeline, achievements, canActivate } = data;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
      {/* HEADER TABS */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('achievements')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 px-2 text-sm font-bold transition-colors ${
            activeTab === 'achievements'
              ? 'text-amber-500 border-b-2 border-amber-500'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Conquistas
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 flex items-center justify-center gap-2 py-4 px-2 text-sm font-bold transition-colors ${
            activeTab === 'timeline'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          Evolução da Loja
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        {/* QUICK WIN BANNER */}
        {canActivate && (
          <div className="mb-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-1 shadow-lg shadow-emerald-500/20">
            <div className="bg-emerald-50 dark:bg-slate-900 rounded-lg p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
                <Rocket className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-emerald-900 dark:text-emerald-100 font-black">
                  🎉 Sua loja está pronta para operar!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Você cumpriu todos os requisitos mínimos para vender.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ACHIEVEMENTS TAB */}
        {activeTab === 'achievements' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {achievements.map((ach) => (
              <div
                key={ach.key}
                className={`relative overflow-hidden rounded-xl border p-4 transition-all ${
                  ach.unlocked
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex gap-3 relative z-10">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      ach.unlocked
                        ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                    }`}
                  >
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4
                        className={`text-sm font-black truncate ${
                          ach.unlocked
                            ? 'text-amber-900 dark:text-amber-100'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {ach.title}
                      </h4>
                      {ach.max !== undefined && (
                        <span
                          className={`text-xs font-bold ${
                            ach.unlocked ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {ach.progress}/{ach.max}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                      {ach.description}
                    </p>
                  </div>
                </div>

                {/* Progress Bar (if applicable) */}
                {ach.max !== undefined && !ach.unlocked && (
                  <div className="mt-3 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                      style={{ width: `${(ach.progress! / ach.max) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="relative pl-6">
            {/* Linha vertical */}
            <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800" />

            <div className="space-y-6">
              {timeline.map((item) => {
                return (
                  <div key={item.key} className="relative flex items-start gap-4">
                    {/* Indicador */}
                    <div
                      className={`absolute -left-[31px] w-6 h-6 rounded-full flex items-center justify-center bg-white dark:bg-slate-900 border-2 transition-colors ${
                        item.completed
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/20'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {item.completed ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>

                    <div className="flex-1 pb-1">
                      <div
                        className={`text-sm font-bold ${
                          item.completed
                            ? 'text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.label}
                      </div>
                      {item.date && (
                        <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-medium">
                          {new Date(item.date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
