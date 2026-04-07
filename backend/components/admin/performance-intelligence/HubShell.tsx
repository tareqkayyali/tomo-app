"use client";

import { useState } from "react";
import { Step1AthleteSnapshot } from "./Step1AthleteSnapshot";
import { Step2Guardrails } from "./Step2Guardrails";
import { Step3ResponseQuality } from "./Step3ResponseQuality";
import { Step4SafetyFilters } from "./Step4SafetyFilters";

const STEPS = [
  { id: 0, label: "Athlete Snapshot", subtitle: "What data does the AI read?" },
  { id: 1, label: "Guardrails & Rules", subtitle: "When does the AI hold back?" },
  { id: 2, label: "AI Response Quality", subtitle: "How does the AI coach better?" },
  { id: 3, label: "Safety Filters", subtitle: "What does the AI never say?" },
];

export function HubShell() {
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-medium tracking-tight">Coaching Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the intelligence that guides every athlete's AI coaching
        </p>
      </div>

      {/* Step bar */}
      <div className="flex border-b border-border/50 overflow-x-auto">
        {STEPS.map((step) => (
          <button
            key={step.id}
            onClick={() => setActive(step.id)}
            className={`flex items-center gap-2.5 px-5 py-3.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
              active === step.id
                ? "border-green-500 text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                active === step.id
                  ? "bg-green-500/15 text-green-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step.id + 1}
            </span>
            {step.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="pt-6">
        {active === 0 && <Step1AthleteSnapshot onNext={() => setActive(1)} />}
        {active === 1 && <Step2Guardrails onBack={() => setActive(0)} onNext={() => setActive(2)} />}
        {active === 2 && <Step3ResponseQuality onBack={() => setActive(1)} onNext={() => setActive(3)} />}
        {active === 3 && <Step4SafetyFilters onBack={() => setActive(2)} />}
      </div>
    </div>
  );
}
