import React from 'react';
import { FormattedMessage } from 'react-intl';
import { AlertCircle } from 'lucide-react';
import type { PaginatedLoadState } from '../../hooks/usePaginatedResource';

/**
 * Inline error for a failed page, search, or sort change. The list keeps its previous rows below it.
 * Renders nothing unless a refetch failed while data is on screen.
 */
export const ListLoadError: React.FC<{ state: Pick<PaginatedLoadState, 'error' | 'hasData' | 'retry'> }> = ({ state }) => {
  if (!state.error || !state.hasData) return null;
  return (
    <div role="alert" className="alert alert-error alert-soft mb-4">
      <AlertCircle size={18} />
      <span>
        <FormattedMessage
          defaultMessage="Could not load this list: {error}"
          id="RaD8zy"
          description="Inline error shown above or in place of a paginated list when loading fails"
          values={{ error: state.error }}
        />
      </span>
      <button type="button" className="btn btn-sm" onClick={state.retry}>
        <FormattedMessage defaultMessage="Retry" id="80Vzt6" description="Button label to retry loading" />
      </button>
    </div>
  );
};
