/** Pulse spec — program / rail accents (hex). */
export const PULSE_CATEGORY: Record<string, string> = {
  speed: '#7A9B76',
  strength: '#8FA8C0',
  power: '#C8A27A',
  mobility: '#9BB8A5',
  endurance: '#A09BB8',
  coach: '#A08CC4',
  agility: '#C8A27A',
  technical: '#8FA8C0',
  default: '#7A9B76',
};

export function pulseCategoryColor(category: string | null | undefined): string {
  if (!category) return PULSE_CATEGORY.default;
  const k = category.toLowerCase().replace(/\s+/g, '-');
  return PULSE_CATEGORY[k] ?? PULSE_CATEGORY.default;
}
