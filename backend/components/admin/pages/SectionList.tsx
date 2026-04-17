"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionEditor, type SectionConfig } from "./SectionEditor";

export type { SectionConfig };

interface SectionListProps {
  sections: SectionConfig[];
  onChange: (s: SectionConfig[]) => void;
}

function SortableSection({
  section,
  index,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
}: {
  section: SectionConfig;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (s: SectionConfig) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.sectionId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg p-3 space-y-3 bg-background">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground text-lg leading-none"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
        <span className="font-mono text-sm font-medium flex-1">
          {section.sectionId}
        </span>
        <Switch
          size="sm"
          checked={section.visible}
          onCheckedChange={(checked) =>
            onUpdate({ ...section, visible: !!checked })
          }
        />
        <Button type="button" variant="ghost" size="sm" onClick={onToggleExpand}>
          {expanded ? "Collapse" : "Expand"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      {expanded && <SectionEditor section={section} onChange={onUpdate} />}
    </div>
  );
}

export function SectionList({ sections, onChange }: SectionListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newSectionId, setNewSectionId] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.sectionId === active.id);
    const newIndex = sections.findIndex((s) => s.sectionId === over.id);
    onChange(arrayMove(sections, oldIndex, newIndex));
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSection() {
    const id = newSectionId.trim();
    if (!id) return;
    if (sections.some((s) => s.sectionId === id)) return;

    onChange([
      ...sections,
      {
        sectionId: id,
        title: "",
        visible: true,
        cardVariant: "rounded",
      },
    ]);
    setNewSectionId("");
    setExpandedIds((prev) => new Set(prev).add(id));
  }

  function updateSection(index: number, section: SectionConfig) {
    const updated = [...sections];
    updated[index] = section;
    onChange(updated);
  }

  function removeSection(index: number) {
    onChange(sections.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.sectionId)}
          strategy={verticalListSortingStrategy}
        >
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sections yet. Add one below.
            </p>
          )}
          {sections.map((section, i) => (
            <SortableSection
              key={section.sectionId}
              section={section}
              index={i}
              expanded={expandedIds.has(section.sectionId)}
              onToggleExpand={() => toggleExpand(section.sectionId)}
              onUpdate={(s) => updateSection(i, s)}
              onRemove={() => removeSection(i)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <Input
          value={newSectionId}
          onChange={(e) => setNewSectionId(e.target.value)}
          placeholder="New section ID (e.g., hero_card)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSection();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addSection}>
          + Add Section
        </Button>
      </div>
    </div>
  );
}
