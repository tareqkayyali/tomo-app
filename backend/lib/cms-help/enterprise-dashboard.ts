import type { PageHelp } from "./types";

/** Consumed by: enterprise/page.tsx, organizations/page.tsx, organizations/[id]/page.tsx, onboarding/page.tsx */
export const enterpriseDashboardHelp: Record<string, PageHelp> = {
  dashboard: {
    page: {
      summary:
        "This is your command centre showing live numbers for everything happening inside your organisation.",
      details: [
        "It shows how many athletes are active, how well the AI is performing, and whether your protocols are being applied correctly.",
        "You do not need to do anything on this page — it is read-only. Use it every morning to spot problems before they affect athletes.",
        "If the AI Quality Score drops below 80%, it means the AI is giving lower-quality coaching responses to athletes.",
        "If Protocol Compliance drops, it means some athletes are receiving recommendations that may not follow your sports science rules.",
      ],
      impact:
        "If the AI Quality Score drops below 80%, it means the AI is giving lower-quality coaching responses to athletes. If Protocol Compliance drops, it means some athletes are receiving recommendations that may not follow your sports science rules.",
      warning:
        "A PHV Safety Gate failure shown on this dashboard is a critical alert. It means the AI failed a safety check for a growth-stage athlete. Investigate immediately via the Evaluations page.",
      storageKey: "enterprise-dashboard",
    },
  },

  organizations_list: {
    page: {
      summary:
        "This page lists every institution, club, or group that uses Tomo through your platform.",
      details: [
        "Each organisation has its own athletes, coaches, protocols, and knowledge base.",
        "Think of each organisation as a completely separate workspace — athletes in one organisation cannot see data from another.",
        "Creating an organisation here is the first step to onboarding a new partner club or school.",
        "Until an organisation exists here, no athletes or coaches from that institution can use Tomo.",
      ],
      impact:
        "Creating an organisation here is the first step to onboarding a new partner club or school. Until an organisation exists here, no athletes or coaches from that institution can use Tomo.",
      storageKey: "organizations-list",
    },
    fields: {
      name: {
        text: "The full official name of the institution. This appears in the admin sidebar and in all internal reports. Athletes do not see this directly.",
        example:
          'e.g. "Bath City FC Academy" or "St. Joseph\'s High School Athletics"',
      },
      slug: {
        text: "A short web-safe identifier for this organisation. Used in internal URLs and API calls. Once set, do not change it — it can break data links.",
        example: 'e.g. "bath-city-fc" or "st-josephs-athletics"',
        warning:
          "Use lowercase letters, numbers, and hyphens only. No spaces or special characters.",
      },
      tier: {
        text: 'Sets where this organisation sits in the hierarchy. "Global" = Tomo platform level (you, the Super Admin). "Institution" = a school, club, or academy. "Group" = a sub-team within an institution (e.g. U16s within a club).',
        example: 'A new partner club should always be set to "Institution".',
      },
      parent_org: {
        text: "If this is a sub-group (e.g. a specific age group within a club), select the parent institution here. This controls which protocols and knowledge the group inherits.",
        example:
          '"U16 Squad" would have "Bath City FC Academy" as its parent.',
        warning:
          "If left empty, the organisation inherits directly from Global. Only set a parent if this is a genuine sub-group.",
      },
      subscription_level: {
        text: "The commercial tier for this organisation. This controls which features are available to coaches and athletes in this institution.",
        example:
          '"Enterprise" unlocks the full protocol builder and knowledge graph.',
      },
      max_athletes: {
        text: "The maximum number of athletes this organisation's licence covers. When this limit is reached, new athletes cannot be added until the licence is upgraded.",
        example:
          "A school with 120 student-athletes would set this to 120.",
      },
      contact_email: {
        text: "The primary admin contact for this organisation. Used for billing notices, system alerts, and onboarding communication.",
        example: "The athletic director's or head coach's email address.",
      },
    },
  },

  organization_detail: {
    page: {
      summary:
        "This page is the control centre for one specific institution.",
      details: [
        "You can add or remove staff members, see which global protocols this institution has inherited or customised, and adjust configuration settings.",
        "Changes here affect only this organisation — other institutions are not impacted.",
        "Assigning the wrong role to a staff member can give them access to pages they should not see.",
        "A coach who is accidentally set as a PD can modify protocols that affect all athletes.",
      ],
      impact:
        "Assigning the wrong role to a staff member can give them access to pages they should not see. A coach who is accidentally set as a PD can modify protocols that affect all athletes.",
      storageKey: "organization-detail",
    },
    fields: {
      member_role: {
        text: "Controls what this person can see and do in the CMS. PD (Performance Director) = full access to protocols, knowledge, and planning. Coach = training content only (drills, programs, assessments). Admin = can add/remove members but cannot edit content.",
        warning:
          "Only assign PD role to qualified sports science staff. PDs can edit the rules that govern every athlete's training recommendations.",
      },
      config_json: {
        text: "Advanced organisation-level settings in JSON format. Only edit this if instructed by Tomo support. Incorrect JSON here can cause the organisation's AI system to behave unexpectedly.",
        warning:
          "Do not edit this field unless you know exactly what you are changing. Invalid JSON will cause a configuration error for all users in this organisation.",
      },
    },
  },

  onboarding_wizard: {
    page: {
      summary:
        "This five-step wizard creates everything a new institution needs to start using Tomo.",
      details: [
        "It creates their account, their Performance Director login, their sport configuration, and their initial protocol setup.",
        "Complete all five steps in one session — the wizard saves progress between steps, but the institution is not active until you confirm in Step 5.",
        "After completing this wizard, the Performance Director receives a login invitation and can immediately begin configuring knowledge and protocols for their athletes.",
      ],
      impact:
        "After completing this wizard, the Performance Director receives a login invitation and can immediately begin configuring knowledge and protocols for their athletes.",
      warning:
        "Do not close the browser mid-wizard. Although progress is saved, an incomplete onboarding may leave an organisation in a partially active state. Always complete Step 5 to activate.",
      storageKey: "onboarding-wizard",
    },
    sections: {
      step1: {
        text: "Step 1 — Organisation Details: Basic information about the institution. This creates the organisation's account in Tomo. Everything here can be edited later from the Organisation Detail page, except the slug.",
      },
      step2: {
        text: "Step 2 — Performance Director Setup: The Performance Director is the sports science lead for this institution. They will be the main admin user — responsible for configuring knowledge, protocols, and planning rules. Enter their details here to send them an invitation email automatically.",
      },
      step3: {
        text: "Step 3 — Sport and Position Configuration: Select which sports this institution runs. The sports you choose here determine which assessments, drills, positions, and normative data are available to this institution's athletes and coaches. You can add more sports later from the Sports page.",
      },
      step4: {
        text: "Step 4 — Protocol Inheritance: Global safety protocols (PHV protection, overload limits) are always mandatory and cannot be removed. On this step, you choose which additional global best-practice protocols this institution should start with. The PD can customise these after onboarding.",
      },
      step5: {
        text: "Step 5 — Review and Activate: Review everything before confirming. Once you press Activate, the organisation is live, the PD receives their invitation, and athletes can begin onboarding. Nothing is live until this final confirmation.",
      },
    },
  },
};
