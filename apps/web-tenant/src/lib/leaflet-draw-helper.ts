import L from 'leaflet';
import 'leaflet-draw';

// Monkey patch para o bug do leaflet-draw com Leaflet 1.8+ onde o polígono fecha prematuramente.
// Ocorre porque pointer events disparam touch e mouse ao mesmo tempo em alguns ambientes, 
// causando adição dupla de vértices que o leaflet-draw interpreta como duplo clique (finalizar).
if (typeof window !== 'undefined' && (window as any).L && (window as any).L.Draw && (window as any).L.Draw.Polyline) {
  (window as any).L.Draw.Polyline.prototype._onTouch = L.Util.falseFn;
}

/**
 * Helper para inicializar controles e ferramentas do Leaflet Draw sem usar casts duplos
 * ou tipagens 'any' no código dos componentes.
 * 
 * Motivo: Leaflet.Draw estende L.Map mas as definições do @types/leaflet-draw
 * às vezes entram em conflito com as definições globais do @types/leaflet.
 */

/**
 * Estende o tipo do Mapa para incluir as capacidades de desenho
 */
export type MapWithDraw = L.Map & L.DrawMap;

/**
 * Type guard para verificar se o mapa possui capacidades de desenho
 */
export function isMapWithDraw(map: L.Map | object): map is MapWithDraw {
  return map instanceof L.Map && 'addControl' in map;
}

/**
 * Fábrica para o Polygon Drawer
 */
export function createPolygonDrawer(map: L.Map, options: L.DrawOptions.PolygonOptions): L.Draw.Polygon {
  // O construtor do L.Draw.Polygon espera um L.DrawMap.
  // Fazemos o narrowing aqui de forma centralizada.
  const drawMap = map as unknown as L.DrawMap;
  return new L.Draw.Polygon(drawMap, options);
}

/**
 * Fábrica para o Control.Draw
 */
export function createDrawControl(options: L.Control.DrawConstructorOptions): L.Control.Draw {
  return new L.Control.Draw(options);
}
