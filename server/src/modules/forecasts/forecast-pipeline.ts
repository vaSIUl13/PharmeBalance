import type { PrismaClient } from '@prisma/client';
import { generateRecommendations } from '../recommendations/generate';
import type { Policy } from './forecast-model';
import { calculateRun } from './forecast-run';

export async function runForecastPipeline(db: PrismaClient, asOf: Date, synthetic: boolean, policy?: Policy) {
  const forecast = await calculateRun(db, asOf, synthetic, policy);
  const recommendations = await db.$transaction(
    tx => generateRecommendations(tx, forecast.runId, synthetic),
    { timeout: 120_000 },
  );
  return { ...forecast, recommendations };
}
