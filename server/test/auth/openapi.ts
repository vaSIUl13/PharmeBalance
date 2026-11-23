import assert = require('node:assert/strict');

export async function verifyOpenApi(baseUrl: string) {
  const docs = await fetch(baseUrl + '/docs');
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /swagger-ui/);
  const specResponse = await fetch(baseUrl + '/openapi.json');
  assert.equal(specResponse.status, 200);
  const spec = await specResponse.json();
  for (const route of ['stocks', 'sales']) {
    const form = spec.paths['/api/v1/imports/' + route].post.requestBody.content['multipart/form-data'].schema;
    assert.equal(form.properties.file.format, 'binary');
    assert(form.required.includes('pharmacyId'));
  }
  for (const path of ['/roles', '/users', '/audit', '/pharmacies']) {
    assert.ok(spec.paths['/api/v1' + path].get);
  }
  assert.ok(spec.paths['/api/v1/users'].post.requestBody);
  assert.ok(spec.paths['/api/v1/users/{id}'].patch.requestBody);
  assert.ok(spec.paths['/api/v1/pharmacies/{id}'].get);
  assert.deepEqual(spec.paths['/api/v1/auth/login'].post.security, []);
  assert.deepEqual(spec.paths['/api/v1/health'].get.security, []);
  assert.deepEqual(spec.security, [{ '__Host-pharme-session': [] }]);
}
