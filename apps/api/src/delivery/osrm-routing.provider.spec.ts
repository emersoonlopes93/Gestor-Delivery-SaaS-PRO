import { OsrmRoutingProvider } from './osrm-routing.provider';

describe('OsrmRoutingProvider', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv, ROUTING_PROVIDER: 'osrm', ROUTING_OSRM_BASE_URL: 'https://router.test', ROUTING_TIMEOUT_MS: '1000' }; });
  afterEach(() => { process.env = originalEnv; jest.restoreAllMocks(); });

  it('maps road geometry, legs, distance and duration', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 1500, duration: 420, geometry: { coordinates: [[-46.6, -23.5], [-46.5, -23.4]] }, legs: [{ distance: 1500, duration: 420 }] }] }), { status: 200 }));
    await expect(new OsrmRoutingProvider().route({ lat: -23.5, lng: -46.6 }, [{ lat: -23.4, lng: -46.5 }])).resolves.toEqual({ provider: 'osrm', distanceMeters: 1500, durationSeconds: 420, geometry: [{ lat: -23.5, lng: -46.6 }, { lat: -23.4, lng: -46.5 }], legs: [{ distanceMeters: 1500, durationSeconds: 420 }] });
  });

  it.each([429, 500])('rejects provider status %s', async (status) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status }));
    await expect(new OsrmRoutingProvider().route({ lat: 0, lng: 0 }, [{ lat: 1, lng: 1 }])).rejects.toThrow(`OSRM status ${status}`);
  });

  it('rejects malformed responses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'Ok', routes: [] }), { status: 200 }));
    await expect(new OsrmRoutingProvider().route({ lat: 0, lng: 0 }, [{ lat: 1, lng: 1 }])).rejects.toThrow('Malformed OSRM response');
  });
});
