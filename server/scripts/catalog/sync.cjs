const { parseArgs } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { PrismaClient } = require('@prisma/client');
const { hash } = require('./adapters.cjs');
const { canonical, equal } = require('./record-values.cjs');
const { makeSource } = require('./sources.cjs');

const lease = () => new Date(Date.now() + 10 * 60_000);
const counts = () => ({ seen: 0, created: 0, updated: 0, unchanged: 0, duplicates: 0, rejected: 0, removed: 0 });
const safeError = (error) => error.message.replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/g, '[URL]').slice(0, 500);

async function writeRecord(db, adapter, row, apply) {
  const delegate = adapter.isDrlz ? db.drugRegistration : db.externalPharmacy;
  const data = adapter.isDrlz ? row : { ...row, source: adapter.source };
  const where = adapter.isDrlz ? { number: row.number } : {
    source_externalId: { source: adapter.source, externalId: row.externalId },
  };
  const existing = await delegate.findUnique({ where });
  if (adapter.source === 'OSM' && existing?.city && !data.city &&
      equal(existing, { latitude: data.latitude, longitude: data.longitude })) data.city = existing.city;
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
    ukraine: { type: 'boolean' }, watch: { type: 'boolean' }, 'save-snapshot': { type: 'string' },
  } });
  if (positionals.length !== 1 || (values.apply && values['dry-run']) || (values.resume && !values.apply)) {
    throw new Error('Choose one source and one mode; --resume requires --apply');
  }
  const limit = values.limit === undefined ? (values.apply ? Infinity : 20) : Number(values.limit);
  if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');
  if (values.limit !== undefined && limit === Infinity) throw new Error('--limit must be finite');
  if (values.watch && (positionals[0] !== 'osm' || !values.ukraine || !values.apply || values.resume || values.limit)) {
    throw new Error('--watch requires osm --ukraine --apply without --resume or --limit');
  }
  if (values['save-snapshot'] !== undefined && (positionals[0] !== 'osm' || !values['dry-run'] ||
      values.file || !values['save-snapshot'].trim())) {
    throw new Error('--save-snapshot requires an online OSM --dry-run and a new output file');
  }
  const db = new PrismaClient();
  try {
    do {
      try {
        const adapter = await makeSource(positionals[0], values);
        const result = await synchronize(db, adapter, { ...values, limit });
        if (values['save-snapshot']) await adapter.saveSnapshot();
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        if (!values.watch) throw error;
        console.error(safeError(error));
      }
      if (values.watch) await delay(24 * 60 * 60 * 1000);
    } while (values.watch);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error(safeError(error)); process.exitCode = 1; });
module.exports = { makeSource, synchronize };
