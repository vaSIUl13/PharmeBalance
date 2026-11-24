const { parseArgs } = require('node:util');
const { PrismaClient } = require('@prisma/client');
const { normalizeRegistration, clean } = require('./adapters.cjs');
const { notifyCatalogAdministrators } = require('./notifications.cjs');

async function linkSku(db, options) {
  const number = normalizeRegistration(options.registration);
  const registration = await db.drugRegistration.findUnique({ where: { number } });
  if (!registration?.isCurrent || registration.removedAt) throw new Error('Current registration not found');
  if (!options.package) {
    return {
      number, packages: registration.packages.map(({ key, form, dose, primary, quantity, secondary, primary_count, secondary_count }) =>
        ({ key, form, dose, primary, quantity, secondary, primary_count, secondary_count })),
    };
  }
  const packaging = registration.packages.find((item) => item.key === options.package);
  if (!packaging || !clean(packaging.form) || !clean(packaging.dose) || (!clean(packaging.primary) && !clean(packaging.secondary))) {
    throw new Error('Package is missing or has no unambiguous form, dose and packaging');
  }
  const sku = clean(options.sku)?.toUpperCase();
  const unit = clean(options.unit);
  const name = clean(options.name) ?? registration.name;
  if (!sku || !/^[A-Z0-9][A-Z0-9._-]{0,29}$/.test(sku) || sku.startsWith('SYN-') ||
      sku === number.replaceAll('/', '-') || !unit || unit.length > 20 || name.length > 120 ||
      packaging.form.length > 40 || packaging.dose.length > 40) {
    throw new Error('Specify a distinct SKU, unit and compatible display name within schema limits');
  }
  const data = { sku, unit, name, dosageForm: packaging.form, strength: packaging.dose,
    registrationId: registration.registrationId, registrationPackageKey: packaging.key };

  async function validate(tx) {
    const existing = await tx.drug.findUnique({ where: { sku } });
    if (existing && (existing.registrationId !== data.registrationId ||
        existing.registrationPackageKey !== data.registrationPackageKey || existing.unit !== unit)) {
      throw new Error('SKU already belongs to a different item or unit');
    }
    const mapped = await tx.drug.findUnique({
      where: { registrationId_registrationPackageKey: {
        registrationId: data.registrationId, registrationPackageKey: data.registrationPackageKey,
      } },
    });
    if (mapped && mapped.sku !== sku) throw new Error('Package already has a SKU: ' + mapped.sku);
    return existing;
  }

  if (!options.apply) return { ...data, status: await validate(db) ? 'unchanged' : 'planned' };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT registration_id FROM drug_registration WHERE registration_id = ${registration.registrationId} FOR UPDATE`;
    const live = await tx.drugRegistration.findUniqueOrThrow({ where: { registrationId: registration.registrationId } });
    if (!live.isCurrent || live.removedAt || !live.packages.some((item) => item.key === packaging.key)) {
      throw new Error('Registration changed. Review packages before retrying.');
    }
    const existing = await validate(tx);
    if (existing) return { sku: existing.sku, status: 'unchanged' };
    const drug = await tx.drug.upsert({ where: {
      registrationId_registrationPackageKey: {
        registrationId: data.registrationId, registrationPackageKey: data.registrationPackageKey,
      },
    }, create: data, update: {} });
    await notifyCatalogAdministrators(tx, 'Додано SKU до довідника', `${drug.name} (${drug.sku}) · реєстрація ${number}.`);
    return { sku: drug.sku, status: 'created' };
  });
}

async function main() {
  const { values } = parseArgs({ options: {
    registration: { type: 'string' }, package: { type: 'string' }, sku: { type: 'string' },
    unit: { type: 'string' }, name: { type: 'string' }, apply: { type: 'boolean' },
  } });
  if (values.apply && !values.package) throw new Error('--apply requires a package key');
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await linkSku(db, values), null, 2)); }
  finally { await db.$disconnect(); }
}

if (require.main === module) main().catch((error) => {
  console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL]'));
  process.exitCode = 1;
});
module.exports = { linkSku };
