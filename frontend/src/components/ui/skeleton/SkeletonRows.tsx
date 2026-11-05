import React from 'react';
import { Skeleton } from './Skeleton';
import { LoadingLabel } from './LoadingLabel';

export interface SkeletonColumn {
  /** Classes for the `<td>`. Match the real cell's padding and alignment. */
  className?: string;
  /** Placeholder content for the cell. Defaults to one text line. */
  content?: React.ReactNode;
}

interface SkeletonRowsProps {
  /** Number of rows. Use the list's page size. */
  rows: number;
  /** One entry per real column, in order. */
  columns: SkeletonColumn[];
}

/**
 * Placeholder `<tr>`s for the first load of a table. Render inside the real `<tbody>`,
 * so headers and column widths come from the real table.
 */
export const SkeletonRows: React.FC<SkeletonRowsProps> = ({ rows, columns }) => (
  <>
    <tr className="sr-only">
      <td colSpan={columns.length}>
        <LoadingLabel />
      </td>
    </tr>
    {Array.from({ length: rows }, (_, rowIndex) => (
      <tr key={rowIndex} aria-hidden="true" data-testid="skeleton-row">
        {columns.map((column, columnIndex) => (
          <td key={columnIndex} className={column.className}>
            {column.content ?? <Skeleton className="h-4 w-3/4" />}
          </td>
        ))}
      </tr>
    ))}
  </>
);
