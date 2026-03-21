"use client";

import { useParams } from "next/navigation";
import { RatingLevelForm } from "@/components/admin/ratings/RatingLevelForm";

export default function NewRatingLevelPage() {
  const params = useParams<{ id: string }>();
  return <RatingLevelForm sportId={params.id} />;
}
