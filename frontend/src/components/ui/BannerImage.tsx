import React from 'react';
import { Music } from 'lucide-react';

export interface BannerImageVariant {
  format: 'jpeg' | 'webp' | 'avif';
  size: 'orig' | 'md' | 'sm';
  width: number | null;
  url: string;
  key: string;
  bytes?: number;
}

export interface BannerImageVariants {
  original?: BannerImageVariant[];
  md?: BannerImageVariant[];
  sm?: BannerImageVariant[];
  all?: BannerImageVariant[];
}

interface BannerImageProps {
  /**
   * Modern banner variants with multiple formats and sizes
   */
  bannerVariants?: BannerImageVariants | null;
  /**
   * Medium size banner URL (fallback for variants)
   */
  mdBannerUrl?: string | null;
  /**
   * Small size banner URL (fallback for variants)
   */
  smBannerUrl?: string | null;
  /**
   * Original banner URL (final fallback)
   */
  bannerUrl?: string | null;
  /**
   * Alt text for the image
   */
  alt: string;
  /**
   * CSS classes for styling
   */
  className?: string;
  /**
   * Inline styles (typically for aspect ratio)
   */
  style?: React.CSSProperties;
  /**
   * Loading behavior - defaults to 'lazy'
   */
  loading?: 'lazy' | 'eager';
  /**
   * Icon size when no image is available
   */
  iconSize?: number;
  /**
   * Preferred size - 'responsive' uses md/sm based on screen size, 'original' uses full size
   */
  sizePreference?: 'responsive' | 'original';
}

/**
 * A reusable banner image component that supports modern image formats
 * with multiple size variants and graceful fallbacks.
 *
 * Renders a <picture> element with:
 * - AVIF sources for original, md and sm sizes with media queries
 * - WebP sources for original, md and sm sizes with media queries
 * - JPEG fallback image using appropriate size based on preference
 * - Fallback div with music icon if no images are available
 */
export const BannerImage: React.FC<BannerImageProps> = ({
  bannerVariants,
  mdBannerUrl,
  smBannerUrl,
  bannerUrl,
  alt,
  className = 'w-full object-cover rounded shadow-sm',
  style = { aspectRatio: '2.56' },
  loading = 'lazy',
  iconSize = 24,
  sizePreference = 'responsive',
}) => {
  // If we have banner variants, use the modern picture element approach
  if (bannerVariants) {
    const useOriginalSize = sizePreference === 'original';

    return (
      <picture className="min-w-[128px] min-h-[50px]" style={{ aspectRatio: '2.56' }}>
        {/* AVIF sources - best compression */}
        {useOriginalSize ? (
          // For original size preference, use original first, then md as fallback
          <>
            {bannerVariants.original?.filter((v) => v.format === 'avif').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/avif" />)}
            {bannerVariants.md?.filter((v) => v.format === 'avif').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/avif" />)}
          </>
        ) : (
          // For responsive, use md/sm based on screen size
          <>
            {bannerVariants.md?.filter((v) => v.format === 'avif').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/avif" />)}
            {bannerVariants.sm
              ?.filter((v) => v.format === 'avif')
              .map((variant) => <source key={variant.url} srcSet={variant.url} type="image/avif" media="(max-width: 640px)" />)}
          </>
        )}

        {/* WebP sources - good compression with wide support */}
        {useOriginalSize ? (
          // For original size preference, use original first, then md as fallback
          <>
            {bannerVariants.original?.filter((v) => v.format === 'webp').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/webp" />)}
            {bannerVariants.md?.filter((v) => v.format === 'webp').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/webp" />)}
          </>
        ) : (
          // For responsive, use md/sm based on screen size
          <>
            {bannerVariants.md?.filter((v) => v.format === 'webp').map((variant) => <source key={variant.url} srcSet={variant.url} type="image/webp" />)}
            {bannerVariants.sm
              ?.filter((v) => v.format === 'webp')
              .map((variant) => <source key={variant.url} srcSet={variant.url} type="image/webp" media="(max-width: 640px)" />)}
          </>
        )}

        {/* JPEG fallback - choose appropriate size based on preference */}
        <img
          src={(useOriginalSize ? bannerUrl || mdBannerUrl : mdBannerUrl || bannerUrl) || undefined}
          alt={alt}
          className={className}
          style={style}
          loading={loading}
        />
      </picture>
    );
  }

  // Fallback to basic image if no variants
  if (bannerUrl || mdBannerUrl || smBannerUrl) {
    const imageUrl = sizePreference === 'original' ? bannerUrl || mdBannerUrl || smBannerUrl : mdBannerUrl || bannerUrl || smBannerUrl;
    return <img src={imageUrl || undefined} alt={alt} className={className} style={style} loading={loading} />;
  }

  // No image available - show fallback with icon
  return (
    <div className={`bg-base-300/60 rounded flex items-center justify-center shadow-sm ${className}`} style={style}>
      <Music size={iconSize} className="text-base-content/60" />
    </div>
  );
};
