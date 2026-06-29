declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          AutocompleteService: new () => {
            getPlacePredictions: (
              request: {
                input: string;
                componentRestrictions?: { country: string | string[] };
                types?: string[];
              },
              callback: (predictions: GooglePlacePrediction[] | null, status: string) => void,
            ) => void;
          };
          PlacesService: new (
            attrContainer: Element,
          ) => {
            getDetails: (
              request: {
                placeId: string;
                fields: string[];
              },
              callback: (place: GooglePlaceResult | null, status: string) => void,
            ) => void;
          };
        };
        Geocoder: new () => {
          geocode: (
            request: {
              address: string;
              componentRestrictions?: { country: string };
            },
            callback: (results: GooglePlaceResult[] | null, status: string) => void,
          ) => void;
        };
      };
    };
    [key: string]: unknown;
  }
}

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
  country?: string;
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GooglePlaceResult {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
}

export interface GooglePlacePrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
}

export function isGoogleMapsLoaded(): boolean {
  return Boolean(window.google?.maps?.places);
}

let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    if (isGoogleMapsLoaded()) {
      resolve();
      return;
    }

    const callbackName = `__googleMapsCallback_${Date.now()}`;
    window[callbackName] = () => {
      resolve();
      delete window[callbackName];
    };

    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=pt-BR&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = (event) => {
      delete window[callbackName];
      reject(event);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function parseGooglePlace(place: GooglePlaceResult): StructuredAddress | null {
  if (!place.address_components || !place.geometry?.location) return null;

  const result: Partial<StructuredAddress> = {
    lat: place.geometry.location.lat(),
    lng: place.geometry.location.lng(),
    formattedAddress: place.formatted_address || '',
  };

  const getComponent = (type: string, useShort = false) => {
    const component = place.address_components?.find((item) => item.types.includes(type));
    return component ? (useShort ? component.short_name : component.long_name) : '';
  };

  result.street = getComponent('route');
  result.number = getComponent('street_number');
  result.neighborhood = getComponent('sublocality_level_1') || getComponent('neighborhood');
  result.city = getComponent('administrative_area_level_2') || getComponent('locality');
  result.state = getComponent('administrative_area_level_1', true);
  result.zipCode = getComponent('postal_code').replace(/\D/g, '');
  result.country = getComponent('country');

  return result as StructuredAddress;
}

export function isValidCoordinatePair(lat?: number | null, lng?: number | null): lat is number {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    lat !== 0 &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    lng !== 0
  );
}

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
  } catch (error) {
    console.error('ViaCEP error:', error);
    return null;
  }
}
