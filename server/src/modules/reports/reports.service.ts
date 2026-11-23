import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Principal } from '../auth/auth.service';
import { reportFile, type Report } from './report-format';

type Counts = { [K in keyof Report['totals']]: bigint };
const timeZone = 'Europe/Kyiv';

@Injectable()
export class ReportsService {
  constructor(private readonly db: PrismaService) {}

  private async scope(user: Principal, pharmacyId?: number) {
    if (user.role !== 'manager' || !user.permissions.includes('STATS_VIEW') ||
        !user.permissions.includes('NETWORK_VIEW')) throw new ForbiddenException();
    const synthetic = new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo');
    if (pharmacyId && !await this.db.pharmacy.findFirst({ where: { pharmacyId, isSynthetic: synthetic }, select: { pharmacyId: true } })) {
      throw new NotFoundException('Pharmacy not found');
    }
    return synthetic;
  }

  async summary(user: Principal, from: string, to: string, pharmacyId?: number): Promise<Report> {
    const synthetic = await this.scope(user, pharmacyId);
    const [row] = await this.db.$queryRaw<Counts[]>`
      WITH bounds AS (
        SELECT ${from}::date::timestamp AT TIME ZONE ${timeZone} AS start_at,
               (${to}::date + 1)::timestamp AT TIME ZONE ${timeZone} AS end_at
      ), runs AS (
        SELECT DISTINCT ON (as_of) id FROM forecast_run
        WHERE synthetic = ${synthetic} AND as_of BETWEEN ${from}::date AND ${to}::date
        ORDER BY as_of, id DESC
      ), positions AS (
        SELECT count(*) FILTER (WHERE f.shortage_probability > 0 OR f.quantity < f.msl) AS shortage_risks,
               count(*) FILTER (WHERE f.current_surplus > 0) AS surplus_positions
        FROM runs JOIN forecast f ON f.run_id = runs.id JOIN stock_item s USING(stock_id)
        JOIN pharmacy p USING(pharmacy_id)
        WHERE p.is_synthetic = ${synthetic} AND (${pharmacyId ?? null}::int IS NULL OR p.pharmacy_id = ${pharmacyId ?? null})
      ), transfers AS (
        SELECT r.recommendation_id, r.created_at FROM recommendation r
        JOIN stock_item d ON d.stock_id = r.donor_stock_id JOIN stock_item s ON s.stock_id = r.recipient_stock_id
        JOIN pharmacy pd ON pd.pharmacy_id = d.pharmacy_id JOIN pharmacy ps ON ps.pharmacy_id = s.pharmacy_id
        WHERE pd.is_synthetic = ${synthetic} AND ps.is_synthetic = ${synthetic}
          AND (${pharmacyId ?? null}::int IS NULL OR ${pharmacyId ?? null} IN (d.pharmacy_id,s.pharmacy_id))
      ), actions AS (
        SELECT count(*) FILTER (WHERE t.code = 'CONFIRM') AS confirmed,
               count(*) FILTER (WHERE t.code = 'DISPATCH') AS dispatched,
               count(*) FILTER (WHERE t.code = 'RECEIVE') AS completed,
               coalesce(sum(a.quantity) FILTER (WHERE t.code = 'RECEIVE'), 0) AS moved_units
        FROM recommendation_action a JOIN action_type t USING(action_type_id)
        JOIN transfers USING(recommendation_id), bounds b
        WHERE a.action_time >= b.start_at AND a.action_time < b.end_at
      )
      SELECT p.shortage_risks AS "shortageRisks", p.surplus_positions AS "surplusPositions",
             (SELECT count(*) FROM transfers t, bounds b WHERE t.created_at >= b.start_at AND t.created_at < b.end_at) AS recommendations,
             a.confirmed, a.dispatched, a.completed, a.moved_units AS "movedUnits"
      FROM positions p CROSS JOIN actions a`;
    return { period: { from, to, timeZone }, pharmacyId: pharmacyId ?? null, totals: {
      shortageRisks: Number(row.shortageRisks), surplusPositions: Number(row.surplusPositions),
      recommendations: Number(row.recommendations), confirmed: Number(row.confirmed), dispatched: Number(row.dispatched),
      completed: Number(row.completed), movedUnits: Number(row.movedUnits),
    } };
  }

  async timeline(user: Principal, from: string, to: string, pharmacyId?: number) {
    const synthetic = await this.scope(user, pharmacyId);
    const rows = await this.db.$queryRaw<{ day: string; shortageRisks: bigint; surplusPositions: bigint;
      recommendations: bigint; confirmed: bigint; dispatched: bigint; completed: bigint; movedUnits: bigint }[]>`
      WITH bounds AS (
        SELECT ${from}::date::timestamp AT TIME ZONE ${timeZone} AS start_at,
               (${to}::date + 1)::timestamp AT TIME ZONE ${timeZone} AS end_at
      ), days AS (
        SELECT g.d::date AS day FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS g(d)
      ), runs AS (
        SELECT DISTINCT ON (as_of) id, as_of FROM forecast_run
        WHERE synthetic = ${synthetic} AND as_of BETWEEN ${from}::date AND ${to}::date
        ORDER BY as_of, id DESC
      ), positions AS (
        SELECT runs.as_of AS day,
               count(*) FILTER (WHERE f.shortage_probability > 0 OR f.quantity < f.msl) AS shortage_risks,
               count(*) FILTER (WHERE f.current_surplus > 0) AS surplus_positions
        FROM runs JOIN forecast f ON f.run_id = runs.id JOIN stock_item s USING(stock_id)
        JOIN pharmacy p USING(pharmacy_id)
        WHERE p.is_synthetic = ${synthetic} AND (${pharmacyId ?? null}::int IS NULL OR p.pharmacy_id = ${pharmacyId ?? null})
        GROUP BY runs.as_of
      ), transfers AS (
        SELECT r.recommendation_id, (r.created_at AT TIME ZONE ${timeZone})::date AS created_day FROM recommendation r
        JOIN stock_item d ON d.stock_id = r.donor_stock_id JOIN stock_item s ON s.stock_id = r.recipient_stock_id
        JOIN pharmacy pd ON pd.pharmacy_id = d.pharmacy_id JOIN pharmacy ps ON ps.pharmacy_id = s.pharmacy_id
        WHERE pd.is_synthetic = ${synthetic} AND ps.is_synthetic = ${synthetic}
          AND (${pharmacyId ?? null}::int IS NULL OR ${pharmacyId ?? null} IN (d.pharmacy_id,s.pharmacy_id))
      ), created AS (
        SELECT created_day AS day, count(*) AS n FROM transfers GROUP BY created_day
      ), actions AS (
        SELECT (a.action_time AT TIME ZONE ${timeZone})::date AS day,
               count(*) FILTER (WHERE t.code = 'CONFIRM') AS confirmed,
               count(*) FILTER (WHERE t.code = 'DISPATCH') AS dispatched,
               count(*) FILTER (WHERE t.code = 'RECEIVE') AS completed,
               coalesce(sum(a.quantity) FILTER (WHERE t.code = 'RECEIVE'), 0) AS moved_units
        FROM recommendation_action a JOIN action_type t USING(action_type_id)
        JOIN transfers USING(recommendation_id), bounds b
        WHERE a.action_time >= b.start_at AND a.action_time < b.end_at
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             coalesce(p.shortage_risks, 0) AS "shortageRisks", coalesce(p.surplus_positions, 0) AS "surplusPositions",
             coalesce(c.n, 0) AS recommendations, coalesce(a.confirmed, 0) AS confirmed,
             coalesce(a.dispatched, 0) AS dispatched, coalesce(a.completed, 0) AS completed,
             coalesce(a.moved_units, 0) AS "movedUnits"
      FROM days d LEFT JOIN positions p ON p.day = d.day LEFT JOIN created c ON c.day = d.day
      LEFT JOIN actions a ON a.day = d.day ORDER BY d.day`;
    return { period: { from, to, timeZone }, pharmacyId: pharmacyId ?? null, points: rows.map(row => ({
      day: row.day, shortageRisks: Number(row.shortageRisks), surplusPositions: Number(row.surplusPositions),
      recommendations: Number(row.recommendations), confirmed: Number(row.confirmed), dispatched: Number(row.dispatched),
      completed: Number(row.completed), movedUnits: Number(row.movedUnits),
    })) };
  }

  async export(user: Principal, from: string, to: string, pharmacyId: number | undefined, format: 'csv' | 'xlsx') {
    const report = await this.summary(user, from, to, pharmacyId);
    const file = await reportFile(report, format);
    await this.db.auditLog.create({ data: { userId: user.userId, eventType: 'REPORT_EXPORTED',
      details: [from, to, format, pharmacyId ?? 'network'].join(' ') } });
    return file;
  }
}
