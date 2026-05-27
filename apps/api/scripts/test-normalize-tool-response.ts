import { normalizeToolResponse } from '../src/ai-agent/utils/normalize-tool-response';

function assertEqual(a: unknown, b: unknown, msg?: string) {
  const pa = JSON.stringify(a);
  const pb = JSON.stringify(b);
  if (pa !== pb) {
    console.error('Assertion failed:', msg || '', '\n expected:', pb, '\n got:', pa);
    process.exit(2);
  }
}

// string -> { value }
assertEqual(normalizeToolResponse('hello'), { value: 'hello' }, 'string');
// number
assertEqual(normalizeToolResponse(123), { value: 123 }, 'number');
// boolean
assertEqual(normalizeToolResponse(true), { value: true }, 'boolean');
// null
assertEqual(normalizeToolResponse(null), { result: null }, 'null');
// array
assertEqual(normalizeToolResponse([1, 2]), { result: [1, 2] }, 'array');
// object
assertEqual(normalizeToolResponse({ a: 1, b: 'x' }), { a: 1, b: 'x' }, 'object');
// nested arrays/objects
assertEqual(
  normalizeToolResponse({ items: [{ id: 1, name: 'n' }, 's'] }),
  { items: [{ id: 1, name: 'n' }, 's'] },
  'nested'
);

console.log('All normalizeToolResponse tests passed');
process.exit(0);
