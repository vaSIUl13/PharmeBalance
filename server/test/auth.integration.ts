import 'reflect-metadata';
import { test } from 'node:test';
import { createFixture } from './auth/fixture';
import { verifyOpenApi } from './auth/openapi';
import { testSignIn } from './auth/sign-in';
import { testAdministration } from './auth/administration';
import { testInventory } from './auth/inventory';
import { testRedistribution } from './auth/redistribution';
import { testRegistration } from './auth/registration';
import { testSessions } from './auth/sessions';

test('auth against PostgreSQL and Redis', async (t) => {
  const fixture = await createFixture(t);
  await verifyOpenApi(fixture.baseUrl);
  const signedIn = { ...fixture, ...await testSignIn(t, fixture) };
  await testRegistration(t, signedIn);
  await testAdministration(t, signedIn);
  const manager = await testInventory(t, signedIn);
  const context = { ...signedIn, manager };
  await testRedistribution(t, context);
  await testSessions(t, context);
});
