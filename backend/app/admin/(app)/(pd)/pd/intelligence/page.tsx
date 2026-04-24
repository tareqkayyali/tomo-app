import { HubShell } from "@/components/admin/performance-intelligence/HubShell";
import { PageGuide } from "@/components/admin/PageGuide";
import { performanceIntelligenceHelp } from "@/lib/cms-help/performance-intelligence";

export default function PerformanceIntelligencePage() {
  return (
    <div className="space-y-6">
      <PageGuide {...performanceIntelligenceHelp.hub.page} />
      <HubShell />
    </div>
  );
}
