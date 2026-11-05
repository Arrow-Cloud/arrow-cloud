import React from 'react';
import { FormattedMessage } from 'react-intl';

/** Visually hidden "Loading…" status for screen readers. Render once per loading list. */
export const LoadingLabel: React.FC = () => (
  <span className="sr-only" role="status">
    <FormattedMessage defaultMessage="Loading…" id="0ztsHN" description="Screen reader label announced while a list is loading for the first time" />
  </span>
);
