import { useState, useEffect } from 'react';
import { api } from '../../../lib/api-client';
import { Switch } from '../../../components/ui/Switch';
import { Loader2 } from 'lucide-react';
import { ProductOptionGroupLink, OptionGroup, OptionItem } from '@gestor/types';
import { ConfirmGlobalItemToggleModal } from './ConfirmGlobalItemToggleModal';

type LinkWithGroup = ProductOptionGroupLink & { 
  optionGroup?: OptionGroup & { items?: OptionItem[] } 
};

interface ProductComplementsInlineProps {
  productId: string;
  isParentActive: boolean;
}

interface PendingToggle {
  linkId: string;
  itemId: string;
  itemName: string;
  nextActiveState: boolean;
}

export function ProductComplementsInline({ productId, isParentActive }: ProductComplementsInlineProps) {
  const [links, setLinks] = useState<LinkWithGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchOptions = async () => {
      try {
        setIsLoading(true);
        const res = await api.get<LinkWithGroup[]>(`/catalog/products/${productId}/option-groups`);
        if (res.success && mounted) {
          setLinks(res.data);
        }
      } catch (error) {
        console.error('Erro ao carregar complementos:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    fetchOptions();
    return () => {
      mounted = false;
    };
  }, [productId]);

  const requestToggleItem = (linkId: string, item: OptionItem, nextActiveState: boolean) => {
    setPendingToggle({
      linkId,
      itemId: item.id,
      itemName: item.name,
      nextActiveState,
    });
  };

  const executeToggleItem = async () => {
    if (!pendingToggle) return;
    const { linkId, itemId, nextActiveState: isActive } = pendingToggle;
    setPendingToggle(null);

    // Optimistic update
    setLinks(prev => prev.map(link => {
      if (link.id !== linkId) return link;
      if (!link.optionGroup?.items) return link;
      return {
        ...link,
        optionGroup: {
          ...link.optionGroup,
          items: link.optionGroup.items.map(item => 
            item.id === itemId ? { ...item, isActive } : item
          )
        }
      };
    }));

    try {
      await api.patch(`/catalog/option-groups/items/${itemId}`, { isActive });
    } catch (error) {
      console.error('Erro ao atualizar complemento:', error);
      const res = await api.get<LinkWithGroup[]>(`/catalog/products/${productId}/option-groups`);
      if (res.success) setLinks(res.data);
    }
  };

  if (isLoading) {
    return (
      <div className="py-6 flex justify-center items-center bg-muted/20 border-t border-border">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (links.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 bg-muted/10 border-t border-border custom-scrollbar overflow-x-auto ${!isParentActive ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-4">
        {links.map((link) => (
          <div key={link.id} className="bg-card border border-border rounded-xl p-3 shadow-sm">
            <div className="text-xs font-black text-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>{link.optionGroup?.name}</span>
              <span className="text-[10px] text-muted-foreground font-normal normal-case">
                Status global do item
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {link.optionGroup?.items?.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 bg-muted/30 border border-border/50 rounded-lg p-2 min-w-[200px] flex-1">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-bold text-foreground truncate">{item.name}</span>
                    {Number(item.priceImpactValue ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.priceImpactValue))}
                      </span>
                    )}
                  </div>
                  <Switch
                    checked={item.isActive ?? true}
                    onCheckedChange={(isActive: boolean) => requestToggleItem(link.id, item, isActive)}
                    aria-label={`Status do complemento ${item.name}`}
                  />
                </div>
              ))}
              {(!link.optionGroup?.items || link.optionGroup.items.length === 0) && (
                <div className="text-[11px] text-muted-foreground italic p-2">Nenhuma opção cadastrada.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {pendingToggle && (
        <ConfirmGlobalItemToggleModal
          isOpen={Boolean(pendingToggle)}
          onClose={() => setPendingToggle(null)}
          onConfirm={executeToggleItem}
          itemName={pendingToggle.itemName}
          nextState={pendingToggle.nextActiveState}
        />
      )}
    </div>
  );
}
