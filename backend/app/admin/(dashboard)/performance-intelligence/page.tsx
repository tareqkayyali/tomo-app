"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SportScienceLibrary } from "@/components/admin/performance-intelligence/SportScienceLibrary";
import { PerformanceStandards } from "@/components/admin/performance-intelligence/PerformanceStandards";
import { AthleteSafetyRules } from "@/components/admin/performance-intelligence/AthleteSafetyRules";
import { CoachingLanguageEditor } from "@/components/admin/performance-intelligence/CoachingLanguageEditor";
import { DecisionAudit } from "@/components/admin/performance-intelligence/DecisionAudit";

const TABS = [
  { value: "sport-science", label: "Sport Science Library" },
  { value: "performance-standards", label: "Performance Standards" },
  { value: "safety-rules", label: "Athlete Safety Rules" },
  { value: "coaching-language", label: "AI Coaching Language" },
  { value: "decision-audit", label: "Decision Audit" },
];

export default function CoachingIntelligenceHubPage() {
  const [activeTab, setActiveTab] = useState("sport-science");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coaching Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground">
          Configure the sports science knowledge that guides every athlete's AI coaching
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

        <TabsContent value="sport-science" className="mt-6">
          <SportScienceLibrary />
        </TabsContent>

        <TabsContent value="performance-standards" className="mt-6">
          <PerformanceStandards />
        </TabsContent>

        <TabsContent value="safety-rules" className="mt-6">
          <AthleteSafetyRules />
        </TabsContent>

        <TabsContent value="coaching-language" className="mt-6">
          <CoachingLanguageEditor />
        </TabsContent>

        <TabsContent value="decision-audit" className="mt-6">
          <DecisionAudit />
        </TabsContent>
      </Tabs>
    </div>
  );
}
