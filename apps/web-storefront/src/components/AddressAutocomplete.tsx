import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { loadGoogleMaps, parseGooglePlace, StructuredAddress } from '../lib/maps-service';

interface AddressAutocompleteProps {
  onAddressSelected: (address: StructuredAddress) => void;
  placeholder?: string;
  className?: string;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onAddressSelected,
  placeholder = 'Digite seu endereço e número...',
  className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const onAddressSelectedRef = useRef(onAddressSelected);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onAddressSelectedRef.current = onAddressSelected;
  }, [onAddressSelected]);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
    
    if (!apiKey) {
      setLoading(false);
      return;
    }

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!inputRef.current) return;

        const google = window.google;
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'BR' },
          fields: ['address_components', 'geometry', 'formatted_address'],
          types: ['address'],
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const parsed = parseGooglePlace(place);
          if (parsed) {
            onAddressSelectedRef.current(parsed);
          }
        });

        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading Google Maps:', err);
        setError('Erro ao carregar o serviço de mapas');
        setLoading(false);
      });
  }, []);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Search className="w-5 h-5" />
        )}
      </div>
      <input
        ref={inputRef}
        type="text"
        disabled={loading}
        placeholder={loading ? 'Carregando mapas...' : error || placeholder}
        className="input-premium pl-12 pr-4 py-3 sm:py-4 shadow-sm text-sm sm:text-base"
      />
      {!loading && !error && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-300 uppercase tracking-widest pointer-events-none">
          Autocomplete
        </div>
      )}
      {error && !loading && (
        <div className="mt-2 text-xs text-red-500 flex items-center gap-1.5 ml-1">
          <div className="w-1 h-1 rounded-full bg-red-500" />
          {error}
        </div>
      )}
    </div>
  );
};
