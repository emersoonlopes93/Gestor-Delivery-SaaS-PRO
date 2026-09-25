import React, { useEffect, useState } from 'react';
import { ProductOptionGroupLink, OptionGroup, UpdateProductOptionGroupLinkDto } from '@gestor/types';
import { Modal } from '../../../components/Modal';
import { Info, RotateCcw } from 'lucide-react';

type LinkWithGroup = ProductOptionGroupLink & {
  optionGroup?: OptionGroup;
};

interface ProductLinkOverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  link: LinkWithGroup | null;
  onSaveOverrides: (payload: UpdateProductOptionGroupLinkDto) => Promise<void>;
  isSaving: boolean;
}

export const ProductLinkOverrideDialog: React.FC<ProductLinkOverrideDialogProps> = ({
  isOpen,
  onClose,
  link,
  onSaveOverrides,
  isSaving,
}) => {
  const [form, setForm] = useState<{
    overrideName: string;
    overrideDescription: string;
    overrideIsRequired: boolean | undefined;
    overrideMinSelect: string;
    overrideMaxSelect: string;
    pricingAxis: 'primary' | 'secondary';
  }>({
    overrideName: '',
    overrideDescription: '',
    overrideIsRequired: undefined,
    overrideMinSelect: '',
    overrideMaxSelect: '',
    pricingAxis: 'secondary',
  });

  useEffect(() => {
    if (isOpen && link) {
      setForm({
        overrideName: link.overrideName ?? '',
        overrideDescription: link.overrideDescription ?? '',
        overrideIsRequired: link.overrideIsRequired ?? undefined,
        overrideMinSelect: link.overrideMinSelect != null ? String(link.overrideMinSelect) : '',
        overrideMaxSelect: link.overrideMaxSelect != null ? String(link.overrideMaxSelect) : '',
        pricingAxis: link.pricingAxis ?? 'secondary',
      });
    }
  }, [isOpen, link]);

  const handleSave = async () => {
    const payload: UpdateProductOptionGroupLinkDto = {
      overrideName: form.overrideName.trim() ? form.overrideName.trim() : undefined,
      overrideDescription: form.overrideDescription.trim() ? form.overrideDescription.trim() : undefined,
      overrideIsRequired: form.overrideIsRequired !== undefined ? form.overrideIsRequired : undefined,
      overrideMinSelect: form.overrideMinSelect !== '' ? Number(form.overrideMinSelect) : undefined,
      overrideMaxSelect: form.overrideMaxSelect !== '' ? Number(form.overrideMaxSelect) : undefined,
      pricingAxis: form.pricingAxis,
    };

    await onSaveOverrides(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configurações no produto: ${link?.optionGroup?.name ?? ''}`}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary px-6 py-2 text-sm font-bold flex items-center gap-2"
          >
            {isSaving && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
            Salvar no produto
          </button>
        </>
      }
    >
      <div className="space-y-5 text-left">
        <div className="flex items-start gap-2.5 p-3.5 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground font-medium">
          <Info className="w-4 h-4 shrink-0 text-primary mt-0.5" />
          <span>
            Estas configurações aplicam-se <strong>apenas a este produto</strong> e não alteram a definição original do grupo mestre na sua Biblioteca.
          </span>
        </div>

        {/* Pricing Axis */}
        <div className="space-y-1.5">
          <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">
            Eixo de Precificação
          </label>
          <select
            value={form.pricingAxis}
            onChange={(e) => setForm((p) => ({ ...p, pricingAxis: e.target.value as 'primary' | 'secondary' }))}
            className="w-full px-4 py-2.5 bg-card text-foreground text-sm font-medium border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="secondary">Secundário (Adicionais/Complementos padrão)</option>
            <option value="primary">Primário (Principal/Tamanhos com substituição)</option>
          </select>
        </div>

        {/* Override Required */}
        <div className="flex items-center justify-between p-3.5 bg-muted/30 border border-border rounded-xl">
          <div>
            <label className="text-sm font-bold text-foreground block">
              Obrigatório neste produto
            </label>
            <span className="text-xs text-muted-foreground">
              {form.overrideIsRequired === undefined
                ? `Usando padrão do grupo (${link?.optionGroup?.isRequired ? 'Obrigatório' : 'Opcional'})`
                : form.overrideIsRequired
                ? 'Obrigatório para o cliente escolher neste produto'
                : 'Opcional neste produto'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={form.overrideIsRequired === undefined ? 'default' : form.overrideIsRequired ? 'true' : 'false'}
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({
                  ...p,
                  overrideIsRequired: v === 'default' ? undefined : v === 'true',
                }));
              }}
              className="px-3 py-1.5 bg-card text-foreground text-xs font-bold border border-input rounded-lg"
            >
              <option value="default">Padrão do grupo</option>
              <option value="true">Obrigatório</option>
              <option value="false">Opcional</option>
            </select>

            {form.overrideIsRequired !== undefined && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, overrideIsRequired: undefined }))}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
                title="Restaurar padrão do grupo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Override Min / Max */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">
                Mínimo de escolhas
              </label>
              {form.overrideMinSelect !== '' && (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, overrideMinSelect: '' }))}
                  className="text-[10px] text-muted-foreground hover:text-foreground font-bold"
                >
                  Restaurar ({link?.optionGroup?.minSelect ?? 0})
                </button>
              )}
            </div>
            <input
              type="number"
              min="0"
              value={form.overrideMinSelect}
              onChange={(e) => setForm((p) => ({ ...p, overrideMinSelect: e.target.value }))}
              placeholder={`Padrão: ${link?.optionGroup?.minSelect ?? 0}`}
              className="w-full px-4 py-2.5 bg-card text-foreground text-sm font-medium border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">
                Máximo de escolhas
              </label>
              {form.overrideMaxSelect !== '' && (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, overrideMaxSelect: '' }))}
                  className="text-[10px] text-muted-foreground hover:text-foreground font-bold"
                >
                  Restaurar ({link?.optionGroup?.maxSelect ?? 1})
                </button>
              )}
            </div>
            <input
              type="number"
              min="1"
              value={form.overrideMaxSelect}
              onChange={(e) => setForm((p) => ({ ...p, overrideMaxSelect: e.target.value }))}
              placeholder={`Padrão: ${link?.optionGroup?.maxSelect ?? 1}`}
              className="w-full px-4 py-2.5 bg-card text-foreground text-sm font-medium border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>
        </div>

        {/* Override Name & Description */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">
              Nome personalizado neste produto (Opcional)
            </label>
            <input
              type="text"
              value={form.overrideName}
              onChange={(e) => setForm((p) => ({ ...p, overrideName: e.target.value }))}
              placeholder={`Padrão: ${link?.optionGroup?.name ?? ''}`}
              className="w-full px-4 py-2.5 bg-card text-foreground text-sm font-medium border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider">
              Descrição personalizada neste produto (Opcional)
            </label>
            <input
              type="text"
              value={form.overrideDescription}
              onChange={(e) => setForm((p) => ({ ...p, overrideDescription: e.target.value }))}
              placeholder={`Padrão: ${link?.optionGroup?.description ?? 'Sem descrição'}`}
              className="w-full px-4 py-2.5 bg-card text-foreground text-sm font-medium border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
