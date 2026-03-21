"use client";

import { TabDesignPage } from "@/components/admin/design/TabDesignPage";
import { TypographyEditor } from "@/components/admin/theme/TypographyEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState, useCallback } from "react";

export default function GlobalDesignPage() {
  const [typography, setTypography] = useState<Record<string, unknown>>({});

  const fetchTypography = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/themes", { credentials: "include" });
      if (res.ok) {
        const themes = await res.json();
        const active = themes.find((t: { is_active: boolean }) => t.is_active) || themes[0];
        if (active?.typography) setTypography(active.typography);
      }
    } catch {
      // handled in parent
    }
  }, []);

  useEffect(() => {
    fetchTypography();
  }, [fetchTypography]);

  return (
    <TabDesignPage tabKey="global">
      {/* Typography scale (unique to Global) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Typography Scale</CardTitle>
        </CardHeader>
        <CardContent>
          <TypographyEditor typography={typography} onChange={setTypography} />
        </CardContent>
      </Card>
    </TabDesignPage>
  );
}
