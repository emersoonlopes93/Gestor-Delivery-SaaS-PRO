/**
 * Interface para os dados estruturados de endereço retornados pelo Google Places
 */
export interface StructuredAddress {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lng: number;
  formattedAddress: string;
}

/**
 * Utilitário para extrair componentes do endereço do Google Maps Geocoder/Places
 */
export function parseGooglePlace(place: google.maps.places.PlaceResult): StructuredAddress | null {
  if (!place.address_components || !place.geometry?.location) return null;

  const result: Partial<StructuredAddress> = {
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    formattedAddress: place.formatted_address || '',
  };

  const getComponent = (type: string, useShort = false) => {
    const component = place.address_components?.find((c) => c.types.includes(type));
    return component ? (useShort ? component.short_name : component.long_name) : '';
  };

  result.street = getComponent('route');
  result.number = getComponent('street_number');
  result.neighborhood = getComponent('sublocality_level_1') || getComponent('neighborhood');
  result.city = getComponent('administrative_area_level_2') || getComponent('locality');
  result.state = getComponent('administrative_area_level_1', true);
  result.zipCode = getComponent('postal_code').replace(/\D/g, '');

  return result as StructuredAddress;
}

/**
 * Carregador dinâmico do script do Google Maps
 */
let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    
    const win = window as unknown as Window & { 
      google?: { maps?: { Geocoder: any } }; 
      [key: string]: any 
    };
    
    if (win.google?.maps) return resolve();

    const callbackName = `__googleMapsCallback_${Date.now()}`;
    win[callbackName] = () => {
      resolve();
      delete win[callbackName];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=pt-BR&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = (e) => {
      reject(e);
      delete (window as any)[callbackName];
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Geocodifica um endereço textual para obter lat/lng
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!apiKey) return null;

  try {
    await loadGoogleMaps(apiKey);
    const win = window as any;
    const geocoder = new win.google.maps.Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode({ address, componentRestrictions: { country: 'BR' } }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.error('Geocoding error:', err);
    return null;
  }
}

/**
 * Busca endereço pelo CEP usando ViaCEP
 */
export async function fetchAddressByCep(cep: string) {
  const cleanCep = cep.replace(/\D/g, '');
  if (cleanCep.length !== 8) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    const data = await response.json();

    if (data.erro) return null;

    return {
      street: data.logradouro,
      neighborhood: data.bairro,
      city: data.localidade,
      state: data.uf,
      zipCode: data.cep.replace(/\D/g, ''),
    };
  } catch (err) {
    console.error('ViaCEP error:', err);
    return null;
  }
}
