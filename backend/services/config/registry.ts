/**
 * ════════════════════════════════════════════════════════════════════════════
 * Config Schema Registry
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Central map from `config_key` → Zod schema + human label + current
 * DEFAULT. Used by the admin write API to validate a proposed payload
 * without the consumer service being in the import graph, and by the
 * admin UI to render form metadata + default-vs-current diffs.
 *
 * Adding a new domain in a future PR (e.g. intensity_catalog_v1,
 * load_attribution_v1, notification_config_v1):
 *   1. Write the schema + DEFAULT + loader in the consumer's package
 *      (e.g. services/events/intensityCatalog.ts).
 *   2. Add an entry here importing both.
 *   3. The admin UI and write API pick it up automatically.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { z } from 'zod';
import {
  ccrsFormulaSchema,
  CCRS_FORMULA_DEFAULT,
} from '@/services/ccrs/ccrsFormulaConfig';
import {
  acwrConfigSchema,
  ACWR_CONFIG_DEFAULT,
} from '@/services/events/acwrConfig';
import {
  intensityCatalogSchema,
  INTENSITY_CATALOG_DEFAULT,
} from '@/services/events/intensityCatalogConfig';
import {
  loadAttributionSchema,
  LOAD_ATTRIBUTION_DEFAULT,
} from '@/services/events/loadAttributionConfig';
import {
  notificationConfigSchema,
  NOTIFICATION_CONFIG_DEFAULT,
} from '@/services/notifications/notificationConfig';

export interface ConfigRegistryEntry {
  key:       string;
  label:     string;
  category:  'readiness' | 'load' | 'intensity' | 'notifications';
  schema:    z.ZodType<unknown>;
  default:   unknown;
  summary:   string;
}

export const CONFIG_REGISTRY: ConfigRegistryEntry[] = [
  {
    key:      'ccrs_formula_v1',
    label:    'CCRS Formula',
    category: 'readiness',
    schema:   ccrsFormulaSchema,
    default:  CCRS_FORMULA_DEFAULT,
    summary:  'Cascade weights, PHV multipliers, freshness decay, confidence tiers, recommendation cutoffs, hard caps, and alert-flag thresholds that drive the readiness score.',
  },
  {
    key:      'acwr_config_v1',
    label:    'ACWR Configuration',
    category: 'load',
    schema:   acwrConfigSchema,
    default:  ACWR_CONFIG_DEFAULT,
    summary:  'Mode (hard_cap_only / full), ratio thresholds, zone multipliers, acute/chronic window sizes, load-channel weights (training vs academic), and injury-risk flag mapping.',
  },
  {
    key:      'intensity_catalog_v1',
    label:    'Intensity Catalog',
    category: 'intensity',
    schema:   intensityCatalogSchema,
    default:  INTENSITY_CATALOG_DEFAULT,
    summary:  'AU-per-hour rates by intensity bucket, academic AU rate, event-type overrides (match, recovery), program-difficulty and drill-intensity maps, WHOOP strain ladder, RPE → intensity mapping. Drives every load AU computation.',
  },
  {
    key:      'load_attribution_v1',
    label:    'Load Attribution',
    category: 'load',
    schema:   loadAttributionSchema,
    default:  LOAD_ATTRIBUTION_DEFAULT,
    summary:  'Completion triggers (manual tap, check-in retroactive, wearable match) with confidence weights, auto-skip window, and whether scheduled events feed ATL/CTL. Also gates the sessionHandler AU fallback (compute AU from intensity + duration when payload omits it).',
  },
  {
    key:      'notification_config_v1',
    label:    'Notifications',
    category: 'notifications',
    schema:   notificationConfigSchema,
    default:  NOTIFICATION_CONFIG_DEFAULT,
    summary:  'Push timing, quiet hours, suppression rules (match/exam days, checkin-already-submitted, wearable-already-confirmed), notification templates and deep link format. Currently only session_confirmation is defined; other classes land as they ship.',
  },
];

export function getRegistryEntry(key: string): ConfigRegistryEntry | undefined {
  return CONFIG_REGISTRY.find((e) => e.key === key);
}
