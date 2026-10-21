import { describeDevice, parseDevice } from './user-agent.js';

describe('parseDevice', () => {
  it('parses a desktop Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    expect(parseDevice(ua)).toEqual({
      browser: 'Chrome',
      os: 'macOS',
      type: 'desktop',
    });
  });

  it('parses Firefox on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(parseDevice(ua)).toMatchObject({ browser: 'Firefox', os: 'Windows' });
  });

  it('parses iPhone Safari as mobile iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parseDevice(ua)).toEqual({
      browser: 'Safari',
      os: 'iOS',
      type: 'mobile',
    });
  });

  it('parses an iPad as a tablet', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parseDevice(ua).type).toBe('tablet');
  });

  it('detects Android mobile Chrome', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
    expect(parseDevice(ua)).toMatchObject({
      browser: 'Chrome',
      os: 'Android',
      type: 'mobile',
    });
  });

  it('flags curl as a service client', () => {
    expect(parseDevice('curl/8.7.1')).toMatchObject({
      browser: 'curl',
      type: 'bot',
    });
  });

  it('handles a missing user agent', () => {
    expect(parseDevice(null)).toEqual({
      browser: null,
      os: null,
      type: 'unknown',
    });
  });
});

describe('describeDevice', () => {
  it('joins browser and OS', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows');
  });

  it('falls back to a generic label', () => {
    expect(describeDevice('WeirdClient')).toBe('Неизвестное устройство');
    expect(describeDevice(null)).toBe('Неизвестное устройство');
  });
});
