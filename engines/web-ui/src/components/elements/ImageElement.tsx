// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState } from 'react';
import type { ElementProps } from './registry';
import type { FormElementImage } from '@engine/types.js';

// Editor's ImageRenderer wraps the <img> in a rounded clip container and
// honours objectFit (contain by default). The runtime resolves src through
// the mediaMap archive-key lookup first, then falls back to bare src as URL.
export function ImageElement({ element, mediaMap }: ElementProps) {
  const el = element as FormElementImage;
  const ext = el as FormElementImage & { objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down' };
  const [failed, setFailed] = useState(false);

  // Resolve via {imageOid}-{src} archive key, then bare src, then raw src as URL
  const archiveKey = el.imageOid ? `${el.imageOid}-${el.src}` : undefined;
  const src = (archiveKey && mediaMap[archiveKey]) ?? mediaMap[el.src] ?? el.src;

  if (failed || !src) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: 4,
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: ext.objectFit ?? 'contain',
          display: 'block',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
