import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LocationProviderService } from './location-provider.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocationProviderService', () => {
  let service: LocationProviderService;

  const createConfigService = (overrides: Record<string, string | undefined> = {}) =>
    ({
      get: jest.fn((key: string) => overrides[key]),
    } satisfies Pick<ConfigService, 'get'> as ConfigService);

  beforeEach(() => {
    service = new LocationProviderService(
      createConfigService({
        LOCATION_GEOCODING_PROVIDER: 'google',
        LOCATION_GEOCODING_FALLBACK: 'nominatim',
        LOCATION_ALLOW_NOMINATIM_FALLBACK: 'false',
        GOOGLE_MAPS_KEY: 'test-google-key',
      }),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('valida coordenadas reais', () => {
    expect(service.validateCoordinates(-23.561684, -46.625378)).toBe(true);
  });

  it('bloqueia coordenadas 0,0', () => {
    expect(service.validateCoordinates(0, 0)).toBe(false);
  });

  it('bloqueia coordenada sentinela padrao', () => {
    expect(service.validateCoordinates(-23.55052, -46.633308)).toBe(false);
  });

  it('usa Google quando configurado', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        status: 'OK',
        results: [
          {
            formatted_address: 'Av. Paulista, 1000 - Bela Vista, Sao Paulo - SP, Brasil',
            geometry: {
              location: {
                lat: -23.561684,
                lng: -46.656139,
              },
            },
            address_components: [
              { long_name: 'Avenida Paulista', short_name: 'Av. Paulista', types: ['route'] },
              { long_name: '1000', short_name: '1000', types: ['street_number'] },
              { long_name: 'Bela Vista', short_name: 'Bela Vista', types: ['neighborhood'] },
              { long_name: 'Sao Paulo', short_name: 'Sao Paulo', types: ['administrative_area_level_2'] },
              { long_name: 'SP', short_name: 'SP', types: ['administrative_area_level_1'] },
              { long_name: '01310-100', short_name: '01310-100', types: ['postal_code'] },
              { long_name: 'Brasil', short_name: 'BR', types: ['country'] },
            ],
          },
        ],
      },
    });

    const result = await service.geocodeAddress({
      formattedAddress: 'Av. Paulista, 1000, Sao Paulo - SP',
      source: 'geocode',
    });

    expect(result.provider).toBe('google');
    expect(result.lat).toBe(-23.561684);
    expect(result.lng).toBe(-46.656139);
  });

  it('nao roda fallback Nominatim quando desabilitado', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('google failed'));

    const result = await service.geocodeAddress({
      formattedAddress: 'Rua sem retorno',
      source: 'geocode',
    });

    expect(result.provider).toBe('google');
    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('normaliza CEP com ViaCEP sem virar coordenada canonica', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        logradouro: 'Avenida Paulista',
        bairro: 'Bela Vista',
        localidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01310-100',
      },
    });

    const result = await service.lookupPostalCode('01310-100');

    expect(result.provider).toBe('viacep');
    expect(result.address.postalCode).toBe('01310100');
    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
  });

  it('retorna distancia haversine coerente', () => {
    const distance = service.calculateHaversineDistanceKm(
      { lat: -23.55052, lng: -46.633308 },
      { lat: -23.561684, lng: -46.656139 },
    );

    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
  });

  it('retorna erro controlado quando provider falha', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('network down'));

    const result = await service.geocodeAddress({
      formattedAddress: 'Endereco indisponivel',
      source: 'geocode',
    });

    expect(result.provider).toBe('google');
    expect(result.confidence).toBe(0);
    expect(result.lat).toBeUndefined();
    expect(result.lng).toBeUndefined();
  });
});
