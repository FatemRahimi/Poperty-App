import { canStartLookup, canStartResolve } from './providerSearchGuard';

test('lookup is not dispatched on empty or short query', () => {
  expect(canStartLookup({ query: '' }).ok).toBe(false);
  expect(canStartLookup({ query: 'ab' }).ok).toBe(false);
  expect(canStartLookup({ query: 'B1 2UJ' }).ok).toBe(true);
});

test('lookup is not dispatched while a request is in flight', () => {
  expect(canStartLookup({ inFlight: true, query: '12 High Street, B1 2UJ' }).ok).toBe(false);
  expect(canStartLookup({ inFlight: false, query: '12 High Street, B1 2UJ' }).ok).toBe(true);
});

test('resolve is not dispatched without UPRN or while in flight', () => {
  expect(canStartResolve({ uprn: '1001' }).ok).toBe(true);
  expect(canStartResolve({ inFlight: true, uprn: '1001' }).ok).toBe(false);
  expect(canStartResolve({ uprn: null }).ok).toBe(false);
});
