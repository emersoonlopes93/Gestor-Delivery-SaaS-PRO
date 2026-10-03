import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { DollarSign, Loader2 } from 'lucide-react';
import {
  CreateFinancialTransactionDTO,
  FinancialAccountDTO,
  FinancialStatus,
  FinancialTransactionDTO,
  FinancialTransactionType,
} from '@gestor/types';
import { CurrencyInput } from '@gestor/ui';

import { api } from '../../lib/api-client';
import { Modal } from '../../components/Modal';

type TransactionFormValues = {
  accountId: string;
  type: FinancialTransactionType;
  category: string;
  amount: number;
  status: FinancialStatus;
  paymentDate: string;
  description: string;
};

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  transaction?: FinancialTransactionDTO | null;
  onCancelPending?: () => void;
  isCancelling?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

function toDateInput(value?: Date): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function TransactionModal({ isOpen, onClose, onSave, transaction = null, onCancelPending, isCancelling = false }: TransactionModalProps) {
  const [accounts, setAccounts] = useState<FinancialAccountDTO[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const isEditing = Boolean(transaction);
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<TransactionFormValues>();
  const status = watch('status');

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    if (!transaction && !idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
    reset({
      accountId: transaction?.accountId ?? '',
      type: transaction?.type ?? FinancialTransactionType.EXPENSE,
      category: transaction?.category ?? '',
      amount: transaction ? Number(transaction.amount) : 0,
      status: transaction?.status ?? FinancialStatus.PAID,
      paymentDate: toDateInput(transaction?.paymentDate) || (transaction?.status === FinancialStatus.PAID || !transaction ? today() : ''),
      description: transaction?.description ?? '',
    });
    void loadAccounts();
  }, [isOpen, reset, transaction]);

  const loadAccounts = async () => {
    try {
      const response = await api.get<FinancialAccountDTO[]>('/finance/accounts');
      if (response.success) setAccounts(response.data.filter((account) => account.active));
    } catch {
      setSubmitError('Não foi possível carregar as contas financeiras. Tente novamente.');
    }
  };

  const onSubmit = async (data: TransactionFormValues) => {
    setSubmitError(null);
    const paymentDate = data.status === FinancialStatus.PAID ? data.paymentDate : '';
    if (data.status === FinancialStatus.PAID && !paymentDate) {
      setSubmitError('Informe a data em que este valor foi efetivamente pago ou recebido.');
      return;
    }
    if (data.status === FinancialStatus.PAID && !data.accountId) {
      setSubmitError('Selecione a conta financeira que recebeu ou pagou este valor.');
      return;
    }

    try {
      if (transaction) {
        const paidUpdate = transaction.status === FinancialStatus.PAID;
        await api.put(`/finance/transactions/${transaction.id}`, paidUpdate ? {
          description: data.description || undefined,
          paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        } : {
          accountId: data.accountId || undefined,
          amount: Number(data.amount),
          description: data.description || undefined,
          ...(data.status === FinancialStatus.PAID ? { status: FinancialStatus.PAID, paymentDate: new Date(paymentDate) } : {}),
        });
      } else {
        const payload: CreateFinancialTransactionDTO & { idempotencyKey: string } = {
          accountId: data.accountId || undefined,
          type: data.type,
          category: data.category.trim(),
          amount: Number(data.amount),
          status: data.status,
          description: data.description.trim() || undefined,
          paymentDate: paymentDate ? new Date(paymentDate) : undefined,
          idempotencyKey: idempotencyKey.current ?? crypto.randomUUID(),
        };
        await api.post('/finance/transactions', payload);
      }
      onSave();
      idempotencyKey.current = null;
      onClose();
    } catch {
      setSubmitError('Não foi possível salvar o lançamento. Nada foi confirmado; tente novamente.');
    }
  };

  const title = transaction ? 'Detalhes do lançamento' : 'Novo lançamento';
  const canMarkPaid = transaction?.status === FinancialStatus.PENDING || transaction?.status === FinancialStatus.OVERDUE;
  const isPaidRecord = transaction?.status === FinancialStatus.PAID;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {submitError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{submitError}</p>}
        {isPaidRecord && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">Este lançamento já movimentou uma conta. Alterações não apagam nem revertem o valor recebido.</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-foreground">Tipo
            <select {...register('type')} disabled={isEditing} className="mt-1 min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70">
              <option value={FinancialTransactionType.INCOME}>Entrada</option>
              <option value={FinancialTransactionType.EXPENSE}>Saída</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-foreground">Situação
            <select {...register('status')} disabled={isEditing && !canMarkPaid} className="mt-1 min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70">
              <option value={FinancialStatus.PAID}>Pago / recebido</option>
              {(!isEditing || transaction?.status === FinancialStatus.PENDING) && <option value={FinancialStatus.PENDING}>Pendente</option>}
              {transaction?.status === FinancialStatus.OVERDUE && <option value={FinancialStatus.OVERDUE}>Vencido</option>}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold text-foreground">Valor
          <span className="relative mt-1 block"><DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Controller name="amount" control={control} rules={{ required: 'Informe o valor.' }} render={({ field: { value, onChange, ref, ...field } }) => <CurrencyInput {...field} ref={ref} value={value} onChange={onChange} disabled={isPaidRecord} className="min-h-10 w-full rounded-md border border-border bg-card pl-9 text-foreground disabled:cursor-not-allowed disabled:opacity-70" />} />
          </span>
          {errors.amount && <span className="mt-1 block text-xs text-destructive">{errors.amount.message}</span>}
        </label>
        <label className="block text-sm font-semibold text-foreground">Conta financeira
          <select {...register('accountId')} disabled={isPaidRecord} className="mt-1 min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70">
            <option value="">Selecione uma conta</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Esta é uma conta financeira; não é o caixa do turno.</span>
        </label>
        {!isEditing && <label className="block text-sm font-semibold text-foreground">Categoria
          <input {...register('category', { required: 'Informe uma categoria.' })} className="mt-1 min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" placeholder="Ex.: aluguel ou venda" />
          {errors.category && <span className="mt-1 block text-xs text-destructive">{errors.category.message}</span>}
        </label>}
        {status === FinancialStatus.PAID && <label className="block text-sm font-semibold text-foreground">Data do pagamento ou recebimento
          <input {...register('paymentDate')} type="date" className="mt-1 min-h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Usada para mostrar o recebimento no período correto.</span>
        </label>}
        <label className="block text-sm font-semibold text-foreground">Descrição
          <textarea {...register('description')} className="mt-1 min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground" placeholder="Detalhes que ajudam a identificar este lançamento" />
        </label>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          {canMarkPaid && onCancelPending && <button type="button" onClick={onCancelPending} disabled={isSubmitting || isCancelling} className="min-h-10 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{isCancelling ? 'Cancelando...' : 'Cancelar lançamento'}</button>}
          <button type="button" onClick={onClose} disabled={isSubmitting} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Voltar</button>
          <button type="submit" disabled={isSubmitting} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {transaction ? (canMarkPaid && status === FinancialStatus.PAID ? 'Marcar como pago' : 'Salvar alterações') : 'Salvar lançamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
