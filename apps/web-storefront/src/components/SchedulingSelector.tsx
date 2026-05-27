import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api-client';

interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
}

interface SchedulingSelectorProps {
  tenantSlug: string;
  onSlotSelect: (slotId: string, date: string) => void;
  selectedSlotId: string;
  selectedDate: string;
}

export function SchedulingSelector({ tenantSlug, onSlotSelect, selectedSlotId, selectedDate }: SchedulingSelectorProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to today
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(selectedDate || today);

  useEffect(() => {
    async function loadSlots() {
      if (!tenantSlug || !date) return;
      setIsLoading(true);
      setError(null);
      try {
        const { data } = await api.get<TimeSlot[]>(`/public/storefront/${tenantSlug}/slots`, {
          params: { date }
        });
        setSlots(data);
        if (data.length === 0) {
          setError('Não há horários disponíveis para esta data.');
        }
      } catch (err) {
        console.error('Error loading slots', err);
        setError('Erro ao carregar horários disponíveis.');
      } finally {
        setIsLoading(false);
      }
    }
    loadSlots();
  }, [tenantSlug, date]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDate(newDate);
    onSlotSelect('', newDate); // Clear selected slot when date changes
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Data da Entrega/Retirada
        </label>
        <input
          type="date"
          min={today}
          value={date}
          onChange={handleDateChange}
          className="input-premium"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Horários Disponíveis
        </label>

        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-gray-500 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando horários...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-4 text-amber-600 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {slots.map((slot) => {
              const isSelected = selectedSlotId === slot.id;
              const isFull = slot.availableCapacity <= 0;

              return (
                <button
                  key={slot.id}
                  type="button"
                  disabled={isFull}
                  onClick={() => onSlotSelect(slot.id, date)}
                  className={`
                    p-2 text-sm border rounded-md transition-all
                    ${isSelected 
                      ? 'bg-primary-600 border-primary-600 text-white' 
                      : 'bg-white border-gray-200 text-gray-700 hover:border-primary-500'
                    }
                    ${isFull ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}
                  `}
                >
                  {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
