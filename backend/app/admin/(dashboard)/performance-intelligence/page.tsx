"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SquadSportEditor } from "@/components/admin/performance-intelligence/SquadSportEditor";
import { DevelopmentPathwaysEditor } from "@/components/admin/performance-intelligence/DevelopmentPathwaysEditor";
import { AthleteProtectionEditor } from "@/components/admin/performance-intelligence/AthleteProtectionEditor";
import { CoachingVoiceEditor } from "@/components/admin/performance-intelligence/CoachingVoiceEditor";
import { LiveIntelligenceDashboard } from "@/components/admin/performance-intelligence/LiveIntelligenceDashboard";

const TABS = [
  { value: "squad-sport", label: "Squad & Sport" },
  { value: "development-pathways", label: "Development Pathways" },
  { value: "athlete-protection", label: "Athlete Protection" },
  { value: "coaching-voice", label: "Coaching Voice" },
  { value: "live-intelligence", label: "Live Intelligence" },
];

export default function CoachingIntelligenceHubPage() {
  const [activeTab, setActiveTab] = useState("squad-sport");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coaching Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground">
          Configure how Tomo coaches your athletes — no technical knowledge required
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="squad-sport" className="mt-6">
          <SquadSportEditor />
        </TabsContent>

        <TabsContent value="development-pathways" className="mt-6">
          <DevelopmentPathwaysEditor />
        </TabsContent>

        <TabsContent value="athlete-protection" className="mt-6">
          <AthleteProtectionEditor />
        </TabsContent>

        <TabsContent value="coaching-voice" className="mt-6">
          <CoachingVoiceEditor />
        </TabsContent>

        <TabsContent value="live-intelligence" className="mt-6">
          <LiveIntelligenceDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
