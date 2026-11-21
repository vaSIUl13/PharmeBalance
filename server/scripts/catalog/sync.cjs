const { parseArgs } = require('node:util');
const { readFile, stat } = require('node:fs/promises');
const { PrismaClient, Prisma } = require('@prisma/client');
const {
  DRLZ, hash, parseDrlz, parseOverpass, parsePharmacyCsv, drlzUrl, createHttpClient,
} = require('./adapters.cjs');

const lease = () => new Date(Date.now() + 10 * 60_000);
const counts = () => ({ seen: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, rejected: 0, removed: 0 });
const safeError = (error) => error.message.replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/g, '[URL]').slice(0, 500);

async function readBounded(file) {
  if ((await stat(file)).size > 64 * 1024 * 1024) throw new Error('Input file exceeds 64 MiB; split it into smaller snapshots');
  return readFile(file, 'utf8');
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed(6);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function equal(current, incoming) {
  const existing = Object.fromEntries(Object.keys(incoming).map((key) => [key, current[key]]));
  return JSON.stringify(canonical(existing)) === JSON.stringify(canonical(incoming));
}

function bbox(value) {
  const parts = value?.split(',');
  const coords = parts?.map(Number);
  if (coords?.length !== 4 || parts.some((part) => !part.trim()) || !coords.every(Number.isFinite)) {
    throw new Error('Provide --bbox south,west,north,east');
  }
  const [s, w, n, e] = coords;
  if (s < -90 || n > 90 || w < -180 || e > 180 || n <= s || e <= w || n - s > 1 || e - w > 1) {
    throw new Error('Overpass bounding box must be valid and at most 1Р вЂ™Р’В° by 1Р вЂ™Р’В°');
  }
  return coords.join(',');
}

async function makeSource(name, options, requestFactory = createHttpClient) {
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

  const bounds = bbox(options.bbox);
  const url = new URL(options['overpass-url'] ?? 'https://overpass-api.de/api/interpreter');
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Overpass URL must be an HTTPS endpoint');
  const query = '[out:json][timeout:20];nwr["amenity"="pharmacy"](' + bounds + ');out center meta;';
  const request = requestFactory({ interval: 2500, userAgent: process.env.CATALOG_USER_AGENT ?? 'PharmeBalance-catalog/1.0' });
  let records;
  return {
    source: 'OSM', scope: url.href + '|' + bounds, isDrlz: false,
    start: () => ({ offset: 0 }),
    async page() {
      records ??= parseOverpass((await request(url.href, {
        method: 'POST', body: new URLSearchParams({ data: query }),
      })).body).sort((a, b) => a.externalId.localeCompare(b.externalId));
      return { records, removed: [], next: null, done: true, etag: hash(JSON.stringify(canonical(records))) };
    },
    materialize: async (row) => row,
  };
}

async function writeRecord(db, adapter, row, apply) {
  const delegate = adapter.isDrlz ? db.drugRegistration : db.externalPharmacy;
  const data = adapter.isDrlz ? row : { ...row, source: adapter.source };
  const where = adapter.isDrlz ? { number: row.number } : {
    source_externalId: { source: adapter.source, externalId: row.externalId },
  };
  const existing = await delegate.findUnique({ where });
  if (existing && ((existing.sourceModifiedAt && data.sourceModifiedAt && existing.sourceModifiedAt > data.sourceModifiedAt) ||
      equal(existing, data))) return 'unchanged';
  if (existing && adapter.isDrlz && existing.sourceId !== row.sourceId) throw new Error('DRLZ registration number maps to two source identifiers');
  if (apply) await delegate.upsert({ where, create: data, update: { ...data, syncedAt: new Date() } });
  return existing ? 'updated' : 'created';
}

async function claim(db, adapter, options, startedAt) {
  const { source, scope } = adapter;
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${'catalog:' + source})) AS locked`;
    if (!locked[0].locked) throw new Error('Another catalog process is starting for this source');
    await tx.catalogSyncRun.updateMany({
      where: { source, status: 'RUNNING', leaseUntil: { lte: startedAt } },
      data: { status: 'FAILED', finishedAt: startedAt, error: 'Expired worker lease' },
    });
    if (await tx.catalogSyncRun.findFirst({ where: { source, status: 'RUNNING' } })) throw new Error('Another sync is running for this source');
    const previous = await tx.catalogSyncRun.findFirst({ where: { source, scope }, orderBy: { startedAt: 'desc' } });
    let checkpoint;
    if (options.resume) {
      if (!previous || !['FAILED', 'PAUSED'].includes(previous.status)) throw new Error('No unfinished sync for these options');
      checkpoint = previous.checkpoint;
    } else if (adapter.incremental && !adapter.explicitSince) {
      const last = await tx.catalogSyncRun.findFirst({ where: { source, scope, status: 'SUCCEEDED' }, orderBy: { startedAt: 'desc' } });
      if (last) checkpoint = last.checkpoint;
      else {
        const initial = await tx.catalogSyncRun.findFirst({
          where: { source, scope: 'initial', status: 'SUCCEEDED' }, orderBy: { startedAt: 'desc' },
        });
        if (!initial) throw new Error('Incremental sync requires a completed initial run or explicit --since');
        checkpoint = adapter.start(initial.checkpoint.baselineSince);
      }
    } else checkpoint = adapter.start(adapter.explicitSince ?? startedAt.toISOString());
    return tx.catalogSyncRun.create({ data: { source, scope, status: 'RUNNING', checkpoint, counters: counts(), leaseUntil: lease() } });
  });
}

async function commit(db, run, work) {
  if (!run) return work(db);
  return db.$transaction(async (tx) => {
    const owned = await tx.catalogSyncRun.updateMany({
      where: { id: run.id, status: 'RUNNING', leaseUntil: { gt: new Date() } },
      data: { leaseUntil: lease() },
    });
    if (!owned.count) throw new Error('Sync lease expired. Resume from the saved checkpoint.');
    return work(tx);
  });
}

async function synchronize(db, adapter, options = {}) {
  const run = options.apply ? await claim(db, adapter, options, new Date()) : null;
  let checkpoint = run?.checkpoint ?? adapter.start(adapter.explicitSince ?? new Date().toISOString());
  const counters = counts();
  const seen = new Map();
  const errors = [];
  const limit = options.limit ?? Infinity;
  let status = 'SUCCEEDED';
  try {
    for (;;) {
      const page = await adapter.page(checkpoint);
      const offset = checkpoint.offset ?? 0;
      const fingerprint = page.etag ?? hash(JSON.stringify(canonical([page.records, page.removed])));
      if (offset > page.records.length) throw new Error('Source page changed during resume; rerun from a fresh snapshot');
      if (offset > 0 && checkpoint.pageEtag && fingerprint !== checkpoint.pageEtag) {
        throw new Error('Source page changed during resume; rerun from a fresh snapshot');
      }
      if (!adapter.isDrlz) {
        const identities = new Map();
        for (const [index, row] of page.records.entries()) {
          const signature = JSON.stringify(canonical(row));
          if (identities.has(row.externalId) && identities.get(row.externalId) !== signature) {
            throw new Error('Conflicting records for external id ' + row.externalId);
          }
          identities.set(row.externalId, signature);
          if (index < offset) seen.set(row.externalId, signature);
        }
      }
      for (let index = offset; index < page.records.length; index++) {
        if (counters.seen >= limit) break;
        const row = await adapter.materialize(page.records[index]);
        const key = adapter.isDrlz ? row.number : row.externalId;
        const signature = adapter.isDrlz ? undefined : JSON.stringify(canonical(row));
        const duplicate = seen.get(key);
        const next = { ...checkpoint, offset: index + 1, pageEtag: fingerprint };
        await commit(db, run, async (tx) => {
          const outcome = duplicate === signature && !adapter.isDrlz ? 'duplicates' : await writeRecord(tx, adapter, row, Boolean(run));
          const stats = { ...counters, seen: counters.seen + 1, [outcome]: counters[outcome] + 1 };
          if (run) await tx.catalogSyncRun.update({ where: { id: run.id }, data: { checkpoint: next, counters: stats } });
          Object.assign(counters, stats);
        });
        if (!adapter.isDrlz) seen.set(key, signature);
        checkpoint = next;
      }
      const processed = checkpoint.offset >= page.records.length;
      if (!processed) { status = 'PAUSED'; break; }
      const next = adapter.isDrlz ? {
        url: page.next ?? checkpoint.url, offset: 0, baselineSince: checkpoint.baselineSince,
        ...(page.done && page.next === checkpoint.url && page.etag ? { pollEtag: { url: page.next, value: page.etag } } : {}),
      } : checkpoint;
      await commit(db, run, async (tx) => {
        const stats = { ...counters, rejected: counters.rejected + (page.rejected?.length ?? 0) };
        if (page.removed.length) {
          const where = { versionId: { in: page.removed }, removedAt: null };
          stats.removed += run
            ? (await tx.drugRegistration.updateMany({ where, data: { removedAt: new Date(), isCurrent: false } })).count
            : await tx.drugRegistration.count({ where });
        }
        if (run) await tx.catalogSyncRun.update({ where: { id: run.id }, data: { checkpoint: next, counters: stats } });
        Object.assign(counters, stats);
      });
      errors.push(...(page.rejected ?? []).slice(0, Math.max(0, 10 - errors.length)));
      checkpoint = next;
      if (page.done) break;
      if (counters.seen >= limit) { status = 'PAUSED'; break; }
    }
    if (run) await commit(db, run, (tx) => tx.catalogSyncRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), counters, ...(errors.length ? { error: JSON.stringify(errors).slice(0, 500) } : {}) },
    }));
    return { runId: run?.id, source: adapter.source, mode: run ? 'apply' : 'dry-run', status, ...counters, errors };
  } catch (error) {
    if (run) await db.catalogSyncRun.updateMany({
      where: { id: run.id, status: 'RUNNING' },
      data: { status: 'FAILED', finishedAt: new Date(), error: safeError(error) },
    });
    throw error;
  }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    mode: { type: 'string' }, since: { type: 'string' }, file: { type: 'string' }, mapping: { type: 'string' },
    delimiter: { type: 'string' }, bbox: { type: 'string' }, 'overpass-url': { type: 'string' },
    limit: { type: 'string' }, 'dry-run': { type: 'boolean' }, apply: { type: 'boolean' }, resume: { type: 'boolean' },
  } });
  if (positionals.length !== 1 || (values.apply && values['dry-run']) || (values.resume && !values.apply)) {
    throw new Error('Choose one source and one mode; --resume requires --apply');
  }
  const limit = values.limit === undefined ? (values.apply ? Infinity : 20) : Number(values.limit);
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  if (values.limit !== undefined && limit === Infinity) throw new Error('--limit must be finite');
  const adapter = await makeSource(positionals[0], values);
  const db = new PrismaClient();
  try {
    const result = await synchronize(db, adapter, { ...values, limit });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error(safeError(error)); process.exitCode = 1; });
module.exports = { makeSource, synchronize };
