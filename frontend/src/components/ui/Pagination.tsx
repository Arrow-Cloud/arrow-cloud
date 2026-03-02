import React from 'react';
import { FormattedMessage } from 'react-intl';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({ meta, onPageChange, className = '' }) => {
  const { page: currentPage, totalPages, hasNextPage, hasPreviousPage } = meta;

  // Generate page numbers to show
  const getVisiblePages = () => {
    const delta = 2; // Number of pages to show on each side of current page
    const range = [];
    const rangeWithDots = [];

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  if (totalPages <= 1) return null;

  return (
    <div className={`flex justify-center mt-6 ${className}`}>
      <div className="join">
        <button className="join-item btn btn-sm" disabled={!hasPreviousPage} onClick={() => onPageChange(currentPage - 1)}>
          <FormattedMessage defaultMessage="Previous" id="MOf0nY" description="Label for previous page button" />
        </button>

        {getVisiblePages().map((page, index) =>
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="join-item btn btn-sm btn-disabled">
              <FormattedMessage defaultMessage="..." id="dpHkxV" description="Ellipsis in pagination" />
            </span>
          ) : (
            <button
              key={`page-${page}`}
              className={`join-item btn btn-sm ${currentPage === page ? 'btn-active' : ''}`}
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </button>
          ),
        )}

        <button className="join-item btn btn-sm" disabled={!hasNextPage} onClick={() => onPageChange(currentPage + 1)}>
          <FormattedMessage defaultMessage="Next" id="GrJ6PI" description="Label for next page button" />
        </button>
      </div>
    </div>
  );
};
