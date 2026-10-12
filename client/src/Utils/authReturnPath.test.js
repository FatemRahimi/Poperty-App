import {
  googleAuthStartUrl,
  resolveAuthReturnPath,
  safeFrontendPath,
} from './authReturnPath';

describe('authReturnPath', () => {
  test('accepts Property Intelligence string return paths', () => {
    expect(resolveAuthReturnPath('/ai-services/property-intelligence')).toBe(
      '/ai-services/property-intelligence'
    );
    expect(
      resolveAuthReturnPath('/ai-services/property-intelligence?propertyId=12')
    ).toBe('/ai-services/property-intelligence?propertyId=12');
  });

  test('accepts React Router location objects used by signup', () => {
    expect(resolveAuthReturnPath({ pathname: '/ai-services/property-intelligence' })).toBe(
      '/ai-services/property-intelligence'
    );
    expect(
      resolveAuthReturnPath({
        pathname: '/ai-services/property-intelligence',
        search: '?subjectId=abc',
      })
    ).toBe('/ai-services/property-intelligence?subjectId=abc');
  });

  test('string without .pathname does not fall back to /find', () => {
    const from = '/ai-services/property-intelligence';
    expect(from.pathname).toBeUndefined();
    expect(from.pathname || '/find').toBe('/find');
    expect(resolveAuthReturnPath(from)).toBe('/ai-services/property-intelligence');
  });

  test('rejects open redirects', () => {
    expect(safeFrontendPath('https://evil.example/phish')).toBe('/find');
    expect(safeFrontendPath('//evil.example')).toBe('/find');
    expect(safeFrontendPath('find')).toBe('/find');
  });

  test('Google start URL targets the API host so the OAuth session cookie survives', () => {
    expect(googleAuthStartUrl('/ai-services/property-intelligence', '')).toBe(
      'http://localhost:5050/api/auth/google?redirectTo=%2Fai-services%2Fproperty-intelligence'
    );
    expect(
      googleAuthStartUrl('/ai-services/property-intelligence', 'https://api.example.com/')
    ).toBe(
      'https://api.example.com/api/auth/google?redirectTo=%2Fai-services%2Fproperty-intelligence'
    );
  });
});
