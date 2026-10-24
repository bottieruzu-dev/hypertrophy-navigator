import test from 'node:test';
import assert from 'node:assert/strict';
import { consentTarget, loadConsent, safeChatGPTRedirect, type ConsentDetails } from '../src/lib/oauthConsent';

const config = { nutritionClientId: 'nutrition-dummy', listeningClientId: 'quiz-dummy', listeningConsentUrl: 'https://listening.example/consent' };
const details: ConsentDetails = { authorization_id: 'dummy-id', user: { id: 'owner' }, client: { id: config.nutritionClientId, name: 'Listening Lab' }, scope: 'openid', redirect_uri: 'https://chatgpt.com/connector/callback' };
const target = (clientId: string, overrides = {}) => consentTarget({ ...details, client: { id: clientId, name: 'nutrition' }, ...overrides }, 'dummy-id', 'owner', config);

test('routing uses exact configured IDs, never display names', () => {
  assert.deepEqual(target(config.nutritionClientId), { kind: 'nutrition' });
  assert.deepEqual(target(config.listeningClientId), { kind: 'listening', url: 'https://listening.example/consent?authorization_id=dummy-id' });
  for (const id of ['', 'unknown', 'quiz-dummy ', 'QUIZ-DUMMY']) assert.throws(() => target(id));
});
test('missing or conflicting configuration fails closed without changing nutrition routing', () => {
  for (const url of ['', 'http://listening.example/', 'https://user:pass@listening.example/', 'https://listening.example/?next=evil', 'https://listening.example/#evil', 'https://listening.example:8080/']) {
    const c = { ...config, listeningConsentUrl: url };
    assert.throws(() => consentTarget({ ...details, client: { id: config.listeningClientId, name: '' } }, 'dummy-id', 'owner', c));
    assert.equal(consentTarget(details, 'dummy-id', 'owner', c).kind, 'nutrition');
  }
  for (const c of [{ ...config, nutritionClientId: '' }, { ...config, listeningClientId: config.nutritionClientId }]) {
    assert.throws(() => consentTarget(details, 'dummy-id', 'owner', c));
  }
  assert.throws(() => consentTarget({ ...details, client: { id: 'quiz-dummy', name: '' } }, 'dummy-id', 'owner', { ...config, listeningClientId: '' }));
});
test('owner, authorization ID, scope and callback validation remain enforced', () => {
  assert.throws(() => target(config.nutritionClientId, { user: { id: 'other' } }));
  assert.throws(() => target(config.nutritionClientId, { authorization_id: 'other' }));
  for (const scope of ['', 'email', 'openid email']) assert.throws(() => target(config.listeningClientId, { scope }));
  assert.throws(() => target(config.nutritionClientId, { scope: 'openid admin' }));
  assert.equal(target(config.nutritionClientId, { scope: 'openid profile email offline_access' }).kind, 'nutrition');
  for (const url of ['javascript:alert(1)', 'https://chatgpt.com.evil.example/callback', 'https://user@chatgpt.com/callback', 'https://chatgpt.com:8443/callback', 'https://chatgpt.com/callback#token']) {
    assert.equal(safeChatGPTRedirect(url), false);
    assert.throws(() => target(config.listeningClientId, { redirect_uri: url }));
  }
});
test('unauthenticated and redirect-only responses never grant nutrition access or redirect', async () => {
  let calls = 0;
  await assert.rejects(loadConsent('dummy-id', config, async () => undefined, async () => { calls++; return details; }));
  assert.equal(calls, 0);
  for (const redirect_url of ['https://chatgpt.com/connector/callback?code=dummy', 'https://evil.example/']) {
    await assert.rejects(loadConsent('dummy-id', config, async () => 'owner', async () => ({ redirect_url })));
  }
  await assert.rejects(loadConsent('dummy-id', config, async () => 'owner', async () => { throw new Error('offline'); }));
  const result = await loadConsent('dummy-id', config, async () => 'owner', async () => details);
  assert.equal(result.target.kind, 'nutrition');
});
