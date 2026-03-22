import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const isConfigured = !!SENTRY_DSN;

export function initSentry() {
  if (!isConfigured) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    environment: __DEV__ ? 'development' : 'production',
    beforeSend(event) {
      if (__DEV__) return null;
      return event;
    },
  });
}

/**
 * Wraps the root component with Sentry error boundary.
 * Falls back to a no-op wrapper when Sentry DSN is not configured.
 */
export function wrapWithSentry<P extends object>(component: ComponentType<P>): ComponentType<P> {
  if (!isConfigured) return component;
  return Sentry.wrap(component as any) as any;
}

export { Sentry };
