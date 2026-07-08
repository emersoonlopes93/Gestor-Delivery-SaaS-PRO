# Location Providers

## Politica MVP

O backend deve ser a autoridade final para geocoding e calculo de distancia.

- `GOOGLE_MAPS_KEY` e o provider principal para geocoding.
- `ViaCEP` continua apenas como lookup de CEP no Brasil.
- `Nominatim` existe apenas como fallback controlado por configuracao.
- `Haversine` permanece como calculo atual de distancia.
- `Distance Matrix` fica fora do escopo desta fase.

## Env vars

Use estas variaveis na API:

```env
GOOGLE_MAPS_KEY=
LOCATION_GEOCODING_PROVIDER=google
LOCATION_GEOCODING_FALLBACK=nominatim
LOCATION_POSTAL_CODE_PROVIDER=viacep
LOCATION_DISTANCE_PROVIDER=haversine
LOCATION_ALLOW_NOMINATIM_FALLBACK=false
```

Compatibilidade legada:

- O backend ainda aceita `VITE_GOOGLE_MAPS_KEY` como fallback para evitar quebra imediata.
- Esse fallback deve ser removido em uma fase futura.

## Fonte de verdade

- `tenant_settings.lat/lng` = coordenada canonica da loja.
- `delivery_coverage_configs.storeLat/storeLng` = cache operacional e fallback.
- Endereco do checkout = dado do cliente.
- Delivery quote = calculado pelo backend.

## Responsabilidades por provider

- `google`
  - geocoding principal
  - autocomplete continua no frontend por enquanto
- `viacep`
  - lookup de CEP
  - nao define coordenada canonica
- `nominatim`
  - fallback explicito
  - nao deve rodar silenciosamente em producao
- `haversine`
  - distancia atual entre origem e destino

## Observabilidade minima

Ao chamar geocoding, registrar:

- provider principal
- source
- sucesso ou falha
- se fallback foi usado
- tenantId quando aplicavel

Nao registrar:

- chave de API
- payload bruto sensivel sem necessidade

