import React, { useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, Check } from 'lucide-react';

export interface VirtualMultiSelectItem {
  id: string;
  label: string;
  imageUrl?: string | null;
  description?: string;
  price?: string | null;
}

interface VirtualMultiSelectProps {
  items: VirtualMultiSelectItem[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
  height?: number;
}

export function VirtualMultiSelect({
  items,
  selectedIds,
  onChange,
  placeholder = 'Buscar produtos...',
  height = 400,
}: VirtualMultiSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Local filtering based on search
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const lower = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(lower) ||
        (item.description && item.description.toLowerCase().includes(lower))
    );
  }, [items, searchTerm]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  // The virtualizer handles the DOM virtualization of the list
  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // estimated row height in px
    overscan: 5,
  });

  const toggleSelection = (id: string) => {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    const newSelectedIds = Array.from(new Set([...selectedIds, ...filteredItems.map(i => i.id)]));
    onChange(newSelectedIds);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <div className="flex flex-col w-full border border-border rounded-xl overflow-hidden bg-card">
      {/* Search Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-lg outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-muted-foreground font-medium">
            {filteredItems.length} itens encontrados
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-primary hover:text-primary/80 font-bold"
            >
              Selecionar visíveis
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-muted-foreground hover:text-foreground font-bold"
            >
              Limpar todos
            </button>
          </div>
        </div>
      </div>

      {/* Virtualized List Container */}
      <div
        ref={parentRef}
        style={{ height: `${height}px`, overflow: 'auto' }}
        className="relative w-full custom-scrollbar"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = filteredItems[virtualItem.index];
            const isSelected = selectedIds.includes(item.id);

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="px-3 py-1"
              >
                <div
                  onClick={() => toggleSelection(item.id)}
                  className={`flex items-center gap-3 p-2 h-full rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted'
                  }`}
                >
                  {/* Checkbox Replacement */}
                  <div
                    className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded border ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input bg-background'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </div>

                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.label}
                      className="w-8 h-8 object-cover rounded-md flex-shrink-0"
                    />
                  )}
                  
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-bold text-foreground truncate">{item.label}</span>
                    {item.description && (
                      <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                    )}
                  </div>

                  {item.price && (
                    <span className="text-sm font-medium text-foreground ml-2 whitespace-nowrap">
                      {item.price}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
            <span className="text-sm font-medium">Nenhum produto encontrado.</span>
            <span className="text-xs mt-1">Tente buscar com outras palavras.</span>
          </div>
        )}
      </div>
    </div>
  );
}
