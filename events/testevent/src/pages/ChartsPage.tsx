import { BannerImage } from '@shared/components/ui/BannerImage';
import { DifficultyChip } from '@shared/components/DifficultyChip';
import { useEventCharts } from '../services/eventApi';
import { Music, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

const EVENT_ID = 3;

function PointsBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-xs font-bold tabular-nums tracking-wide">
      <FormattedMessage defaultMessage="{points} pt" id="rj/gZn" description="Points badge on event chart card" values={{ points: points.toLocaleString() }} />
    </span>
  );
}

function ChartCard({ chart, metadata }: { chart: EventChartData; metadata: Record<string, any> }) {
  const title = chart.songName || 'Unknown Song';
  const artist = chart.artist || chart.stepartist || 'Unknown Artist';

  return (
    <div className="group relative overflow-hidden rounded-xl bg-base-200 shadow-sm ring-1 ring-base-content/5 transition-all hover:shadow-md hover:ring-base-content/10">
      {/* Banner */}
      <div className="relative overflow-hidden">
        <BannerImage
          bannerVariants={chart.bannerVariants}
          mdBannerUrl={chart.mdBannerUrl}
          smBannerUrl={chart.smBannerUrl}
          bannerUrl={chart.bannerUrl}
          alt={`${title} banner`}
          className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          style={{ aspectRatio: '2.56' }}
          sizePreference="responsive"
        />
        {/* Gradient overlay at bottom of banner */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-base-200 to-transparent" />
        {/* Difficulty chip overlay */}
        <div className="absolute top-2 right-2">
          <DifficultyChip stepsType={chart.stepsType} difficulty={chart.difficulty} meter={chart.meter} size="sm" />
        </div>
      </div>

      {/* Info */}
      <div className="px-4 pb-4 -mt-2 relative">
        <h3 className="font-semibold text-base-content truncate text-sm leading-tight" title={title}>
          {title}
        </h3>
        <p className="text-xs text-base-content/50 truncate mt-0.5" title={artist}>
          {artist}
        </p>
        {metadata.points != null && (
          <div className="mt-2">
            <PointsBadge points={metadata.points} />
          </div>
        )}
      </div>
    </div>
  );
}

type EventChartData = {
  hash: string;
  songName: string | null;
  artist: string | null;
  rating: number | null;
  stepsType: string | null;
  difficulty: string | null;
  meter: number | null;
  stepartist: string | null;
  credit: string | null;
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: any;
};

function PageControls({ page, totalPages, onPrev, onNext }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-8">
      <button className="btn btn-sm btn-ghost" onClick={onPrev} disabled={page <= 1}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-base-content/60 tabular-nums">
        <FormattedMessage defaultMessage="{page} / {totalPages}" id="SLhgUf" description="Page number indicator" values={{ page, totalPages }} />
      </span>
      <button className="btn btn-sm btn-ghost" onClick={onNext} disabled={page >= totalPages}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ChartsPage() {
  const { charts, meta, loading, error, page, setPage } = useEventCharts(EVENT_ID);

  return (
    <div className="pt-24 pb-16 px-4">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Music className="w-6 h-6 text-accent" />
            <h1 className="text-2xl font-bold tracking-tight">
              <FormattedMessage defaultMessage="Charts" id="GeBvkO" description="Charts page heading" />
            </h1>
          </div>
          {meta && (
            <p className="text-sm text-base-content/50">
              <FormattedMessage defaultMessage="{total} charts in this event" id="ahrph9" description="Chart count subtitle" values={{ total: meta.total }} />
            </p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="alert alert-error max-w-md mx-auto">
            <span>{error}</span>
          </div>
        )}

        {/* Chart grid */}
        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {charts.map((ec) => (
                <ChartCard key={ec.chartHash} chart={ec.chart} metadata={ec.metadata as Record<string, any>} />
              ))}
            </div>

            {charts.length === 0 && (
              <div className="text-center py-20 text-base-content/40">
                <Music className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>
                  <FormattedMessage defaultMessage="No charts yet" id="oIakGE" description="Empty state when no charts in event" />
                </p>
              </div>
            )}

            {meta && <PageControls page={page} totalPages={meta.totalPages} onPrev={() => setPage(page - 1)} onNext={() => setPage(page + 1)} />}
          </>
        )}
      </div>
    </div>
  );
}
