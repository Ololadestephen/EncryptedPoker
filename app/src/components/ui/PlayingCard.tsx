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
  const hidden = value === 255 || value < 0 || value === undefined || value === -1;
  const card = hidden ? null : cardToDisplay(Math.min(value, 51));

  const baseStyle: React.CSSProperties = {
    width: dim.width,
    height: dim.height,
    borderRadius: 8,
    border: highlight
      ? '2px solid var(--gold)'
      : '1px solid rgba(255,255,255,0.08)',
    boxShadow: highlight
      ? '0 0 20px rgba(201,168,76,0.4), var(--shadow-lg)'
      : 'var(--shadow-md)',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'all 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
    animation: animate ? 'card-reveal 0.6s cubic-bezier(0.23, 1, 0.32, 1)' : 'none',
    ...style,
  };

  return (
    <div
      className={`playing-card ${hidden ? 'hidden' : 'revealed'}`}
      data-testid={hidden ? 'card-hidden' : `card-${card!.rank}${card!.suit}`}
      style={{
        ...baseStyle,
        background: hidden
          ? 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)'
          : 'linear-gradient(to bottom, #ffffff 0%, #f1f5f9 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: hidden ? '0' : '0.35rem 0.4rem',
        color: !hidden && card!.isRed ? '#e11d48' : '#0f172a',
      }}
    >
      {hidden ? (
        <>
          {/* Intricate card back pattern */}
          <div style={{
            position: 'absolute',
            inset: 4,
            border: '1px solid rgba(201,168,76,0.15)',
            borderRadius: 6,
            background: `
              radial-gradient(circle at 50% 50%, rgba(201,168,76,0.05) 0%, transparent 70%),
              repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 8px),
              repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.02) 4px, rgba(255,255,255,0.02) 8px)
            `,
          }} />
          <div style={{
            width: '60%', height: '60%',
            borderRadius: '50%',
            border: '1px solid rgba(201,168,76,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.2)',
            zIndex: 1,
            position: 'relative'
          }}>
            <span style={{ fontSize: '1.25rem', opacity: 0.6, filter: 'grayscale(1) brightness(1.5)' }}>⚜️</span>
          </div>
        </>
      ) : (
        <>
          {/* Top-left rank + suit */}
          <div style={{ fontSize: dim.fontSize, fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
            <div>{card!.rank}</div>
            <div style={{ fontSize: '0.8em', marginTop: '1px' }}>{card!.suit}</div>
          </div>

          {/* Center suit - larger and slightly transparent */}
          <div style={{
            fontSize: dim.suitSize,
            textAlign: 'center',
            lineHeight: 1,
            opacity: 0.15,
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}>
            {card!.suit}
          </div>

          {/* Bottom-right rank + suit (rotated) */}
          <div style={{
            fontSize: dim.fontSize,
            fontWeight: 800,
            lineHeight: 1,
            transform: 'rotate(180deg)',
            fontFamily: 'var(--font-mono)',
            alignSelf: 'flex-end',
          }}>
            <div>{card!.rank}</div>
            <div style={{ fontSize: '0.8em', marginTop: '1px' }}>{card!.suit}</div>
          </div>

          {/* Gloss reflection overlay */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: '50%',
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, transparent 100%)',
            pointerEvents: 'none',
            opacity: 0.5,
          }} />
        </>
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
  <div className="card-row" data-testid="card-row" style={{ display: 'flex', gap, alignItems: 'center' }}>
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
