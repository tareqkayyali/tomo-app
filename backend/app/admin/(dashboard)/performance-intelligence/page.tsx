"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlowOverview } from "@/components/admin/performance-intelligence/FlowOverview";
import { SportContextEditor } from "@/components/admin/performance-intelligence/SportContextEditor";
import { PHVConfigEditor } from "@/components/admin/performance-intelligence/PHVConfigEditor";
import { ReadinessMatrixEditor } from "@/components/admin/performance-intelligence/ReadinessMatrixEditor";
import { PromptTemplateEditor } from "@/components/admin/performance-intelligence/PromptTemplateEditor";

const TABS = [
  { value: "overview", label: "Flow Overview" },
  { value: "sport-context", label: "Sport Context" },
  { value: "phv-config", label: "PHV Safety" },
  { value: "readiness-matrix", label: "Readiness Matrix" },
  { value: "prompt-templates", label: "AI Prompts" },
];

export default function PerformanceIntelligencePage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground">
          Configure how the AI Chat system makes decisions about athlete training, load, benchmarks, and growth safety.
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

        <TabsContent value="overview" className="mt-6">
          <FlowOverview onNavigateTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="sport-context" className="mt-6">
          <SportContextEditor />
        </TabsContent>

        <TabsContent value="phv-config" className="mt-6">
          <PHVConfigEditor />
        </TabsContent>

        <TabsContent value="readiness-matrix" className="mt-6">
          <ReadinessMatrixEditor />
        </TabsContent>

        <TabsContent value="prompt-templates" className="mt-6">
          <PromptTemplateEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
