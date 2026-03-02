import { createContext, use, useCallback, useContext, useState, type ReactNode } from 'react';
import { IntlProvider as ReactIntlProvider } from 'react-intl';
import { coerceToSupportedLocale, getMessages } from '../intl/messages';
import { getPolyfillLocalesUrl } from '../intl/polyfills';

const ChangeLocaleContext = createContext<(locale: string) => void>(() => {});

export function useChangeLocale() {
  return useContext(ChangeLocaleContext);
}

export default function IntlProvider(props: { children: ReactNode }) {
  const [locale, setLocale] = useState(coerceToSupportedLocale(navigator.language || 'en'));
  const messages = use(getMessages(locale));

  const changeLocale = useCallback((newLocale: string) => {
    setLocale(coerceToSupportedLocale(newLocale));
  }, []);

  return (
    <ChangeLocaleContext.Provider value={changeLocale}>
      <ReactIntlProvider locale={locale} messages={messages} defaultLocale="en">
        <script src={getPolyfillLocalesUrl(locale)} async></script>
        {props.children}
      </ReactIntlProvider>
    </ChangeLocaleContext.Provider>
  );
}
