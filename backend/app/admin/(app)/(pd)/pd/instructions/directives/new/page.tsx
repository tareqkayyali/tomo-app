"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import {
  DirectiveForm,
  freshDraft,
} from "../../_components/DirectiveForm";
import {
  DIRECTIVE_TYPE_LABEL,
  DIRECTIVE_TYPE_DESCRIPTION,
  SECTIONS,
} from "../../_components/directiveLabels";
import type { DirectiveType } from "@/lib/validation/admin/directiveSchemas";

function NewDirectiveInner() {
  const searchParams = useSearchParams();
  const documentId = searchParams.get("document_id");
  const initialType = searchParams.get("type") as DirectiveType | null;

  const [chosenType, setChosenType] = useState<DirectiveType | null>(initialType);

  if (!chosenType) {
    return (
      <div className="space-y-5">
        <Breadcrumbs
          items={[
            { label: "Performance Director", href: "/admin/pd/instructions" },
            { label: "Rules", href: "/admin/pd/instructions/directives" },
            { label: "New" },
          ]}
        />
        <div>
          <h2 className="text-base font-semibold">Add a rule — pick a category</h2>
          <p className="text-sm text-muted-foreground">
            What kind of rule are you writing? Pick the category that fits best — you can
            always change it later.
          </p>
        </div>

        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <section key={section.label} className={`rounded-lg border p-4 ${section.accent}`}>
              <header className="mb-3">
                <h3 className="text-sm font-semibold">{section.label}</h3>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </header>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {section.types.map((type) => (
                  <button
                    key={type}
                    onClick={() => setChosenType(type)}
                    className="rounded border bg-background p-3 text-left transition-shadow hover:shadow-sm"
                  >
                    <div className="text-sm font-medium">{DIRECTIVE_TYPE_LABEL[type]}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {DIRECTIVE_TYPE_DESCRIPTION[type]}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Breadcrumbs
        items={[
          { label: "Performance Director", href: "/admin/pd/instructions" },
          { label: "Rules", href: "/admin/pd/instructions/directives" },
          { label: "New" },
          { label: DIRECTIVE_TYPE_LABEL[chosenType] },
        ]}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setChosenType(null)}
        className="text-muted-foreground"
      >
        ← Pick a different category
      </Button>
      <DirectiveForm
        initial={freshDraft(chosenType, documentId)}
        mode="create"
        documentId={documentId}
      />
    </div>
  );
}

export default function NewDirectivePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <NewDirectiveInner />
    </Suspense>
  );
}
