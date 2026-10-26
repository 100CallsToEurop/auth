/** Известные браузеры: регулярное выражение → человекочитаемое имя. */
export const BROWSERS: Array<[RegExp, string]> = [
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

/** Известные операционные системы: регулярное выражение → имя. */
export const OSES: Array<[RegExp, string]> = [
  [/Windows NT/i, 'Windows'],
  [/iPhone|iPod/i, 'iOS'],
  [/iPad/i, 'iPadOS'],
  [/Mac OS X|Macintosh/i, 'macOS'],
  [/Android/i, 'Android'],
  [/CrOS/i, 'ChromeOS'],
  [/Linux/i, 'Linux'],
  [/FreeBSD/i, 'FreeBSD'],
];

/** Служебные клиенты (боты, crawler'ы, HTTP-библиотеки). */
export const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|curl|wget|python-requests|axios|node-fetch|postman/i;

/** Планшеты. */
export const TABLET_RE = /iPad|Tablet|Nexus 7|Nexus 10|SM-T/i;

/** Мобильные устройства. */
export const MOBILE_RE = /Mobi|iPhone|Android.*Mobile|Windows Phone/i;
