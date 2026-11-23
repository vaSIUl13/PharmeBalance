const { PrismaClient } = require('@prisma/client');
const { linkSku } = require('./link-sku.cjs');

async function main() {
  const database = new URL(process.env.DEMO_DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_demo')) {
    throw new Error('Use a local _demo database');
  }
  const db = new PrismaClient({ datasourceUrl: database.href });
  try {
    const [pharmacies, external, drugs, registrations] = await Promise.all([
      db.pharmacy.findMany({ where: { isSynthetic: true, code: { startsWith: 'SYN-DEV-' } }, orderBy: { code: 'asc' } }),
      db.externalPharmacy.findMany({ where: { source: 'OSM', name: { not: null }, latitude: { not: null }, longitude: { not: null } },
        orderBy: { externalId: 'asc' } }),
      db.drug.findMany({ where: { sku: { startsWith: 'SYN-DEV-' } }, orderBy: { sku: 'asc' }, take: 12 }),
      db.drugRegistration.findMany({ where: { isCurrent: true, removedAt: null }, orderBy: { number: 'asc' } }),
    ]);
    const unique = new Map(external.map(location => [location.latitude + '/' + location.longitude, location]));
    const locations = [...unique.values()];
    if (pharmacies.length < 3 || locations.length < 3 || !drugs.length) {
      throw new Error('Seed dev inventory and import at least three named OSM pharmacies first');
    }
    const items = [];
    const unlinkedDrugs = drugs.filter(drug => drug.registrationId === null);
    for (const registration of registrations) {
      if (items.length === unlinkedDrugs.length) break;
      const packaging = Array.isArray(registration.packages) && registration.packages.find(item =>
        item.form?.length <= 40 && item.dose?.length <= 40 && (item.primary || item.secondary));
      if (!packaging || registration.name.length > 120) continue;
      const drug = unlinkedDrugs[items.length];
      const existing = await db.drug.findUnique({ where: { registrationId_registrationPackageKey: {
        registrationId: registration.registrationId, registrationPackageKey: packaging.key,
      } } });
      if (existing) continue;
      await linkSku(db, { registration: registration.number, package: packaging.key,
        unit: 'pack', sku: 'DEMO-VALIDATION-' + drug.drugId });
      items.push({ drugId: drug.drugId, registration, packaging });
    }
    if (!items.length && unlinkedDrugs.length === drugs.length) throw new Error('No compatible registered packages found');
    const availableLocations = locations.filter(location => location.pharmacyId === null);
    const links = new Map(locations.filter(location => location.pharmacyId !== null).map(location => [location.pharmacyId, location]));
    const pairs = pharmacies.flatMap(pharmacy => {
      const location = links.get(pharmacy.pharmacyId) ?? availableLocations.shift();
      return location ? [[pharmacy, location]] : [];
    });
    await db.$transaction(async tx => {
      for (const [pharmacy, location] of pairs) {
        await tx.pharmacy.update({ where: { pharmacyId: pharmacy.pharmacyId }, data: {
          name: ('[DEMO] ' + location.name).slice(0, 100), city: (location.city ?? 'Львів').slice(0, 60),
          address: (location.address ?? 'Адреса не вказана в OSM').slice(0, 150),
          latitude: location.latitude, longitude: location.longitude,
        } });
        await tx.externalPharmacy.update({ where: { id: location.id }, data: { pharmacyId: pharmacy.pharmacyId } });
        if (!pharmacy.latitude.equals(location.latitude) || !pharmacy.longitude.equals(location.longitude)) {
          await tx.pharmacyDistance.updateMany({ where: { OR: [{ fromPharmacyId: pharmacy.pharmacyId },
            { toPharmacyId: pharmacy.pharmacyId }] }, data: { isActual: false } });
        }
      }
      for (const { drugId, registration, packaging } of items) {
        await tx.drug.update({ where: { drugId }, data: { name: registration.name, dosageForm: packaging.form,
          strength: packaging.dose, registrationId: registration.registrationId, registrationPackageKey: packaging.key } });
      }
    });
    const registeredSkus = drugs.length - unlinkedDrugs.length + items.length;
    console.log(JSON.stringify({ osmPharmacies: pairs.length, registeredSkus, operationalData: 'synthetic' }));
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL]')); process.exitCode = 1; });
