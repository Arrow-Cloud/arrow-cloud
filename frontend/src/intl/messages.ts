const messagesModules = import.meta.glob('./compiled/*.json');

/** used to drive UI allowing manual language selection */
export const availableLocales = Object.keys(messagesModules)
  .map((path) => {
    const match = path.match(/\/([a-zA-Z_-]+)\.json$/);
    return match ? match[1] : null;
  })
  .filter((locale): locale is string => locale !== null);

/**
 * for now we only have simple 2-letter codes in compiled files
 * so this will let `en-US` fall back to `en` or `es-MX` to `es`
 */
export function coerceToSupportedLocale(locale: string): string {
  const languageCode = locale.split('-')[0];
  if (availableLocales.includes(locale)) {
    return locale;
  } else if (availableLocales.includes(languageCode)) {
    return languageCode;
  } else {
    return 'en';
  }
}

interface MessagesModule {
  default: Record<string, string>;
}

async function loadMessagesModule(locale: string) {
  const moduleLoader = messagesModules[`./compiled/${locale}.json`];
  if (moduleLoader) {
    const module = (await moduleLoader()) as MessagesModule;
    return module.default;
  }
  // fall back to English if locale not found
  const fallbackModule = (await messagesModules['./compiled/en.json']()) as MessagesModule;
  return fallbackModule.default;
}

const promiseCache: Record<string, Promise<Record<string, string>>> = {};

/**
 * for any given locale, always returns a stable promise instance resolving to the messages
 */
export function getMessages(locale: string) {
  const languageCode = coerceToSupportedLocale(locale);
  if (!promiseCache[languageCode]) {
    promiseCache[languageCode] = loadMessagesModule(languageCode);
  }
  return promiseCache[languageCode];
}
