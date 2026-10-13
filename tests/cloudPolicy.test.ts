import test from 'node:test';
import assert from 'node:assert/strict';
import { bindingMatches, publicCloudConfig, verifiedOwner } from '../src/lib/cloudPolicy';

test('browser configuration rejects secret keys and insecure URLs', () => {
  const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
  assert.equal(publicCloudConfig('', ''), false);
  assert.equal(publicCloudConfig('https://example.com', 'sb_secret_dummy'), false);
  assert.equal(publicCloudConfig('https://example.com', jwt('service_role')), false);
  assert.equal(publicCloudConfig('https://example.com', jwt('authenticated')), false);
  assert.equal(publicCloudConfig('http://example.com', jwt('anon')), false);
  assert.equal(publicCloudConfig('https://user:pass@example.com', jwt('anon')), false);
  assert.equal(publicCloudConfig('https://example.com', jwt('anon')), true);
  assert.equal(publicCloudConfig('https://example.com', 'sb_publishable_dummy_public_key'), true);
});
test('local binding rejects another user or project', () => {
  const binding = { userId: 'dummy-owner', projectOrigin: 'https://example.com' };
  assert.equal(bindingMatches(binding, 'dummy-owner', 'https://example.com'), true);
  assert.equal(bindingMatches(binding, 'other', 'https://example.com'), false);
  assert.equal(bindingMatches(binding, 'dummy-owner', 'https://other.example.com'), false);
  assert.equal(bindingMatches(null, 'dummy-owner', 'https://example.com'), false);
});
test('unauthenticated user is rejected before ownership lookup', async () => {
  let calls = 0;
  await assert.rejects(verifiedOwner(async () => undefined, async () => { calls++; return true; }));
  assert.equal(calls, 0);
});
test('only verified server owner may proceed; offline fails closed', async () => {
  await assert.rejects(verifiedOwner(async () => 'other', async () => false));
  await assert.rejects(verifiedOwner(async () => 'owner', async () => { throw new Error('offline'); }));
  assert.equal(await verifiedOwner(async () => 'owner', async () => true), 'owner');
});
