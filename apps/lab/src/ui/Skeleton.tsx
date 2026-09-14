// apps/lab — skeletons por card (§11, UI-03, 06-04 task 1).
//
// `CardSkeleton({ count })`: telas em loading renderizam skeletons por card
// (3 blocos pulsantes por card, testID `skeleton-card`). NUNCA spinner
// infinito global nem `ActivityIndicator` solitário sem texto (T-06-04-03:
// skeleton só em loading com testID distinto; nunca confundido com card
// real). View model puro de apresentação; sem DTO de domínio.

import type { JSX } from 'react';
import { View } from 'react-native';
import { theme } from './theme';

export interface CardSkeletonProps {
  count?: number;
}

function SkeletonCard(): JSX.Element {
  return (
    <View
      testID="skeleton-card"
      style={{ borderWidth: theme.border.thin, padding: theme.space.lg, gap: theme.space.md }}
    >
      <View style={{ height: 16, backgroundColor: theme.colors.skeletonStrong }} />
      <View style={{ height: 12, backgroundColor: theme.colors.skeletonWeak }} />
      <View style={{ height: 12, width: '60%', backgroundColor: theme.colors.skeletonWeak }} />
    </View>
  );
}

export function CardSkeleton({ count = 2 }: CardSkeletonProps): JSX.Element {
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 2;
  const cards: JSX.Element[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    cards.push(<SkeletonCard key={`skeleton-${i}`} />);
  }
  return <View style={{ gap: theme.space.lg }}>{cards}</View>;
}
