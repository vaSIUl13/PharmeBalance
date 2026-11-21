const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { publishSnapshot } = require('../dist/modules/forecasts/forecast-run');
const { basePolicy } = require('../dist/modules/forecasts/forecast-model');

test('foreign-source sales are excluded; actual shortage survives insufficient history', async t => {
  const url = process.env.AUTH_TEST_DATABASE_URL;
  assert(url && new URL(url).pathname.endsWith('_test'));
  const db = new PrismaClient({datasourceUrl:url});
  t.after(()=>db.$disconnect());
  const code = randomBytes(6).toString('hex');
  const rollback = new Error('rollback test fixtures');
  await assert.rejects(db.$transaction(async tx => {
    const pharmacy = await tx.pharmacy.create({data:{name:code, code, address:'Test',city:'Test',
      latitude:49,longitude:24,isActive:true,isSynthetic:true}});
    const drug = await tx.drug.create({data:{sku:code,name:code,unit:'box',dosageForm:'tablet'}});
    const user = await tx.userAccount.create({data:{email:code+'@example.invalid',login:code,firstName:'Test',
      lastName:'Test',passwordHash:'disabled',isActive:false,role:{connect:{code:'head'}}}});
    const pharmacyId=pharmacy.pharmacyId;
    await tx.userPharmacy.create({data:{userId:user.userId,pharmacyId}});
    const {stockId}=await tx.stockItem.create({data:{pharmacyId,drugId:drug.drugId,quantity:0,msl:2,maxLevel:4}});
    const batch=await tx.importBatch.create({data:{pharmacyId,uploadedBy:user.userId,dataType:'SALES',sourceFormat:'CSV',
      fileName:'fixture.csv',recordsTotal:1,status:'APPLIED'}});
    const day=new Date('2002-01-01');
    await tx.sale.create({data:{stockId,importId:batch.importId,saleDate:day,quantity:50}});
    const run=await publishSnapshot(tx,day,true,basePolicy);
    const row=await tx.forecast.findUniqueOrThrow({where:{runId_stockId:{runId:run.runId,stockId}},include:{risk:true}});
    assert.equal(row.quality.observedDays,0);
    assert.equal(row.shortageProbability,null);
    assert.equal(row.predictedDemand,null);
    assert.equal(row.risk.positionType,'SHORTAGE');
    assert.equal(row.risk.riskLevel,'HIGH');
    assert.equal((await publishSnapshot(tx,day,true,basePolicy)).reused,true);
    throw rollback;
  },{timeout:30000}),err=>err===rollback);
});
