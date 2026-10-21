/**
 * Человекочитаемое описание устройства по строке User-Agent.
 * Без внешних зависимостей — покрывает основные браузеры и ОС.
 */
export interface ParsedDevice {
  browser: string | null;
  os: string | null;
  type: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
}

const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/YaBrowser/i, 'Яндекс.Браузер'],
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/Firefox\//i, 'Firefox'],
  [/CriOS\//i, 'Chrome'],
  [/Chrome\//i, 'Chrome'],
  [/FxiOS\//i, 'Firefox'],
  [/Safari\//i, 'Safari'],
  [/MSIE|Trident/i, 'Internet Explorer'],
  [/curl\//i, 'curl'],
  [/Wget\//i, 'wget'],
  [/PostmanRuntime/i, 'Postman'],
];

const OSES: Array<[RegExp, string]> = [
  [/Windows NT/i, 'Windows'],
  [/iPhone|iPod/i, 'iOS'],
  [/iPad/i, 'iPadOS'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/Android/i, 'Android'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
  [/FreeBSD/i, 'FreeBSD'],
];

const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|slurp|curl|wget|python-requests|axios|node-fetch|postman/i;

export function parseDevice(userAgent: string | null | undefined): ParsedDevice {
  if (!userAgent) {
    return { browser: null, os: null, type: 'unknown' };
  }

  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(userAgent))?.[1] ?? null;

  let type: ParsedDevice['type'] = 'desktop';
  if (BOT_RE.test(userAgent)) {
    type = 'bot';
  } else if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T/i.test(userAgent)) {
    type = 'tablet';
  } else if (/Mobi|iPhone|Android.*Mobile|Windows Phone/i.test(userAgent)) {
    type = 'mobile';
  }

  return { browser, os, type };
}

/** Короткая строка вида «Chrome · macOS» (или «Неизвестное устройство»). */
export function describeDevice(userAgent: string | null | undefined): string {
  const { browser, os, type } = parseDevice(userAgent);
  const label = [browser, os].filter(Boolean).join(' · ');

  if (!label) {
    return type === 'bot' ? 'Служебный клиент' : 'Неизвестное устройство';
  }
  return label;
}
