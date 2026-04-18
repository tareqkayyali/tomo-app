// Triangle — annotation recipient router.
//
// Pure function. Zero I/O. Given an annotation and the set of accepted
// relationships for the event's athlete, returns the list of user IDs
// that should receive a notification.
//
// Rule (per P2.1 design):
//   recipients = {event owner} ∪ {accepted guardians} − {author}
//                then filtered by visibility scope.
//
// Visibility scope JSON on the annotation is a per-role allow-list:
//   { athlete: true, coach: true, parent: true }
// Any recipient whose role flag is false is dropped. Non-athlete
// authors that author in a role the reader isn't allowed to see are
// also dropped (e.g., coach-authored note with visibility.coach=true
// but visibility.parent=false should NOT reach parents).
//
// Authors never receive their own annotation echo.

export type AuthorRole = "coach" | "parent" | "athlete" | "system";

export interface RelationshipRef {
  guardian_id: string;
  relationship_type: "coach" | "parent";
  status: "pending" | "accepted" | "revoked" | string;
}

export interface AnnotationForRouting {
  athlete_id: string;
  author_id: string;
  author_role: AuthorRole;
  visibility: {
    athlete?: boolean;
    coach?: boolean;
    parent?: boolean;
  };
}

export interface RecipientSpec {
  user_id: string;
  recipient_role: "athlete" | "coach" | "parent";
}

function visibilityGateOpen(
  visibility: AnnotationForRouting["visibility"],
  recipientRole: "athlete" | "coach" | "parent"
): boolean {
  const flag = visibility?.[recipientRole];
  // Default open when key absent. Explicit false closes.
  return flag !== false;
}

export function routeAnnotation(
  annotation: AnnotationForRouting,
  relationships: RelationshipRef[]
): RecipientSpec[] {
  const out: RecipientSpec[] = [];

  // 1. Event owner (the athlete) — always a candidate unless they're
  //    the author or visibility.athlete is closed.
  if (
    annotation.athlete_id !== annotation.author_id &&
    visibilityGateOpen(annotation.visibility, "athlete")
  ) {
    out.push({ user_id: annotation.athlete_id, recipient_role: "athlete" });
  }

  // 2. Guardians — one row per accepted relationship, deduped on
  //    guardian_id, scoped by visibility per role, minus the author.
  const seen = new Set<string>();
  for (const rel of relationships) {
    if (rel.status !== "accepted") continue;
    if (rel.guardian_id === annotation.author_id) continue;
    if (seen.has(rel.guardian_id)) continue;
    seen.add(rel.guardian_id);

    const role = rel.relationship_type;
    if (role !== "coach" && role !== "parent") continue;
    if (!visibilityGateOpen(annotation.visibility, role)) continue;

    out.push({ user_id: rel.guardian_id, recipient_role: role });
  }

  return out;
}
