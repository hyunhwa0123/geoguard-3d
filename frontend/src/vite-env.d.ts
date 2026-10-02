/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_DRONE_MODEL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace GeoJSON {
  interface Polygon {
    type: 'Polygon';
    coordinates: number[][][];
  }

  interface Feature<G = Polygon> {
    type: 'Feature';
    geometry: G;
    properties: Record<string, unknown> | null;
    id?: string | number;
  }

  interface FeatureCollection<G = Polygon> {
    type: 'FeatureCollection';
    features: Array<Feature<G>>;
  }
}
