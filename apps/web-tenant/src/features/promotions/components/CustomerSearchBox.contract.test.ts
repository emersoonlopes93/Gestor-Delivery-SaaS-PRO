import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CustomerSearchBox.tsx', import.meta.url), 'utf8');
const controller = readFileSync(
  new URL('../../../../../api/src/crm/customer.controller.ts', import.meta.url),
  'utf8',
);

describe('CustomerSearchBox API contract', () => {
  it('consumes the paginated customer list envelope returned by the CRM controller', () => {
    expect(controller).toContain('return this.crmSegmentationService.getSegmentedCustomers');
    expect(source).toContain("api.get<CustomerListResponse>('/crm/customers')");
    expect(source).toContain('Array.isArray(res.data.data)');
    expect(source).toContain('setCustomers(res.data.data)');
    expect(source).not.toContain('setCustomers(res.data);');
  });
});
