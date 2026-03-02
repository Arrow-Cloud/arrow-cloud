import { FormattedMessage, useIntl } from 'react-intl';
import { availableLocales } from '../intl/messages';
import { useChangeLocale } from './IntlProvider';

export function LocaleController() {
  const { formatDisplayName, locale } = useIntl();
  const changeLocale = useChangeLocale();

  return (
    <div className="w-full max-h-64 overflow-y-auto">
      <div className="text-xs font-semibold text-base-content/60 px-3 py-2 border-b border-base-300">
        <FormattedMessage
          defaultMessage="Select Language"
          id="XPK5q6"
          description="small header displayed above the list of available languages for the site"
        />
      </div>
      {availableLocales.map((languageCode) => (
        <label key={languageCode} className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 cursor-pointer transition-colors">
          <input
            type="radio"
            name="language-selector"
            className="radio radio-xs"
            value={languageCode}
            checked={locale === languageCode}
            onChange={() => changeLocale(languageCode)}
          />
          <span className="text-sm">{formatDisplayName(languageCode, { type: 'language' })}</span>
        </label>
      ))}
    </div>
  );
}
