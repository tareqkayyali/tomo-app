/**
 * Social Screen
 * Wraps the existing Leaderboard as the Social tab entry point.
 *
 * Will be expanded with team features, challenges,
 * and social feed in later steps.
 */

import React from 'react';
import { LeaderboardScreen } from './LeaderboardScreen';
import { PlayerScreen } from '../components/tomo-ui/playerDesign';

export function SocialScreen() {
  return (
    <PlayerScreen label="SOCIAL" title="Social" scroll={false}>
      <LeaderboardScreen />
    </PlayerScreen>
  );
}
