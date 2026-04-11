"use client";

export interface FieldGuideProps {
  text: string;
  example?: string;
  warning?: string;
}

/**
 * Inline help text for individual form fields.
 * Renders below the <Label> in the same style as existing inline helpers.
 */
export function FieldGuide({ text, example, warning }: FieldGuideProps) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{text}</p>
      {example && (
        <p className="text-xs text-muted-foreground/70 italic">{example}</p>
      )}
      {warning && (
        <p className="text-xs text-destructive">{warning}</p>
      )}
    </div>
  );
}
