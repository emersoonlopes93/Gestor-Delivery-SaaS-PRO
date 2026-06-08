import { memo } from 'react';
import type { OrderResponseDTO } from '@gestor/types';

interface OrderPrintTemplateProps {
  order: OrderResponseDTO;
}

export const OrderPrintTemplate = memo(function OrderPrintTemplate({ order }: OrderPrintTemplateProps) {
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR');

  return (
    <div className="print-template p-4 text-black bg-white font-mono text-sm leading-tight max-w-[80mm] mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-xl font-bold uppercase">Pedido #{order.orderNumber}</h1>
        <p className="text-xs">{fmtDate(order.createdAt)}</p>
        <div className="border-b border-dashed border-black my-2" />
        <p className="font-bold uppercase">{order.fulfillmentType === 'delivery' ? 'Entrega' : order.fulfillmentType === 'pickup' ? 'Retirada' : 'Mesa'}</p>
      </div>

      <div className="mb-4">
        <p className="font-bold uppercase">Cliente:</p>
        <p>{order.customerName}</p>
        <p>{order.customerPhone}</p>
        {order.deliveryAddress && (
          <div className="mt-2">
            <p className="font-bold uppercase">Endereço:</p>
            <p>{order.deliveryAddress.street}, {order.deliveryAddress.number}</p>
            {order.deliveryAddress.complement && <p>{order.deliveryAddress.complement}</p>}
            <p>{order.deliveryAddress.neighborhood} - {order.deliveryAddress.city}</p>
            {order.deliveryAddress.reference && <p className="italic">Ref: {order.deliveryAddress.reference}</p>}
          </div>
        )}
      </div>

      <div className="border-b border-dashed border-black my-2" />

      <div className="mb-4">
        <p className="font-bold uppercase mb-1">Itens:</p>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id}>
              <div className="flex justify-between font-bold">
                <span>{item.quantity}x {item.snapshotName}</span>
                <span>{fmt(item.lineTotal)}</span>
              </div>
              
              {(() => {
                const options = (item.snapshotCatalogV2Json as any)?.optionItems || [];
                if (options.length === 0) return null;
                return (
                  <div className="pl-4 text-xs">
                    {options.map((o: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>+ {o.snapshotName}</span>
                        {o.snapshotPrice > 0 && <span>{fmt(o.snapshotPrice)}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {item.notes && (
                <p className="pl-4 text-xs italic mt-1">Obs: {item.notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-dashed border-black my-2" />

      <div className="space-y-1 mb-4">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{fmt(order.itemsSubtotal)}</span>
        </div>
        {order.deliveryFee > 0 && (
          <div className="flex justify-between">
            <span>Taxa de Entrega</span>
            <span>{fmt(order.deliveryFee)}</span>
          </div>
        )}
        {order.discountTotal > 0 && (
          <div className="flex justify-between">
            <span>Desconto</span>
            <span>-{fmt(order.discountTotal)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-2 border-t border-black">
          <span>TOTAL</span>
          <span>{fmt(order.total)}</span>
        </div>
      </div>

      <div className="mb-4">
        <p className="font-bold uppercase">Pagamento:</p>
        <p className="capitalize">{order.paymentMethod.replace('_', ' ')}</p>
        {order.changeFor && (
          <p>Troco para: {fmt(order.changeFor)}</p>
        )}
      </div>

      {order.notes && (
        <div className="mb-4 p-2 border border-black italic">
          <p className="font-bold uppercase not-italic">Observação do Pedido:</p>
          <p>{order.notes}</p>
        </div>
      )}

      <div className="text-center mt-6 text-xs">
        <p>Obrigado pela preferência!</p>
        <div className="border-b border-dashed border-black my-2" />
        <p>Sistema Gestor Delivery</p>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-template, .print-template * { visibility: visible; }
          .print-template { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
});
