import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderDrawer.tsx'), 'utf8');

describe('OrderDrawer tracking membership contract', () => {
  it('queries the tenant run membership and only renders the trigger when confirmed', () => {
    expect(source).toContain("`/delivery/runs/order/${order?.id}`");
    expect(source).toContain('const canTrackOrder = Boolean(order && orderBelongsToRun(order, trackingRunQuery.data));');
    expect(source).toMatch(/\{canTrackOrder \? \([\s\S]*Ver no mapa/);
    expect(source).not.toMatch(/\{order\.deliveryDriverId \? \([\s\S]*Ver no mapa/);
  });
});
