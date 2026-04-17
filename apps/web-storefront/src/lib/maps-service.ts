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
    if ((window as any).google?.maps) return resolve();

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=pt-BR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });

  return loadPromise;
}
