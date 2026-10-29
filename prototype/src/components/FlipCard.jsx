import React from 'react';
import './flip-card.css';

export function FlipCard({ flipped = false, onFlip, front, back, label = '翻转卡片', className = '' }) {
  return <button
    type="button"
    className={`flip-card ${flipped ? 'is-flipped' : ''} ${className}`}
    onClick={onFlip}
    aria-expanded={flipped}
    aria-label={`${label}${flipped ? '，返回正面' : ''}`}
  >
    <span className="flip-card-inner">
      <span className="flip-card-face flip-card-front" aria-hidden={flipped}>{front}</span>
      <span className="flip-card-face flip-card-back" aria-hidden={!flipped}>{back}</span>
    </span>
  </button>;
}
