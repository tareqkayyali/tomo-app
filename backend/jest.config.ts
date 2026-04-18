/**
 * Jest config — pure-TS unit tests only.
 *
 * Covers suites in backend/__tests__/**. Integration tests that need
 * Supabase or Anthropic are owned by npx-tsx scripts (see scripts/
 * chat-test-runner.ts) — they don't belong in this harness. If you
 * catch yourself reaching for `setupFiles` or DB mocks here, split
 * the test out to scripts/ instead.
 */

import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  clearMocks: true,
};

export default config;
