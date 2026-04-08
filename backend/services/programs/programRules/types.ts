/**
 * PD Program Rule Types
 *
 * Defines the shape of program assignment guidelines authored by the PD in the CMS.
 * Reuses the same condition DSL as pd_protocols and pd_signals.
 */

import type { PDRuleConditions } from '../../pdil/types';

export interface PDProgramRule {
  rule_id: string;
  name: string;
  description: string | null;
  category: 'safety' | 'development' | 'recovery' | 'performance' | 'injury_prevention' | 'position_specific' | 'load_management';
  conditions: PDRuleConditions;
  priority: number;

  // Program guidance
  mandatory_programs: string[];
  high_priority_programs: string[];
  blocked_programs: string[];
  prioritize_categories: string[];
  block_categories: string[];

  // Prescription overrides
  load_multiplier: number | null;
  session_cap_minutes: number | null;
  frequency_cap: number | null;
  intensity_cap: 'full' | 'moderate' | 'light' | 'rest' | null;

  // AI guidance
  ai_guidance_text: string | null;
  safety_critical: boolean;

  // Scope filters
  sport_filter: string[] | null;
  phv_filter: string[] | null;
  age_band_filter: string[] | null;
  position_filter: string[] | null;

  // Behavior
  is_built_in: boolean;
  is_enabled: boolean;
  version: number;

  // Metadata
  evidence_source: string | null;
  evidence_grade: 'A' | 'B' | 'C' | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Scope filter for pre-filtering rules by athlete attributes */
export interface ProgramRuleScopeFilter {
  sport?: string;
  phv_stage?: string;
  age_band?: string;
  position?: string;
}

/** Output of evaluating all matching rules — merged guidance for AI */
export interface ProgramRuleGuidance {
  /** Rules that fired */
  activeRules: {
    rule_id: string;
    name: string;
    category: string;
    priority: number;
    safety_critical: boolean;
  }[];

  /** Union of all mandatory programs across fired rules */
  mandatoryPrograms: string[];

  /** Union of all high-priority programs */
  highPriorityPrograms: string[];

  /** Union of all blocked programs */
  blockedPrograms: string[];

  /** Union of categories to prioritize */
  prioritizeCategories: string[];

  /** Union of categories to block */
  blockCategories: string[];

  /** Most restrictive load multiplier (MIN across fired rules) */
  loadMultiplier: number;

  /** Most restrictive session cap (MIN across fired rules) */
  sessionCapMinutes: number | null;

  /** Most restrictive frequency cap */
  frequencyCap: number | null;

  /** Most restrictive intensity cap */
  intensityCap: 'full' | 'moderate' | 'light' | 'rest';

  /** Concatenated AI guidance text (priority order) */
  aiGuidanceText: string;

  /** Whether ANY fired rule is safety-critical */
  isSafetyCritical: boolean;

  /** Evaluation timestamp */
  evaluatedAt: string;
}
