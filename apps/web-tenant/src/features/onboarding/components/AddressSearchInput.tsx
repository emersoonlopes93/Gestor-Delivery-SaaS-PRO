import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import type { GooglePlacePrediction, StructuredAddress } from '@gestor/utils';
import { loadGoogleMaps, parseGooglePlace } from '@gestor/utils';

type MapsAutocompleteService = {
  getPlacePredictions: (
    request: {
      input: string;
      componentRestrictions?: { country: string | string[] };
      types?: string[];
    },
    callback: (predictions: GooglePlacePrediction[] | null, status: string) => void,
  ) => void;
};

type MapsPlacesService = {
  getDetails: (
    request: { placeId: string; fields: string[] },
    callback: (place: unknown, status: string) => void,
  ) => void;
};

interface AddressSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (address: StructuredAddress, description: string) => void;
  onRequestManualEntry: () => void;
  placeholder?: string;
}

export function AddressSearchInput({
  value,
  onChange,
  onSelect,
  onRequestManualEntry,
  placeholder = 'Digite rua, numero e cidade',
}: AddressSearchInputProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<GooglePlacePrediction[]>([]);
  const autocompleteServiceRef = useRef<MapsAutocompleteService | null>(null);
  const placesServiceRef = useRef<MapsPlacesService | null>(null);
  const placesContainerRef = useRef<HTMLDivElement | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;
  const hasSearchText = value.trim().length > 0;

  useEffect(() => {
    if (!apiKey) {
      setLoading(false);
      setError('Busca automatica indisponivel no momento.');
      return;
    }

    let active = true;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!active || !window.google?.maps?.places || !placesContainerRef.current) return;
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        placesServiceRef.current = new window.google.maps.places.PlacesService(placesContainerRef.current);
        setLoading(false);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError('Nao foi possivel carregar as sugestoes de endereco.');
      });

    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!autocompleteServiceRef.current || value.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const currentQuery = value.trim();
    setSearching(true);

    const timeoutId = window.setTimeout(() => {
      autocompleteServiceRef.current?.getPlacePredictions(
        {
          input: currentQuery,
          componentRestrictions: { country: 'BR' },
          types: ['address'],
        },
        (predictions, status) => {
          setSearching(false);
          if (status !== 'OK' || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(predictions);
        },
      );
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value]);

  const emptyMessage = useMemo(() => {
    if (loading || searching || value.trim().length < 3) return null;
    if (error) return error;
    if (suggestions.length === 0) return 'Nao encontramos sugestoes para essa busca.';
    return null;
  }, [error, loading, searching, suggestions.length, value]);

  const handleSelectSuggestion = (suggestion: GooglePlacePrediction) => {
    if (!placesServiceRef.current) return;
    setSearching(true);

    placesServiceRef.current.getDetails(
      {
        placeId: suggestion.place_id,
        fields: ['address_components', 'geometry', 'formatted_address'],
      },
      (place, status) => {
        setSearching(false);
        if (status !== 'OK' || !place) {
          setError('Nao foi possivel carregar os detalhes desse endereco.');
          return;
        }

        const parsed = parseGooglePlace(place);
        if (!parsed) {
          setError('Nao foi possivel estruturar esse endereco. Use o preenchimento manual.');
          return;
        }

        setSuggestions([]);
        setError(null);
        onSelect(parsed, suggestion.description);
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {loading || searching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        </div>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={loading ? 'Carregando busca de enderecos...' : placeholder}
          disabled={loading}
          className="w-full rounded-2xl border border-slate-200 bg-white px-12 py-4 text-base font-medium text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-emerald-500 dark:focus:ring-emerald-900/30"
        />
        {hasSearchText && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSuggestions([]);
              setError(null);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={placesContainerRef} className="hidden" />

      {suggestions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-emerald-50 last:border-b-0 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {suggestion.structured_formatting?.main_text || suggestion.description}
                </span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {suggestion.structured_formatting?.secondary_text || suggestion.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {emptyMessage && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {emptyMessage}
        </div>
      )}

      <button
        type="button"
        onClick={onRequestManualEntry}
        className="text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
      >
        Nao encontrei meu endereco
      </button>
    </div>
  );
}
