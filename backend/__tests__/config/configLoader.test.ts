/**
 * Unit tests for the config loader factory. Mocks `@/lib/supabase/admin`
 * to exercise every branch (cache hit, DB fetch, fallback on error,
 * fallback on malformed payload, rollout filtering, history emission).
 *
 * These tests do NOT hit a live DB — the supabase admin client is stubbed
 * so the test suite stays under 1s and CI-deterministic.
 */

import { z } from "zod";

// Supabase admin needs to be mocked BEFORE the loader imports it.
const mockMaybeSingle = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  })),
}));

import {
  createConfigLoader,
  invalidateConfigCache,
  getConfigCacheStatus,
} from "../../services/config/configLoader";
import {
  setConfigMetricSink,
  resetConfigMetricSink,
  type ConfigReadMetric,
} from "../../services/config/metrics";

const schema = z.object({
  weight:  z.number().min(0).max(1),
  label:   z.string(),
});

type Schema = z.infer<typeof schema>;

const DEFAULT: Schema = { weight: 0.5, label: "default" };

let emittedMetrics: ConfigReadMetric[] = [];

beforeEach(() => {
  mockMaybeSingle.mockReset();
  invalidateConfigCache();
  emittedMetrics = [];
  setConfigMetricSink((m) => emittedMetrics.push(m));
});

afterAll(() => {
  resetConfigMetricSink();
});

function makeEnvelope(overrides: Partial<Record<string, any>> = {}) {
  return {
    config_key:         "test_config_v1",
    payload:            { weight: 0.8, label: "db-value" },
    schema_version:     1,
    rollout_percentage: 100,
    sport_filter:       null,
    enabled:            true,
    updated_at:         new Date().toISOString(),
    updated_by:         null,
    change_reason:      "test",
    ...overrides,
  };
}

describe("createConfigLoader", () => {
  test("falls back to DEFAULT when no DB row exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a", sport: "football" });
    expect(result).toEqual(DEFAULT);
    expect(emittedMetrics).toHaveLength(1);
    expect(emittedMetrics[0].source).toBe("default");
    expect(emittedMetrics[0].validation_ok).toBe(true);
  });

  test("returns DB payload when row exists and payload is valid", async () => {
    mockMaybeSingle.mockResolvedValue({ data: makeEnvelope(), error: null });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a", sport: "football" });
    expect(result).toEqual({ weight: 0.8, label: "db-value" });
    expect(emittedMetrics[0].source).toBe("db");
    expect(emittedMetrics[0].validation_ok).toBe(true);
  });

  test("uses cache on second read within TTL", async () => {
    mockMaybeSingle.mockResolvedValue({ data: makeEnvelope(), error: null });

    const load = createConfigLoader({
      key:        "test_config_v1",
      schema,
      default:    DEFAULT,
      ttlSeconds: 300,
    });

    await load({ athleteId: "a" });
    await load({ athleteId: "a" });

    // First call hits DB, second hits cache — only one DB call should fire.
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(emittedMetrics[0].source).toBe("db");
    expect(emittedMetrics[1].source).toBe("cache");
  });

  test("falls back to DEFAULT when payload fails Zod validation", async () => {
    // Weight out of range (> 1) should fail the schema.
    mockMaybeSingle.mockResolvedValue({
      data: makeEnvelope({ payload: { weight: 99, label: "bogus" } }),
      error: null,
    });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a" });
    expect(result).toEqual(DEFAULT);
    expect(emittedMetrics[0].source).toBe("default");
    expect(emittedMetrics[0].validation_ok).toBe(false);
  });

  test("falls back to DEFAULT when DB call errors", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection timeout" },
    });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a" });
    expect(result).toEqual(DEFAULT);
    expect(emittedMetrics[0].source).toBe("default");
  });

  test("falls back to DEFAULT when athlete is outside rollout cohort", async () => {
    // rollout_percentage = 0 guarantees out-of-cohort regardless of hash.
    mockMaybeSingle.mockResolvedValue({
      data: makeEnvelope({ rollout_percentage: 0 }),
      error: null,
    });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a", sport: "football" });
    expect(result).toEqual(DEFAULT);
    expect(emittedMetrics[0].in_rollout).toBe(false);
  });

  test("falls back to DEFAULT when row is disabled", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: makeEnvelope({ enabled: false }),
      error: null,
    });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load({ athleteId: "a" });
    expect(result).toEqual(DEFAULT);
    expect(emittedMetrics[0].source).toBe("default");
  });

  test("verbose() returns payload + source + in_rollout for admin preview", async () => {
    mockMaybeSingle.mockResolvedValue({ data: makeEnvelope(), error: null });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    const result = await load.verbose({ athleteId: "a", sport: "football" });
    expect(result.payload).toEqual({ weight: 0.8, label: "db-value" });
    expect(result.source).toBe("db");
    expect(result.in_rollout).toBe(true);
  });

  test("invalidateConfigCache drops cached entry so next read hits DB", async () => {
    mockMaybeSingle.mockResolvedValue({ data: makeEnvelope(), error: null });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    await load({ athleteId: "a" });
    invalidateConfigCache("test_config_v1");
    await load({ athleteId: "a" });

    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
  });

  test("getConfigCacheStatus reflects cached entries", async () => {
    mockMaybeSingle.mockResolvedValue({ data: makeEnvelope(), error: null });

    const load = createConfigLoader({
      key:     "test_config_v1",
      schema,
      default: DEFAULT,
    });

    await load({ athleteId: "a" });
    const status = getConfigCacheStatus();
    expect(status).toHaveLength(1);
    expect(status[0].key).toBe("test_config_v1");
    expect(status[0].has_row).toBe(true);
    expect(status[0].age_ms).toBeGreaterThanOrEqual(0);
  });
});
