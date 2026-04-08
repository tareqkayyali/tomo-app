/**
 * Admin Protocols API — Condition Fields Metadata
 *
 * GET /api/v1/admin/protocols/fields   — Returns all available condition fields
 *                                        with labels, descriptions, types, ranges
 *
 * The CMS Protocol Builder reads this to populate the condition dropdown.
 * Adding a new field to types.ts auto-updates this endpoint.
 */

import { NextResponse } from 'next/server';
import { PD_FIELD_METADATA, PD_OPERATOR_LABELS } from '@/services/pdil';

export async function GET() {
  const fields = Object.values(PD_FIELD_METADATA).map(f => ({
    field:       f.field,
    label:       f.label,
    description: f.description,
    type:        f.type,
    unit:        f.unit ?? null,
    range:       f.range ?? null,
    options:     f.options ?? null,
  }));

  const operators = Object.entries(PD_OPERATOR_LABELS).map(([op, label]) => ({
    operator: op,
    label,
  }));

  const categories = [
    { value: 'safety',      label: 'Safety',      description: 'PHV gates, injury risk, ACWR danger' },
    { value: 'development', label: 'Development',  description: 'Periodization, strength phases, progression' },
    { value: 'recovery',    label: 'Recovery',     description: 'Post-match, deload, fatigue management' },
    { value: 'performance', label: 'Performance',  description: 'Peaking, taper, competition prep' },
    { value: 'academic',    label: 'Academic',     description: 'Exam period, dual-load, cognitive load' },
  ];

  return NextResponse.json({
    fields,
    operators,
    categories,
    priority_ranges: {
      safety_built_in:  { min: 1, max: 20, description: 'Built-in safety (immutable)' },
      safety_custom:    { min: 21, max: 50, description: 'PD safety extensions' },
      standard:         { min: 51, max: 100, description: 'Development/performance' },
      experimental:     { min: 101, max: 200, description: 'Experimental/optional' },
    },
  });
}
