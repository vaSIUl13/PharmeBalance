const { readFile, stat, writeFile } = require('node:fs/promises');
const {
  DRLZ, hash, parseDrlz, parseOverpass, parsePharmacyCsv, drlzUrl, createHttpClient,
} = require('./adapters.cjs');

const { canonical } = require('./record-values.cjs');

const snapshotLimit = 64 * 1024 * 1024;

async function readBounded(file) {
  if ((await stat(file)).size > snapshotLimit) throw new Error('Input file exceeds 64 MiB; split it into smaller snapshots');
  return readFile(file, 'utf8');
}

function bbox(value) {
  const parts = value?.split(',');
  const coords = parts?.map(Number);
  if (coords?.length !== 4 || parts.some((part) => !part.trim()) || !coords.every(Number.isFinite)) {
    throw new Error('Provide --bbox south,west,north,east');
  }
  const [s, w, n, e] = coords;
  if (s < -90 || n > 90 || w < -180 || e > 180 || n <= s || e <= w || n - s > 1 || e - w > 1) {
    throw new Error('Overpass bounding box must be valid and at most 1 degree by 1 degree');
  }
  return coords.join(',');
}

async function makeSource(name, options, requestFactory = createHttpClient) {
  if (options.ukraine && (name !== 'osm' || options.bbox || options.file)) {
    throw new Error('--ukraine requires online OSM without --bbox or --file');
  }
  if (name === 'drlz') {
    if (options.file || options.mapping || options.delimiter || options.bbox || options['overpass-url']) {
      throw new Error('DRLZ does not accept pharmacy input options');
    }
    const mode = options.mode ?? 'initial';
    if (!['initial', 'incremental'].includes(mode) || (options.since && mode !== 'incremental')) {
      throw new Error('Invalid DRLZ sync mode or since argument');
    }
    const since = options.since;
    if (since && !Number.isFinite(Date.parse(since))) throw new Error('Invalid --since timestamp');
    const request = requestFactory({
      interval: 1500,
      headers: process.env.DRLZ_API_KEY ? { 'X-Api-Key': process.env.DRLZ_API_KEY } : {},
    });
    const incremental = mode === 'incremental';
    let detailCache = new Map();
    async function enrich(record) {
      const id = incremental ? record?.attributes?.registration : record?.id;
      if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid DRLZ registration identifier');
      if (detailCache.has(id)) return detailCache.get(id);
      let summary = record;
      if (incremental) {
        const result = await request(DRLZ + '/api/v1/registrations/' + id);
        summary = result.body?.data;
      }
      const versions = await request(DRLZ + '/api/v1/registrations/' + id + '/versions?page%5Bsize%5D=1');
      const data = parseDrlz(summary, versions.body?.data?.[0]);
      detailCache.set(id, data);
      return data;
    }
    return {
      source: 'DRLZ', scope: since ? mode + ':' + new Date(since).toISOString() : mode, isDrlz: true, incremental, explicitSince: since,
      start: (sinceValue) => {
        // The API accepts second precision. Round down to include all boundary events.
        const seconds = new Date(sinceValue).toISOString().replace(/\.\d{3}Z$/, 'Z');
        return {
          url: incremental
            ? DRLZ + '/api/v1/changes?page%5Bsize%5D=100&since=' + encodeURIComponent(seconds)
            : DRLZ + '/api/v1/registrations?filter%5Bstate%5D=current&page%5Bsize%5D=100',
          offset: 0, baselineSince: seconds,
        };
      },
      async page(checkpoint) {
        detailCache = new Map();
        const endpoint = incremental ? 'changes' : 'registrations';
        const url = drlzUrl(checkpoint.url, endpoint);
        const headers = checkpoint.offset === 0 && checkpoint.pollEtag?.url === url
          ? { 'If-None-Match': checkpoint.pollEtag.value } : {};
        const result = await request(url, { headers });
        if (result.response.status === 304) return { records: [], removed: [], next: url, done: true, etag: checkpoint.pollEtag.value };
        const payload = result.body;
        if (!Array.isArray(payload?.data) || (incremental && typeof payload.meta?.has_more !== 'boolean')) {
          throw new Error('Unexpected DRLZ page schema');
        }
        const next = payload.links?.next ? drlzUrl(payload.links.next, endpoint) : null;
        const done = incremental ? !payload.meta.has_more : next === null;
        if ((incremental && !next) || (!done && next === url)) throw new Error('Missing or cyclic DRLZ cursor');
        const removed = incremental ? payload.meta.removed ?? [] : [];
        if (!Array.isArray(removed) || removed.some((id) => typeof id !== 'string')) throw new Error('Invalid DRLZ removal list');
        return { records: payload.data, removed, next, done, etag: result.response.headers.get('ETag') };
      },
      materialize: enrich,
    };
  }

  if (!['osm', 'nszu', 'local'].includes(name)) throw new Error('Choose drlz, osm, nszu or local');
  if (options.mode || options.since) throw new Error('--mode and --since are only supported for DRLZ');
  if (options.file && (options.bbox || options['overpass-url'])) throw new Error('Use either a file or online Overpass options');
  if (name !== 'osm' && !options.file) throw new Error('A CSV file is required');
  if (name === 'osm' && (options.mapping || options.delimiter)) throw new Error('CSV options are unavailable for OSM JSON');
  if (options.delimiter && ![',', ';', 'tab'].includes(options.delimiter)) throw new Error('Use comma, semicolon or tab as the CSV delimiter');
  if (options.file) {
    const input = await readBounded(options.file);
    const mapping = options.mapping ? JSON.parse(await readBounded(options.mapping)) : {
      externalId: 'external_id', name: 'name',
    };
    const rejected = [];
    const records = name === 'osm' ? parseOverpass(JSON.parse(input)) : parsePharmacyCsv(
      input, mapping, options.delimiter === 'tab' ? '\t' : options.delimiter,
      (error) => rejected.push(error),
    );
    const fileScope = 'file:' + hash(input + '\0' + JSON.stringify(mapping) + '\0' + (options.delimiter ?? ''));
    return {
      source: name.toUpperCase(), scope: fileScope, isDrlz: false,
      start: () => ({ offset: 0 }),
      page: async () => ({ records, rejected, removed: [], next: null, done: true }),
      materialize: async (row) => row,
    };
  }

  const bounds = options.ukraine ? undefined : bbox(options.bbox);
  const url = new URL(options['overpass-url'] ?? (process.env.CATALOG_OVERPASS_URL || 'https://overpass-api.de/api/interpreter'));
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Overpass URL must be an HTTPS endpoint');
  const query = options.ukraine
    ? '[out:json][timeout:75];area["ISO3166-1"="UA"]["admin_level"="2"]->.ua;nwr["amenity"="pharmacy"](area.ua);out center meta;'
    : '[out:json][timeout:20];nwr["amenity"="pharmacy"](' + bounds + ');out center meta;';
  const request = requestFactory({ interval: 2500, timeout: options.ukraine ? 90_000 : 25_000,
    userAgent: process.env.CATALOG_USER_AGENT ?? 'PharmeBalance-catalog/1.0' });
  let records;
  let snapshot;
  return {
    source: 'OSM', scope: url.href + '|' + (bounds ?? 'UA'), isDrlz: false,
    start: () => ({ offset: 0 }),
    async page() {
      if (!records) {
        const { body } = await request(url.href, { method: 'POST', body: new URLSearchParams({ data: query }) });
        const parsed = parseOverpass(body).sort((a, b) => a.externalId.localeCompare(b.externalId));
        if (options['save-snapshot']) {
          if (!parsed.length) throw new Error('Overpass returned no pharmacies; no snapshot was saved');
          snapshot = JSON.stringify(body);
          if (Buffer.byteLength(snapshot) > snapshotLimit) throw new Error('Snapshot exceeds 64 MiB; use smaller areas');
        }
        records = parsed;
      }
      return { records, removed: [], next: null, done: true, etag: hash(JSON.stringify(canonical(records))) };
    },
    async saveSnapshot() {
      if (!snapshot) throw new Error('No validated OSM snapshot available');
      await writeFile(options['save-snapshot'], snapshot, { encoding: 'utf8', flag: 'wx' });
    },
    materialize: async (row) => row,
  };
}

module.exports = { makeSource };
