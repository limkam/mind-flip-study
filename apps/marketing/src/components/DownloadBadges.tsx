import Image from 'next/image';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/constants';

interface DownloadBadgesProps {
  size?: 'default' | 'small';
}

export function DownloadBadges({ size = 'default' }: DownloadBadgesProps) {
  const width = size === 'small' ? 108 : 135;
  const height = size === 'small' ? 32 : 40;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3" role="group" aria-label="Download apps">
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="opacity-90 transition hover:opacity-100"
      >
        <Image
          src="/app-store-badge.svg"
          alt="Download on the App Store"
          width={width}
          height={height}
          priority={size === 'default'}
        />
      </a>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="opacity-90 transition hover:opacity-100"
      >
        <Image
          src="/play-store-badge.png"
          alt="Get it on Google Play"
          width={width}
          height={height}
          priority={size === 'default'}
        />
      </a>
    </div>
  );
}
