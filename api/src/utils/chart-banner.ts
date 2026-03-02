import { assetS3UrlToCloudFrontUrl, toCfVariantSet } from './s3';

/**
 * Centralized chart banner resolution
 *
 * This is necessary because:
 * - A single chart can be linked to multiple simfiles (across multiple packs).
 * - Some songs only have pack-level banner assets (many packs use ../bn.png to use a single
 *   file for all simfiles in that pack, for example).
 * - A fallback option needs to be present to ensure a banner is always available.
 *
 * The goal of this code is to:
 * - Keep banner selection deterministic and stable across endpoints.
 * - Preserve the “first processed pack” as the canonical fallback source.
 * - Prefer song banner assets, but fall back to pack banner assets when needed.
 */

interface BannerSource {
  bannerUrl?: string | null;
  mdBannerUrl?: string | null;
  smBannerUrl?: string | null;
  bannerVariants?: any | null;
}

interface SimfileBannerSource {
  createdAt?: Date | string;
  simfile: BannerSource & {
    pack?: BannerSource | null;
  };
}

export interface ResolvedChartBanner {
  bannerUrl: string | null;
  mdBannerUrl: string | null;
  smBannerUrl: string | null;
  bannerVariants?: any;
}

const EMPTY_BANNER: ResolvedChartBanner = {
  bannerUrl: null,
  mdBannerUrl: null,
  smBannerUrl: null,
  bannerVariants: undefined,
};

function hasBannerData(source: BannerSource | null | undefined): boolean {
  if (!source) return false;
  return !!(source.bannerUrl || source.mdBannerUrl || source.smBannerUrl || source.bannerVariants);
}

function toResolvedBanner(source: BannerSource | null | undefined): ResolvedChartBanner {
  if (!source) return EMPTY_BANNER;

  return {
    bannerUrl: source.bannerUrl ? assetS3UrlToCloudFrontUrl(source.bannerUrl) : null,
    mdBannerUrl: source.mdBannerUrl ? assetS3UrlToCloudFrontUrl(source.mdBannerUrl) : null,
    smBannerUrl: source.smBannerUrl ? assetS3UrlToCloudFrontUrl(source.smBannerUrl) : null,
    bannerVariants: toCfVariantSet(source.bannerVariants) || undefined,
  };
}

function toTimestamp(value: Date | string | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

/**
 * Resolve a chart's banner fields using a deterministic priority model.
 *
 * Priority order:
 * 1) Song-level banner from the first processed simfile (preferred canonical banner)
 * 2) Pack-level banner from that same first processed simfile (primary fallback)
 * 3) First song-level banner found across all remaining simfiles
 * 4) First pack-level banner found across all remaining simfiles
 * 5) No banner (all fields null/undefined)
 *
 * Notes:
 * - Simfiles are sorted by `createdAt` ascending to represent first processed order.
 * - Returned URLs are converted to CloudFront URLs for API responses.
 */
export function resolveChartBanner(simfiles: SimfileBannerSource[]): ResolvedChartBanner {
  if (simfiles.length === 0) return EMPTY_BANNER;

  const orderedSimfiles = [...simfiles].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  const firstSimfile = orderedSimfiles[0]?.simfile;

  if (!firstSimfile) return EMPTY_BANNER;

  if (hasBannerData(firstSimfile)) {
    return toResolvedBanner(firstSimfile);
  }

  if (hasBannerData(firstSimfile.pack)) {
    return toResolvedBanner(firstSimfile.pack);
  }

  for (const simfileChart of orderedSimfiles) {
    if (hasBannerData(simfileChart.simfile)) {
      return toResolvedBanner(simfileChart.simfile);
    }
  }

  for (const simfileChart of orderedSimfiles) {
    if (hasBannerData(simfileChart.simfile.pack)) {
      return toResolvedBanner(simfileChart.simfile.pack);
    }
  }

  return EMPTY_BANNER;
}
