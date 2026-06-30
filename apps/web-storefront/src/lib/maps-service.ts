import {
  fetchAddressByCep,
  loadGoogleMaps,
  parseGooglePlace,
  type GooglePlaceResult,
  type StructuredAddress,
} from '@gestor/utils';

export { fetchAddressByCep, loadGoogleMaps, parseGooglePlace };
export type { StructuredAddress };

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!apiKey) return null;

  try {
    await loadGoogleMaps(apiKey);
    const GeocoderCtor = window.google?.maps?.Geocoder;
    if (!GeocoderCtor) return null;
    const geocoder = new GeocoderCtor();

    return await new Promise((resolve) => {
      geocoder.geocode(
        { address, componentRestrictions: { country: 'BR' } },
        (results: GooglePlaceResult[] | null, status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const location = results[0].geometry.location;
            resolve({ lat: location.lat(), lng: location.lng() });
            return;
          }

          resolve(null);
        },
      );
    });
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}
