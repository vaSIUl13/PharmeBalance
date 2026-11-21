const { createHash } = require('node:crypto');
const { parse } = require('csv-parse/sync');
const { setTimeout: sleep } = require('node:timers/promises');

const DRLZ = 'https://drlz.com.ua';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalize = (value) => (clean(String(value ?? '')) ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const date = (value) => {
  if (!value) return null;
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error('Invalid source date');
  return result;
};
const packageFields = ['form', 'dose', 'primary', 'quantity', 'secondary', 'primary_count', 'secondary_count'];

function packageKey(value) {
  return hash(JSON.stringify(packageFields.map((key) => normalize(value[key]))));
}

function normalizeRegistration(number) {
  const normalized = clean(number)?.toUpperCase();
  if (!normalized || !/^[A-Z0-9]+(?:\/[A-Z0-9]+)+$/.test(normalized)) throw new Error('Invalid DRLZ registration number');
  return normalized;
}

function parseDrlz(summary, version) {
  const attributes = summary?.attributes;
  const detail = version?.attributes;
  if (!attributes || !detail || !clean(summary.id) || !clean(version.id) || !Array.isArray(detail.packages)) {
    throw new Error('Invalid DRLZ registration or version record');
  }
  const number = normalizeRegistration(attributes.number);
  if (detail.number && normalizeRegistration(detail.number) !== number) throw new Error('DRLZ version belongs to another registration');
  const name = clean(detail.title) ?? clean(attributes.title);
  if (!name || typeof attributes.is_current !== 'boolean') throw new Error('Missing DRLZ title or current status');
  const atc = detail.atc_codes ?? attributes.atc_codes ?? [];
  const manufacturers = detail.manufacturers ?? attributes.manufacturers ?? [];
  if (!Array.isArray(atc) || atc.some((code) => !clean(code)) ||
      !Array.isArray(manufacturers) || manufacturers.some((item) => !item || !clean(item.name))) {
    throw new Error('Invalid ATC or manufacturers');
  }
  const packages = new Map();
  for (const item of detail.packages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid DRLZ package');
    const key = packageKey(item);
    if (!packages.has(key)) packages.set(key, { ...item, key });
  }
  return {
    number, sourceId: summary.id, versionId: version.id, name,
    inn: clean(detail.inn ?? attributes.inn), form: clean(detail.form ?? attributes.form),
    composition: clean(detail.composition ?? attributes.composition),
    atcCodes: [...new Set(atc.map((code) => code.trim().toUpperCase()))].sort(),
    manufacturers, packages: [...packages.values()],
    isCurrent: attributes.is_current, validFrom: date(attributes.valid_from), validTo: date(attributes.valid_to),
    sourceModifiedAt: date(attributes.last_modified_at ?? detail.modified_at),
    removedAt: null,
  };
}

function coordinates(lat, lon) {
  if (lat == null || lon == null || lat === '' || lon === '') return { latitude: null, longitude: null };
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Invalid pharmacy coordinates');
  }
  return { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) };
}

function parseOverpass(payload) {
  if (payload?.remark || !Array.isArray(payload?.elements)) throw new Error('Incomplete or invalid Overpass response');
  return payload.elements.map((item) => {
    if (!item || !['node', 'way', 'relation'].includes(item.type) || !Number.isSafeInteger(item.id) || item.id <= 0) {
      throw new Error('Invalid OSM object identity');
    }
    if (item.tags?.amenity !== 'pharmacy') throw new Error('OSM object is outside pharmacy query');
    const tags = item.tags;
    const coords = coordinates(item.type === 'node' ? item.lat : item.center?.lat, item.type === 'node' ? item.lon : item.center?.lon);
    return {
      externalId: item.type + ':' + item.id,
      name: clean(tags.name ?? tags.brand),
      city: clean(tags['addr:city'] ?? tags['addr:place']),
      address: clean(tags['addr:full']) ?? clean([clean(tags['addr:street']), clean(tags['addr:housenumber'])].filter(Boolean).join(' ')),
      ...coords,
      coordinateQuality: coords.latitude === null ? null : item.type === 'node' ? 'POINT' : 'CENTER',
      sourceModifiedAt: date(item.timestamp ?? payload.osm3s?.timestamp_osm_base),
    };
  });
}

function parsePharmacyCsv(input, columns, delimiter = ',', onReject) {
  if (!columns || !clean(columns.externalId) || !clean(columns.name) || Boolean(columns.latitude) !== Boolean(columns.longitude)) {
    throw new Error('CSV mapping requires externalId and name, plus both coordinate columns when used');
  }
  const mandatory = Object.values(columns).filter(Boolean);
  let sawHeader = false;
  const records = parse(input, {
    bom: true, delimiter, skip_empty_lines: true, max_record_size: 1_000_000,
    columns(headers) {
      sawHeader = true;
      const trimmed = headers.map((header) => header.trim());
      if (new Set(trimmed).size !== trimmed.length || mandatory.some((column) => !trimmed.includes(column))) {
        throw new Error('CSV contains duplicate or missing mapped columns');
      }
      return trimmed;
    },
  });
  if (!sawHeader) throw new Error('CSV has no header');
  const result = [];
  records.forEach((record, index) => {
    try {
      const externalId = clean(record[columns.externalId]);
      if (!externalId || externalId.length > 200) throw new Error('Invalid pharmacy external id');
      const coords = coordinates(clean(record[columns.latitude]), clean(record[columns.longitude]));
      result.push({
        externalId, name: clean(record[columns.name]), city: clean(record[columns.city]), address: clean(record[columns.address]),
        ...coords, coordinateQuality: coords.latitude === null ? null : 'REPORTED',
        sourceModifiedAt: date(clean(record[columns.updatedAt])),
      });
    } catch (error) {
      if (!onReject) throw error;
      onReject({ record: index + 1, message: error.message });
    }
  });
  return result;
}

function drlzUrl(value, endpoint) {
  const url = new URL(value, DRLZ);
  if (url.origin !== DRLZ || url.username || url.password || url.hash || url.pathname !== '/api/v1/' + endpoint) {
    throw new Error('Unexpected DRLZ pagination URL');
  }
  return url.href;
}

function createHttpClient({ interval, headers = {}, timeout = 25000, userAgent = 'PharmeBalance-catalog/1.0' }) {
  let lastRequest = 0;
  return async function request(url, options = {}) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(Math.max(0, lastRequest + interval - Date.now()));
      lastRequest = Date.now();
      let response;
      let error;
      try {
        response = await fetch(url, {
          ...options, redirect: 'error', signal: AbortSignal.timeout(timeout),
          headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers, ...options.headers },
        });
        if (response.status === 304) return { response, body: null };
        if (response.ok) return { response, body: await response.json() };
        error = new Error('HTTP ' + response.status + ' from ' + new URL(url).hostname);
        error.status = response.status;
        await response.body?.cancel();
        if (response.status !== 429 && response.status < 500) throw error;
      } catch (caught) {
        if ((caught.status && caught.status < 500 && caught.status !== 429) || caught instanceof SyntaxError) throw caught;
        error = caught;
      }
      if (attempt === 3) throw error;
      const retry = response?.headers.get('Retry-After');
      const wait = retry == null ? 0 : /^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
      if (wait > 60_000) throw new Error('Source Retry-After exceeds 60 seconds. Resume the sync later.');
      await sleep(Math.max(wait || 0, 1000 * 2 ** attempt + Math.random() * 400));
    }
  };
}

module.exports = { DRLZ, hash, clean, normalizeRegistration, parseDrlz, parseOverpass, parsePharmacyCsv, packageKey, drlzUrl, createHttpClient };
