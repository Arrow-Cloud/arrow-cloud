const features = ['Intl.DisplayNames', 'Intl.ListFormat'];

// base polyfill is hard-coded into the HTML template

// export const basePolyfillUrl = getPolyfillsUrl();

// export function getPolyfillsUrl(): string | null {
//   const baseUrl = 'https://polyfill-fastly.io/v3/polyfill.min.js';
//   const params = new URLSearchParams({
//     features: features.join(','),
//   });
//   return `${baseUrl}?${params.toString()}`;
// }

export function getPolyfillLocalesUrl(locale: string): string {
  const featuresWithLocale = features.map((f) => `${f}.~locale.${locale}`);
  const baseUrl = 'https://polyfill-fastly.io/v3/polyfill.min.js';
  const params = new URLSearchParams({
    features: featuresWithLocale.join(','),
  });
  return `${baseUrl}?${params.toString()}`;
}
