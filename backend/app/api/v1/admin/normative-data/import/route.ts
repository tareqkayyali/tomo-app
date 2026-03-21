import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/apiAuth";
import { normativeCsvRowSchema } from "@/lib/validation/normativeSchemas";
import { importFromCsvRows } from "@/services/admin/normativeDataAdminService";
import Papa from "papaparse";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { sport_id, csv } = body as { sport_id?: string; csv?: string };

  if (!sport_id || !csv) {
    return NextResponse.json(
      { error: "sport_id and csv fields are required" },
      { status: 400 }
    );
  }

  // Parse CSV
  const parsed = Papa.parse(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        error: "CSV parsing failed",
        details: parsed.errors.slice(0, 10),
      },
      { status: 400 }
    );
  }

  // Validate each row
  const validatedRows = [];
  const validationErrors: { row: number; errors: string[] }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const result = normativeCsvRowSchema.safeParse(parsed.data[i]);
    if (result.success) {
      validatedRows.push(result.data);
    } else {
      validationErrors.push({
        row: i + 1,
        errors: result.error.issues.map((issue) => issue.message),
      });
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Validation failed for some rows",
        validationErrors: validationErrors.slice(0, 20),
        validRows: validatedRows.length,
        invalidRows: validationErrors.length,
      },
      { status: 400 }
    );
  }

  try {
    const result = await importFromCsvRows(sport_id, validatedRows);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to import normative data", detail: String(err) },
      { status: 500 }
    );
  }
}
