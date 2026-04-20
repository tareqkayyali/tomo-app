"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FlagsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/feature-flags");
  }, [router]);
  return (
    <div className="text-center py-12 text-muted-foreground">
      Redirecting to Feature Flags...
    </div>
  );
}
