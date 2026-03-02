import React from 'react';
import { Link } from 'react-router-dom';
import { Package, ArrowRight } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { BannerImage } from '../../../components/ui';
import { Pagination } from '../../../components';
import type { PaginationMeta } from '../../../components/ui/Pagination';
import { type PackListItem } from '../../../schemas/apiSchemas';

const PACKS_PAGE_SIZE = 5;

const RecentPackSkeleton: React.FC = () => (
  <div className="bg-base-200/30 rounded-lg p-4 border border-base-content/10 animate-pulse">
    <div className="mb-3">
      <div className="w-full bg-base-300/60 rounded shadow-sm" style={{ aspectRatio: '2.56', minHeight: '3rem' }} />
    </div>
    <div className="h-4 bg-base-300 rounded w-3/4 mb-2"></div>
    <div className="flex items-center justify-between">
      <div className="h-3 bg-base-300 rounded w-16"></div>
      <div className="h-3 bg-base-300 rounded w-20"></div>
    </div>
  </div>
);

interface RecentPackCardProps {
  pack: PackListItem;
}

const RecentPackCard: React.FC<RecentPackCardProps> = ({ pack }) => {
  const { formatDate } = useIntl();

  return (
    <Link
      to={`/pack/${pack.id}`}
      className="bg-base-200/30 rounded-lg border border-base-content/10 p-4 hover:bg-base-200/60 hover:border-warning/40 hover:shadow-lg hover:shadow-warning/10 hover:scale-[1.02] transition-all duration-300 block"
    >
      <div className="mb-3">
        <BannerImage
          bannerVariants={pack.bannerVariants}
          mdBannerUrl={pack.mdBannerUrl}
          smBannerUrl={pack.smBannerUrl}
          bannerUrl={pack.bannerUrl}
          alt={`${pack.name} banner`}
          className="w-full object-contain rounded shadow-sm"
          style={{ aspectRatio: '2.56', minHeight: '3rem' }}
          iconSize={20}
        />
      </div>
      <div className="font-medium text-base-content text-sm mb-2 line-clamp-1">{pack.name}</div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-base-content/60">
          <FormattedMessage defaultMessage="{count} charts" id="WYDkuD" description="number of charts in a pack" values={{ count: pack.simfileCount }} />
        </span>
        <span className="text-base-content/70">
          {formatDate(pack.createdAt, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    </Link>
  );
};

interface RecentPacksCardProps {
  packs: PackListItem[];
  isLoading: boolean;
  paginationMeta: PaginationMeta | null;
  onPageChange: (page: number) => void;
}

export const RecentPacksCard: React.FC<RecentPacksCardProps> = ({ packs, isLoading, paginationMeta, onPageChange }) => {
  return (
    <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-warning/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-warning/20 mb-8 border border-warning/20 hover:border-warning/40 transition-all duration-500 group">
      <div className="card-body">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-warning/20 to-warning/10 rounded-lg group-hover:from-warning/30 group-hover:to-warning/20 transition-all duration-300">
              <Package className="w-6 h-6 text-warning" />
            </div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-warning to-accent bg-clip-text text-transparent">
              <FormattedMessage defaultMessage="Recent Packs" id="00faeg" description="section heading for recent packs" />
            </h2>
          </div>
          <Link to="/packs" className="btn btn-sm btn-outline gap-1">
            <FormattedMessage defaultMessage="View All" id="jna5bk" description="link to view all packs" />
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {[...Array(PACKS_PAGE_SIZE)].map((_, i) => (
              <RecentPackSkeleton key={i} />
            ))}
          </div>
        ) : packs.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {packs.map((pack) => (
                <RecentPackCard key={pack.id} pack={pack} />
              ))}
            </div>
            {paginationMeta && paginationMeta.totalPages > 1 && (
              <div className="mt-6">
                <Pagination meta={paginationMeta} onPageChange={onPageChange} />
              </div>
            )}
            <p className="mt-4 text-xs text-base-content/60 italic">
              <FormattedMessage
                defaultMessage="Note: these are packs recently indexed by Arrow Cloud and does not reflect the release date of those packs necessarily."
                id="fG8Uky"
                description="Disclaimer about recent packs on the homepage, indicating that these are based on indexing date."
              />
            </p>
          </>
        ) : (
          <div className="text-center py-8 text-base-content/60">
            <FormattedMessage defaultMessage="No packs available" id="uui9sw" description="empty state for recent packs" />
          </div>
        )}
      </div>
    </div>
  );
};
