// ── UI Config Types (shared between admin API and mobile) ──

export interface SectionConfig {
  sectionId: string;
  title: string;
  subtitle?: string;
  visible: boolean;
  sortOrder: number;
  cardVariant?: "blob" | "rounded" | "glass" | "muted" | "elevated" | "outlined";
  spacing?: {
    marginTop?: number;
    marginBottom?: number;
    paddingHorizontal?: number;
  };
  style?: Record<string, unknown>;
}

export interface PageMetadata {
  pageTitle?: string;
  subtitle?: string;
  tabLabels?: Record<string, string>;
  emptyStates?: Record<string, string>;
}

export interface PageColorOverrides {
  dark?: Record<string, string>;
  light?: Record<string, string>;
}

export interface PageConfigRow {
  id: string;
  screen_key: string;
  screen_label: string;
  sections: SectionConfig[];
  metadata: PageMetadata;
  color_overrides: PageColorOverrides;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppThemeRow {
  id: string;
  name: string;
  colors_dark: Record<string, unknown>;
  colors_light: Record<string, unknown>;
  typography: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureFlagRow {
  id: string;
  flag_key: string;
  enabled: boolean;
  description: string;
  sports: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigBundle {
  theme: AppThemeRow | null;
  pages: PageConfigRow[];
  flags: FeatureFlagRow[];
  fetched_at: string;
}
