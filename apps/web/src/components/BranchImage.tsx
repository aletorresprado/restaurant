import { useState } from 'react';
import { apiUrl, type Branch } from '@/lib/api';
import { hero } from '@/lib/presentation';

export function BranchImage({
  branch,
  className,
  alt = '',
}: {
  branch: Branch;
  className?: string;
  alt?: string;
}) {
  const [failedVersion, setFailedVersion] = useState<string | null>(null);
  const custom = branch.imageVersion && branch.imageVersion !== failedVersion;
  return (
    <img
      src={
        custom
          ? apiUrl(`/branches/${branch.id}/image?v=${encodeURIComponent(branch.imageVersion!)}`)
          : hero
      }
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (branch.imageVersion) setFailedVersion(branch.imageVersion);
      }}
    />
  );
}
