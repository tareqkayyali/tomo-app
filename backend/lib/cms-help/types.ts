import type { PageGuideProps } from "@/components/admin/PageGuide";
import type { FieldGuideProps } from "@/components/admin/FieldGuide";
import type { SectionGuideProps } from "@/components/admin/SectionGuide";

export type PageHelpConfig = PageGuideProps;
export type FieldHelpConfig = FieldGuideProps;
export type SectionHelpConfig = SectionGuideProps;

export interface PageHelp {
  page: PageHelpConfig;
  fields?: Record<string, FieldHelpConfig>;
  sections?: Record<string, SectionHelpConfig>;
}
