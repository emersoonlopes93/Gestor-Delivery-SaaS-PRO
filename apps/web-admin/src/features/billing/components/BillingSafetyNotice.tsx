import { ShieldAlert } from 'lucide-react';

export function SafetyAlert() {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-black">Modo Operacional Manual</p>
          <p className="mt-1 text-sm font-semibold">
            O gateway de pagamento automático ainda não está conectado. As ações financeiras executadas aqui afetam o status interno da loja, mas não processam cobranças reais ou bloqueios automáticos externos.
          </p>
        </div>
      </div>
    </div>
  );
}




