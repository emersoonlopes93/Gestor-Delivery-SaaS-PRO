import { memo, useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { LatLngExpression } from 'leaflet';
import type { DeliveryRateRule, PolygonCoordinates, TierDraft } from './types';
import { coordsToLatLngs, defaultZoneColor, ensureRingClosed, normalizePolygonCoordinates } from './helpers';

function latLngsToCoords(latLngs: readonly L.LatLng[]): PolygonCoordinates {
  const out: Array<readonly [number, number]> = [];
  for (const point of latLngs) out.push([point.lng, point.lat] as const);
  return out;
}

const MapRefSync = memo(function MapRefSync(props: {
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const map = useMap();

  useEffect(() => {
    props.mapRef.current = map;
    return () => {
      if (props.mapRef.current === map) props.mapRef.current = null;
    };
  }, [map, props.mapRef]);

  return null;
});

const ManualDrawLayer = memo(function ManualDrawLayer(props: {
  enabled: boolean;
  color: string;
  points: L.LatLng[];
  setPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
}) {
  const map = useMap();
  const [mousePos, setMousePos] = useState<L.LatLng | null>(null);

  useMapEvents({
    click: (event) => {
      if (!props.enabled) return;
      props.setPoints((prev) => [...prev, event.latlng]);
    },
    mousemove: (event) => {
      if (!props.enabled) return;
      setMousePos(event.latlng);
    },
    mouseout: () => {
      if (!props.enabled) return;
      setMousePos(null);
    },
  });

  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = props.enabled ? 'crosshair' : '';
    return () => {
      el.style.cursor = '';
    };
  }, [map, props.enabled]);

  if (!props.enabled) return null;

  const currentPositions = [...props.points];
  if (mousePos) currentPositions.push(mousePos);

  return (
    <>
      {props.points.map((point, index) => (
        <CircleMarker
          key={`${point.lat}-${point.lng}-${index}`}
          center={point}
          radius={5}
          pathOptions={{ color: props.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
        />
      ))}
      {currentPositions.length >= 2 ? (
        <Polygon
          positions={currentPositions}
          pathOptions={{
            color: props.color,
            weight: 2,
            dashArray: '6 4',
            fillColor: props.color,
            fillOpacity: currentPositions.length >= 3 ? 0.12 : 0,
            interactive: false,
          }}
        />
      ) : null}
    </>
  );
});

const ZoneEditLayer = memo(function ZoneEditLayer(props: {
  enabled: boolean;
  color: string;
  seedPolygon: PolygonCoordinates | null;
  onPolygonChange: (coords: PolygonCoordinates | null) => void;
}) {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!props.enabled) return;
    const featureGroup = new L.FeatureGroup();
    featureGroupRef.current = featureGroup;
    map.addLayer(featureGroup);

    const handleEdited = (event: L.LeafletEvent) => {
      const layers = (event as { layers?: L.LayerGroup }).layers;
      if (!(layers instanceof L.LayerGroup)) return;
      for (const layer of layers.getLayers()) {
        if (layer instanceof L.Polygon) {
          const latLngs = layer.getLatLngs();
          if (!Array.isArray(latLngs) || latLngs.length === 0 || !Array.isArray(latLngs[0])) return;
          const ring = latLngs[0];
          if (!ring.every((point) => point instanceof L.LatLng)) return;
          props.onPolygonChange(latLngsToCoords(ring));
          return;
        }
      }
    };

    const handleDeleted = () => {
      featureGroup.clearLayers();
      props.onPolygonChange(null);
    };

    map.on(L.Draw.Event.EDITED, handleEdited);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    const editControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: false,
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup,
        remove: true,
      },
    });
    map.addControl(editControl);

    return () => {
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(editControl);
      map.removeLayer(featureGroup);
      featureGroupRef.current = null;
    };
  }, [map, props]);

  useEffect(() => {
    const featureGroup = featureGroupRef.current;
    if (!featureGroup) return;
    featureGroup.clearLayers();
    if (!props.seedPolygon || props.seedPolygon.length < 3) return;

    featureGroup.addLayer(
      new L.Polygon(coordsToLatLngs(ensureRingClosed(props.seedPolygon)), {
        color: props.color,
        fillColor: props.color,
        fillOpacity: 0.12,
        weight: 3,
      }),
    );
  }, [props.color, props.seedPolygon]);

  return null;
});

type DeliveryMapCanvasProps = {
  storePosition: LatLngExpression;
  maxRadiusKm: number;
  tiers: TierDraft[];
  visibleZones: DeliveryRateRule[];
  selectedZoneId: string | null;
  highlightedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  drawing: boolean;
  draftPoints: L.LatLng[];
  setDraftPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  editingPolygon: PolygonCoordinates | null;
  onPolygonChange: (coords: PolygonCoordinates | null) => void;
  editingColor: string;
};

export function DeliveryMapCanvas(props: DeliveryMapCanvasProps) {
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className="relative h-full w-full">
      <MapContainer center={props.storePosition} zoom={13} className="theme-aware-map h-full w-full">
        <MapRefSync mapRef={mapRef} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={props.storePosition}>
          <Tooltip direction="top" offset={[0, -12]}>
            Loja / ponto de partida
          </Tooltip>
        </Marker>

        <Circle
          center={props.storePosition}
          radius={Math.max(props.maxRadiusKm, 0) * 1000}
          pathOptions={{
            color: '#2563eb',
            weight: 2,
            dashArray: '8 6',
            fillColor: '#2563eb',
            fillOpacity: 0.06,
          }}
        />

        {props.tiers.map((tier, index) => (
          <Circle
            key={`${tier.minDistanceKm}-${tier.maxDistanceKm}-${index}`}
            center={props.storePosition}
            radius={tier.maxDistanceKm * 1000}
            pathOptions={{
              color: '#2563eb',
              weight: 1.5,
              opacity: 0.45,
              fillColor: '#2563eb',
              fillOpacity: 0.025,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {tier.minDistanceKm <= 0 ? `Até ${tier.maxDistanceKm} km` : `${tier.minDistanceKm} a ${tier.maxDistanceKm} km`}
            </Tooltip>
          </Circle>
        ))}

        {props.visibleZones.map((zone) => {
          const coords = normalizePolygonCoordinates(zone.polygonCoordinates);
          if (!coords || coords.length < 3) return null;
          const color = zone.color ?? zone.geoJson?.properties?.color ?? defaultZoneColor();
          const isSelected = props.selectedZoneId === zone.id;
          const isHighlighted = props.highlightedZoneId === zone.id;
          return (
            <Polygon
              key={zone.id}
              positions={coordsToLatLngs(coords)}
              pathOptions={{
                color,
                weight: isSelected || isHighlighted ? 4 : 3,
                opacity: 0.95,
                fillColor: color,
                fillOpacity: zone.zoneKind === 'blocked_zone' ? 0.26 : 0.18,
              }}
              eventHandlers={{
                click: () => props.onSelectZone(zone.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {zone.name || 'Área especial'}
              </Tooltip>
            </Polygon>
          );
        })}

        <ZoneEditLayer
          enabled={!props.drawing && Boolean(props.editingPolygon)}
          color={props.editingColor}
          seedPolygon={props.editingPolygon}
          onPolygonChange={props.onPolygonChange}
        />
        <ManualDrawLayer
          enabled={props.drawing}
          points={props.draftPoints}
          setPoints={props.setDraftPoints}
          color={props.editingColor}
        />
      </MapContainer>

      <div className="absolute left-6 top-6 z-[1000] rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-xl backdrop-blur">
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Legenda</div>
        <div className="mt-3 space-y-2 text-sm text-popover-foreground">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-blue-600" />
            <span>Raio de entrega</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-amber-500" />
            <span>Área com taxa especial</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-green-600" />
            <span>Entrega grátis</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span>Área bloqueada</span>
          </div>
        </div>
      </div>
    </div>
  );
}
