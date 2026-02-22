// src/components/ui/PlayingCard.tsx
import React from 'react';
import { cardToDisplay } from '../../types';

interface PlayingCardProps {
  value: number;           // 0-51 = real card, 255 = hidden
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;     // golden glow for winning hand
  animate?: boolean;
  style?: React.CSSProperties;
}

const SIZES = {
  sm: { width: '2.75rem', height: '3.875rem', fontSize: '0.75rem', suitSize: '1rem' },
  md: { width: '3.5rem', height: '5rem', fontSize: '0.875rem', suitSize: '1.25rem' },
  lg: { width: '4.5rem', height: '6.25rem', fontSize: '1rem', suitSize: '1.5rem' },
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  value,
  size = 'md',
  highlight = false,
  animate = false,
  style,
}) => {
  const dim = SIZES[size];
  const hidden = value === 255 || value < 0 || value === undefined;
  const card = hidden ? null : cardToDisplay(Math.min(value, 51));

  const baseStyle: React.CSSProperties = {
    width: dim.width,
    height: dim.height,
    borderRadius: 6,
    border: highlight
      ? '1px solid var(--gold)'
      : '1px solid rgba(255,255,255,0.12)',
    boxShadow: highlight
      ? 'var(--shadow-gold), var(--shadow-sm)'
      : 'var(--shadow-sm)',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'transform 0.15s var(--ease-out), box-shadow 0.15s',
    animation: animate ? 'card-flip 0.4s var(--ease-out)' : 'none',
    ...style,
  };

  if (hidden) {
    return (
      <div style={{
        ...baseStyle,
        background: 'linear-gradient(160deg, #1e3a8a 0%, #1e40af 40%, #172554 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Card back pattern */}
        <div style={{
          position: 'absolute',
          inset: 4,
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 3,
          background: `repeating-linear-gradient(
            45deg,
            transparent, transparent 3px,
            rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px
          )`,
        }} />
        <span style={{ fontSize: '1.25rem', position: 'relative', zIndex: 1, opacity: 0.4 }}>🔒</span>
      </div>
    );
  }

  return (
    <div style={{
      ...baseStyle,
      background: '#fafaf8',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '0.2rem 0.25rem',
      color: card!.isRed ? '#dc2626' : '#111',
    }}>
      {/* Top-left rank + suit */}
      <div style={{ fontSize: dim.fontSize, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
        <div>{card!.rank}</div>
        <div style={{ fontSize: '0.65rem' }}>{card!.suit}</div>
      </div>

      {/* Center suit */}
      <div style={{
        fontSize: dim.suitSize,
        textAlign: 'center',
        lineHeight: 1,
        opacity: 0.85,
      }}>
        {card!.suit}
      </div>

      {/* Bottom-right rank + suit (rotated) */}
      <div style={{
        fontSize: dim.fontSize,
        fontWeight: 700,
        lineHeight: 1,
        transform: 'rotate(180deg)',
        fontFamily: 'var(--font-mono)',
        alignSelf: 'flex-end',
      }}>
        <div>{card!.rank}</div>
        <div style={{ fontSize: '0.65rem' }}>{card!.suit}</div>
      </div>

      {/* Highlight shimmer overlay */}
      {highlight && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
};

/* Small horizontal card row */
export const CardRow: React.FC<{
  cards: number[];
  size?: 'sm' | 'md' | 'lg';
  gap?: string;
  highlightIndices?: number[];
}> = ({ cards, size = 'md', gap = '0.375rem', highlightIndices = [] }) => (
  <div style={{ display: 'flex', gap, alignItems: 'center' }}>
    {cards.map((v, i) => (
      <PlayingCard
        key={i}
        value={v}
        size={size}
        highlight={highlightIndices.includes(i)}
        animate={v !== 255}
      />
    ))}
  </div>
);
