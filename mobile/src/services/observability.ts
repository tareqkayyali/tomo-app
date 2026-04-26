import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { Sentry } from "./sentry";

let currentTraceId: string | null = null;

export function generateTraceId(): string {
  const traceId = Crypto.randomUUID();
  currentTraceId = traceId;
  return traceId;
}

export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

export function setSentryUser(userId: string): void {
  Sentry.setUser({ id: userId });
}

export function setSentryTraceContext(
  traceId: string,
  screen: string,
  feature: string
): void {
  Sentry.setTag("trace_id", traceId);
  Sentry.setTag("screen", screen);
  Sentry.setTag("feature", feature);
}

export function setSentryReleaseContext(
  appVersion: string,
  platform: string = Platform.OS
): void {
  Sentry.setTag("app_version", appVersion);
  Sentry.setTag("platform", platform);
}
