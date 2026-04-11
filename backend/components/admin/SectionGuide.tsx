"use client";

export interface SectionGuideProps {
  text: string;
}

/**
 * Educational description for a section of related form fields.
 * Place inside a CardHeader alongside CardTitle/CardDescription.
 */
export function SectionGuide({ text }: SectionGuideProps) {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
  );
}
