type Point = { latitude: number; longitude: number };
type Coordinate = [longitude: number, latitude: number];

export type RoadRoute =
  | { status: 'ready'; distanceMeters: number; durationSeconds: number; coordinates: Coordinate[] }
  | { status: 'no-route' | 'unavailable' };

function coordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === 'number' && Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' && Math.abs(value[1]) <= 90;
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function roadRoute(from: Point, to: Point): Promise<RoadRoute> {
  const base = process.env.OSRM_BASE_URL;
  if (!base || ![from, to].every(p => coordinate([p.longitude, p.latitude]))) return { status: 'unavailable' };
  try {
    const points = [from, to].map(p => [p.longitude, p.latitude].join(',')).join(';');
    const routeUrl = new URL('route/v1/driving/' + points, base.replace(/\/?$/, '/'));
    if (!['http:', 'https:'].includes(routeUrl.protocol)) return { status: 'unavailable' };
    routeUrl.search = new URLSearchParams({ geometries: 'geojson', overview: 'full', steps: 'false' }).toString();
    const response = await fetch(routeUrl, { signal: AbortSignal.timeout(5000) });
    const result = await response.json() as {
      code?: string; routes?: { distance?: unknown; duration?: unknown; geometry?: { type?: unknown; coordinates?: unknown } }[];
    };
    if (result.code === 'NoRoute' || result.code === 'NoSegment') return { status: 'no-route' };
    const route = result.routes?.[0];
    const coordinates = route?.geometry?.coordinates;
    if (response.ok && result.code === 'Ok' && nonnegative(route?.distance) && nonnegative(route.duration) &&
        route.geometry?.type === 'LineString' && Array.isArray(coordinates) &&
        coordinates.length >= 2 && coordinates.length <= 20_000 && coordinates.every(coordinate)) {
      return { status: 'ready', distanceMeters: route.distance, durationSeconds: route.duration, coordinates };
    }
  } catch {
    return { status: 'unavailable' };
  }
  return { status: 'unavailable' };
}
