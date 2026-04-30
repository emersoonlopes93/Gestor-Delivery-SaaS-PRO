import React, { useEffect, useState } from 'react';
import { useDrivers } from '../hooks/useDrivers';
import type { DriverDTO, CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';
import { DriverStatus, DriverVehicleType } from '@gestor/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  driver: DriverDTO | null;
}

export function DriverFormModal({ isOpen, onClose, driver }: Props) {
  const { createDriver, updateDriver } = useDrivers();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<DriverVehicleType>(DriverVehicleType.motorcycle);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.available);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (driver) {
        setName(driver.name);
        setPhone(driver.phone);
        setVehicleType(driver.vehicleType);
        setStatus(driver.status);
        setIsActive(driver.isActive);
        setNotes(driver.notes || '');
      } else {
        setName('');
        setPhone('');
        setVehicleType(DriverVehicleType.motorcycle);
        setStatus(DriverStatus.available);
        setIsActive(true);
        setNotes('');
      }
    }
  }, [driver, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (driver) {
        await updateDriver(driver.id, {
          name,
          phone,
          vehicleType,
          status,
          isActive,
          notes,
        });
      } else {
        await createDriver({
          name,
          phone,
          vehicleType,
          notes,
        });
      }
      onClose();
    } catch (err) {
      alert('Erro ao salvar entregador');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {driver ? 'Editar Entregador' : 'Novo Entregador'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors text-2xl leading-none"
            type="button"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Veículo</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as DriverVehicleType)}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm bg-white dark:bg-gray-900"
            >
              <option value="motorcycle">Moto</option>
              <option value="bicycle">Bicicleta</option>
              <option value="car">Carro</option>
            </select>
          </div>

          {driver && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status Operacional</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DriverStatus)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm bg-white dark:bg-gray-900"
                >
                  <option value="available">Disponível</option>
                  <option value="busy">Ocupado (Em rota / Ocupado logicamente)</option>
                  <option value="offline">Offline / Indisponível</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-700 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Cadastralmente Ativo
                </label>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div className="pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
