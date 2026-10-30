import React, { useState, useEffect } from 'react';
import { fetchEvidenceImageBlob } from '../../services/api';

/**
 * AuthenticatedImage
 * Streams private evidence images using standard Authorization Bearer header.
 * Eliminates query parameter token exposure in browser history and referrers.
 */
export default function AuthenticatedImage({ evidenceId, alt, className, onClick }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    fetchEvidenceImageBlob(evidenceId).then((res) => {
      if (!active) {
        if (res.success && res.url) URL.revokeObjectURL(res.url);
        return;
      }
      if (res.success && res.url) {
        setBlobUrl(res.url);
        createdUrl = res.url;
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [evidenceId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-[#ECEAE2] text-[#68716A] text-[10px] animate-pulse rounded ${className}`}>
        Loading...
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`flex items-center justify-center bg-[#ECEAE2] text-[#B4483E] text-[10px] p-2 rounded text-center ${className}`}>
        Unavailable
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt || 'Resolution Evidence'}
      className={className}
      onClick={onClick}
      loading="lazy"
    />
  );
}

