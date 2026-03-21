"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export interface SelectOption {
  label: string;
  value: string;
}

export interface InputFieldDef {
  key: string;
  label: string;
  type: "number" | "text" | "select";
  unit: string;
  required: boolean;
  placeholder: string;
  min?: number;
  max?: number;
  step?: number;
  options?: SelectOption[];
}

interface InputFieldBuilderProps {
  fields: InputFieldDef[];
  onChange: (fields: InputFieldDef[]) => void;
}

const EMPTY_FIELD: InputFieldDef = {
  key: "",
  label: "",
  type: "number",
  unit: "",
  required: true,
  placeholder: "",
};

export function InputFieldBuilder({ fields, onChange }: InputFieldBuilderProps) {
  function updateField(index: number, patch: Partial<InputFieldDef>) {
    const updated = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange(updated);
  }

  function addField() {
    onChange([...fields, { ...EMPTY_FIELD }]);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    onChange(updated);
  }

  function updateOption(
    fieldIndex: number,
    optionIndex: number,
    patch: Partial<SelectOption>
  ) {
    const field = fields[fieldIndex];
    const options = [...(field.options || [])];
    options[optionIndex] = { ...options[optionIndex], ...patch };
    updateField(fieldIndex, { options });
  }

  function addOption(fieldIndex: number) {
    const field = fields[fieldIndex];
    const options = [...(field.options || []), { label: "", value: "" }];
    updateField(fieldIndex, { options });
  }

  function removeOption(fieldIndex: number, optionIndex: number) {
    const field = fields[fieldIndex];
    const options = (field.options || []).filter((_, i) => i !== optionIndex);
    updateField(fieldIndex, { options });
  }

  return (
    <div className="space-y-4">
      {fields.map((field, index) => (
        <Card key={index} className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            {/* Row 1: key, label, type, unit */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">
                  #{index + 1}
                </span>
              </div>
              <div className="flex-1 grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Key *</Label>
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(index, { key: e.target.value })}
                    placeholder="time30m"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Label *</Label>
                  <Input
                    value={field.label}
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                    placeholder="30m Time"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(v) => {
                      if (!v) return;
                      const newType = v as "number" | "text" | "select";
                      const patch: Partial<InputFieldDef> = { type: newType };
                      if (newType === "select" && !field.options?.length) {
                        patch.options = [{ label: "", value: "" }];
                      }
                      if (newType !== "number") {
                        patch.min = undefined;
                        patch.max = undefined;
                        patch.step = undefined;
                      }
                      updateField(index, patch);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={field.unit}
                    onChange={(e) =>
                      updateField(index, { unit: e.target.value })
                    }
                    placeholder="s, kg, cm..."
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: required, placeholder, number-specific fields */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(checked) =>
                    updateField(index, { required: !!checked })
                  }
                />
                <Label className="text-xs">Required</Label>
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  value={field.placeholder}
                  onChange={(e) =>
                    updateField(index, { placeholder: e.target.value })
                  }
                  placeholder="Placeholder text..."
                  className="h-8 text-sm"
                />
              </div>
              {field.type === "number" && (
                <>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Min</Label>
                    <Input
                      type="number"
                      value={field.min ?? ""}
                      onChange={(e) =>
                        updateField(index, {
                          min: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Max</Label>
                    <Input
                      type="number"
                      value={field.max ?? ""}
                      onChange={(e) =>
                        updateField(index, {
                          max: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-xs">Step</Label>
                    <Input
                      type="number"
                      value={field.step ?? ""}
                      onChange={(e) =>
                        updateField(index, {
                          step: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Select options editor */}
            {field.type === "select" && (
              <div className="ml-6 space-y-2">
                <Label className="text-xs font-medium">Options</Label>
                {(field.options || []).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <Input
                      value={opt.label}
                      onChange={(e) =>
                        updateOption(index, oi, { label: e.target.value })
                      }
                      placeholder="Label"
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      value={opt.value}
                      onChange={(e) =>
                        updateOption(index, oi, { value: e.target.value })
                      }
                      placeholder="Value"
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive"
                      onClick={() => removeOption(index, oi)}
                    >
                      X
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => addOption(index)}
                >
                  + Add Option
                </Button>
              </div>
            )}

            {/* Row actions */}
            <div className="flex items-center gap-1 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={index === 0}
                onClick={() => moveField(index, -1)}
              >
                Up
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={index === fields.length - 1}
                onClick={() => moveField(index, 1)}
              >
                Down
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive"
                onClick={() => removeField(index)}
              >
                Remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addField}>
        + Add Input Field
      </Button>
    </div>
  );
}
