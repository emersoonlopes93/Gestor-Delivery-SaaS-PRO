import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, Copy, Calendar } from 'lucide-react';
import { api } from '../../../lib/api-client';

interface ShiftForm {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

interface Step3Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

const DAY_NAMES_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function Step3Hours({ onNext, onPrev, onMarkValid }: Step3Props) {
  const [hours, setHours] = useState<ShiftForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHours(); }, []);

  useEffect(() => {
    onMarkValid(hours.some(h => h.isOpen));
  }, [hours, onMarkValid]);

  const loadHours = async () => {
    setLoading(true);
    try {
      const res = await api.get<ShiftForm[]>('/tenant/operating-hours');
      if (res.success && res.data.length > 0) {
        setHours(res.data.map(h => ({
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          openTime: h.openTime || '08:00',
          closeTime: h.closeTime || '22:00',
        })));
      } else {
        // Defaults: Mon–Fri open, Sat/Sun closed
        setHours(
          Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            isOpen: i !== 0, // all except sunday
            openTime: '09:00',
            closeTime: '22:00',
          }))
        );
      }
    } catch {
      setHours(Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, isOpen: i !== 0, openTime: '09:00', closeTime: '22:00' })));
    } finally {
      setLoading(false);
    }
  };

  // Group shifts by dayOfWeek for display
  const dayGroups = Array.from({ length: 7 }, (_, day) => ({
    day,
    shifts: hours.map((h, idx) => ({ ...h, idx })).filter(h => h.dayOfWeek === day),
  }));

  const toggleDay = (day: number) => {
    const dayShifts = hours.filter(h => h.dayOfWeek === day);
    if (dayShifts.length === 0) {
      setHours(prev => [...prev, { dayOfWeek: day, isOpen: true, openTime: '09:00', closeTime: '22:00' }]);
    } else {
      setHours(prev => prev.map(h => h.dayOfWeek === day ? { ...h, isOpen: !h.isOpen } : h));
    }
  };

  const updateShift = (idx: number, field: keyof ShiftForm, value: string | boolean) => {
    setHours(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addShift = (day: number) => {
    const count = hours.filter(h => h.dayOfWeek === day).length;
    if (count >= 3) { alert('Máximo de 3 turnos por dia.'); return; }
    setHours(prev => [...prev, { dayOfWeek: day, isOpen: true, openTime: '18:00', closeTime: '23:00' }]);
  };

  const removeShift = (idx: number) => {
    const day = hours[idx].dayOfWeek;
    const count = hours.filter(h => h.dayOfWeek === day).length;
    if (count <= 1) {
      setHours(prev => prev.map((h, i) => i === idx ? { ...h, isOpen: false } : h));
    } else {
      setHours(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const copyToAll = (fromDay: number) => {
    const fromShifts = hours.filter(h => h.dayOfWeek === fromDay);
    if (fromShifts.length === 0) return;
    let newHours = hours.filter(h => h.dayOfWeek === fromDay);
    for (let d = 0; d < 7; d++) {
      if (d === fromDay) continue;
      fromShifts.forEach(s => newHours.push({ ...s, dayOfWeek: d }));
    }
    setHours(newHours);
  };

  const applyWeekdays = (fromDay: number) => {
    const fromShifts = hours.filter(h => h.dayOfWeek === fromDay);
    if (fromShifts.length === 0) return;
    const weekdays = [1, 2, 3, 4, 5];
    let newHours = hours.filter(h => !weekdays.includes(h.dayOfWeek));
    weekdays.forEach(d => fromShifts.forEach(s => newHours.push({ ...s, dayOfWeek: d })));
    setHours(newHours);
  };

  const handleNext = () => {
    if (!hours.some(h => h.isOpen)) {
      alert('Defina pelo menos 1 dia de funcionamento.');
      return;
    }
    onNext(async () => {
      await api.patch('/tenant/operating-hours', { hours });
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 dark:bg-amber-900/40 rounded-2xl mb-3">
          <Clock className="w-7 h-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Horários de Funcionamento</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Quando sua loja estará aberta para pedidos</p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => copyToAll(1)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
        >
          <Copy className="w-3 h-3" /> Copiar Seg → Todos
        </button>
        <button
          onClick={() => applyWeekdays(1)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
        >
          <Calendar className="w-3 h-3" /> Seg-Sex iguais
        </button>
      </div>

      {/* Days */}
      <div className="space-y-2">
        {dayGroups.map(({ day, shifts }) => {
          const isOpen = shifts.some(s => s.isOpen);
          return (
            <div
              key={day}
              className={`rounded-2xl border transition-all ${isOpen ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30'}`}
            >
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDay(day)}
                    className={`relative w-11 h-6 rounded-full transition-all ${isOpen ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isOpen ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <span className={`font-black text-sm ${isOpen ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                    {DAY_NAMES_FULL[day]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isOpen ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                    {isOpen ? 'Aberto' : 'Fechado'}
                  </span>
                </div>
                {isOpen && (
                  <button
                    onClick={() => addShift(day)}
                    className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 font-bold transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Turno
                  </button>
                )}
              </div>

              {isOpen && shifts.filter(s => s.isOpen).map((s) => (
                <div key={s.idx} className="flex items-center gap-3 px-4 pb-4">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={s.openTime}
                      onChange={e => updateShift(s.idx, 'openTime', e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm w-full"
                    />
                    <span className="text-slate-400 text-xs font-black shrink-0">até</span>
                    <input
                      type="time"
                      value={s.closeTime}
                      onChange={e => updateShift(s.idx, 'closeTime', e.target.value)}
                      className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm w-full"
                    />
                  </div>
                  <button
                    onClick={() => removeShift(s.idx)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        <button onClick={handleNext} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm">
          Continuar →
        </button>
      </div>
    </div>
  );
}
