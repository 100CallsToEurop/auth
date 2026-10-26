import {
  BOT_RE,
  BROWSERS,
  MOBILE_RE,
  OSES,
  TABLET_RE,
} from '../../../libs/consts/user-agent.constants.js';

/**
 * Человекочитаемое описание устройства по строке User-Agent.
 * Без внешних зависимостей — покрывает основные браузеры и ОС.
 */
export interface ParsedDevice {
  browser: string | null;
  os: string | null;
  type: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
}

export function parseDevice(
  userAgent: string | null | undefined,
): ParsedDevice {
  if (!userAgent) {
    return { browser: null, os: null, type: 'unknown' };
  }

  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(userAgent))?.[1] ?? null;

  let type: ParsedDevice['type'] = 'desktop';
  if (BOT_RE.test(userAgent)) {
    type = 'bot';
  } else if (TABLET_RE.test(userAgent)) {
    type = 'tablet';
  } else if (MOBILE_RE.test(userAgent)) {
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
