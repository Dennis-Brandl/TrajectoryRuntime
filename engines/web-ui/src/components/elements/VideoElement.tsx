// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { Video } from 'lucide-react';
import type { ElementProps } from './registry';
import type { FormElementVideo } from '@engine/types.js';

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function toEmbedUrl(src: string): string | null {
  const m = src.match(YOUTUBE_RE);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

// Editor's VideoRenderer shows a slate-coloured placeholder card with a
// Video icon and either "Video URL" (empty src) or a truncated URL preview
// (configured src). The runtime keeps that look but, for real https/youtube
// URLs, renders a functional player on top so users can actually watch.
export function VideoElement({ element, mediaMap }: ElementProps) {
  const el = element as FormElementVideo;
  const resolved = el.src ? (mediaMap[el.src] ?? el.src) : '';
  const embedUrl = resolved ? toEmbedUrl(resolved) : null;

  const dark = !!resolved;
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    background: dark ? '#0f172a' : '#1e293b',
    border: dark ? 'none' : '2px dashed #334155',
    borderRadius: 4,
    overflow: 'hidden',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  };

  if (!resolved) {
    return (
      <div style={containerStyle}>
        <Video size={28} color="#64748b" />
        <span style={{ fontSize: 12, color: '#64748b' }}>Video URL</span>
      </div>
    );
  }

  if (embedUrl) {
    return (
      <div style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
        <iframe
          src={embedUrl}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4, display: 'block' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const poster = el.posterUrl ? (mediaMap[el.posterUrl] ?? el.posterUrl) : undefined;
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
      <video
        src={resolved}
        poster={poster}
        controls
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
