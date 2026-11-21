const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculate, classifyPharmacy, basePolicy: p, dayMs } = require('../dist/modules/forecasts/forecast-model');
const { simulate } = require('../scripts/catalog/demo.cjs');
const cutoff = new Date('2026-11-20');
const stock = { stockId: 1, quantity: 15, msl: 3, maxLevel: 12 };
const history = (demand = () => 1) => Array.from({ length: 90 }, (_, i) => ({
  saleDate: new Date(+cutoff - (89-i)*dayMs), quantity: demand(i), cents: 100n, returnedQuantity: 0, stockout: false,
}));
const result = (days, fields={}) => calculate({ ...stock, ...fields }, days, cutoff, p);

test('constant and weekly demand, holdout without lookahead, zero demand', () => {
  const r = result(history());
  assert.deepEqual([r.predictedDemand, r.shortageProbability, r.shortage, r.currentSurplus, r.projectedSurplus, r.xyzClass],
    [14, 1, 2, 3, 0, 'X']);
  const season = i => i % 7 < 5 ? 3 : 1;
  const rows = history(season);
  const heldOut = Array.from({length:14}, (_, i) => season(90+i)).reduce((a,b)=>a+b,0);
  rows.push({ ...rows[0], saleDate: new Date(+cutoff + dayMs), quantity: 9000 });
  const weekly = result(rows);
  assert.equal(weekly.predictedDemand, heldOut);
  assert.equal(weekly.shortageProbability, Number(stock.quantity-heldOut < stock.msl));
  const none = result(history(()=>0));
  assert.deepEqual([none.predictedDemand, none.xyzClass, none.projectedSurplus], [0, null, 3]);
});

test('missing observations, censored demand and insufficient windows remain explicit', () => {
  const rows = history();
  assert.equal(result(rows.slice(1)).predictedDemand, null);
  for(let i=0;i<90;i+=7) rows[i].stockout=true;
  const censored = result(rows);
  assert.equal(censored.predictedDemand, null);
  assert.equal(censored.quality.reason, 'INSUFFICIENT_WINDOWS');
  assert.equal(censored.quality.censoredDays, 13);
  const gaps = result(history().filter((_, i) => i%7 !== 1));
  assert.equal(gaps.shortageProbability, null);
  assert.equal(result(history().map(s=>({...s,stockout:null}))).quality.unknownAvailabilityDays,90);
});

test('ABC uses net cents, prior cumulative share and complete pharmacy turnover', () => {
  const rows=[80,15,5].map((n,i)=>result(history(()=>n),{stockId:i+1}));
  classifyPharmacy(rows,p);
  assert.deepEqual(rows.map(r=>r.abcClass), ['A','B','C']);
  assert.equal(result(history().map(s=>({...s,returnedQuantity:1}))).turnover,0n);
  const missing = result(history().map(s=>({...s,cents:null})));
  const incomplete = [result(history()), missing];
  classifyPharmacy(incomplete,p);
  assert(incomplete.every(r=>r.abcClass===null && r.quality.abcReason==='INCOMPLETE_TURNOVER'));
});

test('XYZ uses population CV and empirical probabilities include all valid windows', () => {
  for(const [amplitude, expected] of [[1,'X'],[2,'Y'],[3,'Z']]){
    const r=result(history(i=>10+(i%2?amplitude:-amplitude)));
    assert.equal(r.quality.cv,amplitude/10);
    assert.equal(r.xyzClass,expected);
  }
  const r=result(history(i=>i<45?0:4),{quantity:30,msl:5});
  assert(r.shortageProbability>0 && r.shortageProbability<1);
  assert.equal(r.quality.windows,11);
});

test('synthetic temporal holdout reports demand error and shortage calibration', t => {
  let used = 0, absoluteError = 0, brier = 0, probabilities = 0, outcomes = 0;
  for (let sku = 20; sku < 120; sku++) {
    const past = simulate(42, 3, sku, 90, cutoff);
    const extended = simulate(42, 3, sku, 104, new Date(+cutoff + 14*dayMs));
    assert.deepEqual(past.sales, extended.sales.slice(0,90));
    const forecast = result(past.sales.map(s=>({...s, returnedQuantity:0, cents:100n, stockout:s.quantity<s.demand})), past);
    if (forecast.predictedDemand === null) continue;
    const actual = extended.sales.slice(90).reduce((n,s)=>n+s.demand,0);
    const event = Number(past.quantity-actual < past.msl);
    absoluteError += Math.abs(actual-forecast.predictedDemand);
    brier += (event-forecast.shortageProbability)**2;
    probabilities += forecast.shortageProbability;
    outcomes += event;
    used++;
  }
  assert(used > 0);
  t.diagnostic(JSON.stringify({used, mae:absoluteError/used, brier:brier/used,
    meanProbability:probabilities/used, observedFrequency:outcomes/used}));
});
