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

interface InstructionStepsEditorProps {
  steps: string[];
  onChange: (steps: string[]) => void;
}

function SortableStep({
  id,
  index,
  value,
  onChangeValue,
  onRemove,
}: {
  id: string;
  index: number;
  value: string;
  onChangeValue: (value: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 mb-2"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground px-1 text-lg select-none"
        {...attributes}
        {...listeners}
      >
        ≡
      </button>
      <span className="text-sm text-muted-foreground w-6 shrink-0">
        {index + 1}.
      </span>
      <Input
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        placeholder={`Step ${index + 1}`}
        className="flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        ×
      </Button>
    </div>
  );
}

export function InstructionStepsEditor({
  steps,
  onChange,
}: InstructionStepsEditorProps) {
  const [ids] = useState(() => steps.map((_, i) => `step-${i}-${Date.now()}`));

  // Keep ids in sync with steps length
  while (ids.length < steps.length) {
    ids.push(`step-${ids.length}-${Date.now()}-${Math.random()}`);
  }
  while (ids.length > steps.length) {
    ids.pop();
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      const newSteps = arrayMove(steps, oldIndex, newIndex);
      const newIds = arrayMove(ids, oldIndex, newIndex);
      ids.splice(0, ids.length, ...newIds);
      onChange(newSteps);
    }
  }

  function handleChangeStep(index: number, value: string) {
    const newSteps = [...steps];
    newSteps[index] = value;
    onChange(newSteps);
  }

  function handleRemoveStep(index: number) {
    const newSteps = steps.filter((_, i) => i !== index);
    ids.splice(index, 1);
    onChange(newSteps);
  }

  function handleAddStep() {
    ids.push(`step-${ids.length}-${Date.now()}-${Math.random()}`);
    onChange([...steps, ""]);
  }

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {steps.map((step, index) => (
            <SortableStep
              key={ids[index]}
              id={ids[index]}
              index={index}
              value={step}
              onChangeValue={(v) => handleChangeStep(index, v)}
              onRemove={() => handleRemoveStep(index)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddStep}
        className="mt-2"
      >
        + Add Step
      </Button>
    </div>
  );
}
