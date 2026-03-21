"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface EquipmentItem {
  name: string;
  quantity: number;
  optional: boolean;
}

interface EquipmentEditorProps {
  equipment: EquipmentItem[];
  onChange: (equipment: EquipmentItem[]) => void;
}

export function EquipmentEditor({ equipment, onChange }: EquipmentEditorProps) {
  function handleChange(
    index: number,
    field: keyof EquipmentItem,
    value: string | number | boolean
  ) {
    const updated = [...equipment];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function handleAdd() {
    onChange([...equipment, { name: "", quantity: 1, optional: false }]);
  }

  function handleRemove(index: number) {
    onChange(equipment.filter((_, i) => i !== index));
  }

  return (
    <div>
      {equipment.length > 0 && (
        <div className="grid grid-cols-[1fr_80px_70px_36px] gap-2 mb-2 text-xs text-muted-foreground font-medium">
          <span>Name</span>
          <span>Qty</span>
          <span>Optional</span>
          <span />
        </div>
      )}
      {equipment.map((item, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_80px_70px_36px] gap-2 mb-2 items-center"
        >
          <Input
            value={item.name}
            onChange={(e) => handleChange(index, "name", e.target.value)}
            placeholder="Equipment name"
          />
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              handleChange(index, "quantity", parseInt(e.target.value) || 1)
            }
          />
          <div className="flex items-center justify-center">
            <Checkbox
              checked={item.optional}
              onCheckedChange={(checked) =>
                handleChange(index, "optional", !!checked)
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleRemove(index)}
            className="text-muted-foreground hover:text-destructive"
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="mt-2"
      >
        + Add Equipment
      </Button>
    </div>
  );
}
