import type { PageHelp } from "./types";

/** Consumed by: knowledge/page.tsx, knowledge/editor/page.tsx, knowledge/graph/page.tsx */
export const knowledgeHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "This is the library of sports science knowledge that Tomo's AI reads when answering athlete questions.",
      details: [
        'When an athlete asks "How do I improve my sprint speed?" or "Should I train today if my legs are sore?", the AI searches this library to find evidence-based information before generating a response.',
        "The quality and completeness of this library directly determines the quality of AI coaching.",
        "Well-curated knowledge means athletes receive specific, evidence-based answers tailored to their sport, age, and development stage.",
        "An empty or poorly organised knowledge base means the AI falls back to generic responses.",
      ],
      impact:
        "Well-curated knowledge means athletes receive specific, evidence-based answers tailored to their sport, age, and development stage. An empty or poorly organised knowledge base means the AI falls back to generic responses.",
      warning:
        "Knowledge chunks tagged with the wrong PHV stage (e.g. marking a high-load programme as safe for mid-PHV athletes) will be retrieved by the AI and may result in unsafe recommendations. Always tag PHV stages accurately.",
      storageKey: "knowledge-list",
    },
    fields: {
      search: {
        text: "Search by title or content keyword. Use this to check whether a topic already exists before creating a duplicate chunk.",
        example:
          'Search "ACL" to find all knowledge about ACL injury prevention before adding new content on the same topic.',
      },
      domain_filter: {
        text: "Filters the library by subject area. Each domain maps to different types of athlete questions. Use this to audit completeness — check that every domain has enough knowledge chunks.",
        example:
          '"Recovery" domain covers rest, sleep, and regeneration questions. "Youth Development" covers age-appropriate training and PHV-related content.',
      },
      evidence_grade_filter: {
        text: "Filters by scientific quality. Grade A = strongest evidence (systematic reviews). Grade D = weakest (expert opinion). Use this filter to ensure critical safety topics are covered by Grade A or B evidence, not just expert opinion.",
        warning:
          "If your PHV-related knowledge is mostly Grade D, upgrade it to Grade A/B sources. The AI prioritises higher-grade evidence in safety-critical situations.",
      },
      phv_stage_filter: {
        text: "Filter knowledge by which growth stage it applies to: Pre-PHV (pre-growth spurt), Mid-PHV (active growth spurt — highest risk), or Post-PHV (growth complete). Use this to audit that mid-PHV content is present and accurate — this is the most safety-critical stage.",
      },
    },
  },

  editor: {
    page: {
      summary:
        'This editor creates or edits a single piece of sports science knowledge (called a "chunk").',
      details: [
        "Each chunk teaches the AI something it can use when coaching athletes.",
        "Write in plain, clear English — the AI reads this directly and needs to understand it to apply it correctly.",
        "Longer, well-explained chunks produce better AI responses than short, bullet-pointed ones.",
        "Every chunk you save here is immediately available to the AI. If an athlete asks a question tonight that relates to this chunk, the AI will use it in its response.",
      ],
      impact:
        "Every chunk you save here is immediately available to the AI. If an athlete asks a question tonight that relates to this chunk, the AI will use it in its response.",
      warning:
        'Chunks that are too broad ("general fitness is important") are less useful than specific chunks ("plyometric loading during mid-PHV should be limited to bilateral jumps under 3 sets"). Be specific.',
      storageKey: "knowledge-editor",
    },
    fields: {
      title: {
        text: "A clear, searchable name for this knowledge chunk. Use it to describe the topic precisely so you can find it later and so the AI can identify it as relevant.",
        example:
          'Good: "ACWR Overload Thresholds for Youth Football Players" | Weak: "Training Load Info"',
      },
      domain: {
        text: "The subject category this chunk belongs to. The AI uses this to narrow its search when an athlete asks a domain-specific question. Choose the most specific domain that fits.",
        example:
          'A chunk about rest between sprint sessions = "Recovery". A chunk about managing exam stress = "Mental Performance".',
      },
      evidence_grade: {
        text: "How strong is the scientific evidence behind this chunk? Grade A = systematic review or meta-analysis (strongest). Grade B = randomised controlled trial. Grade C = cohort or observational study. Grade D = expert opinion or consensus (weakest). The AI gives higher priority to Grade A/B content when answering questions.",
        example:
          "A chunk based on a published Lancet meta-analysis = Grade A. A chunk based on your coaching experience = Grade D.",
        warning:
          "Be honest about evidence grade. Overrating evidence quality causes the AI to present weak evidence as strong science to athletes.",
      },
      phv_stages: {
        text: "Which growth stages does this knowledge apply to? PHV (Peak Height Velocity) refers to the period of maximum growth in young athletes. Mid-PHV is the highest-risk stage — bones grow faster than tendons, making high-impact loading dangerous. Tag accurately so the AI only retrieves this chunk for the right athletes.",
        example:
          'A chunk about plyometric loading restrictions should be tagged "Mid-PHV". A chunk about maximal strength training should NOT be tagged "Mid-PHV" — it is not appropriate for that stage.',
        warning:
          "If you are unsure which PHV stage a piece of knowledge applies to, do not guess. Leave it untagged and consult your sports scientist. Incorrect PHV tagging is a safety risk.",
      },
      age_bands: {
        text: "Which age groups does this knowledge apply to? Select all that are relevant. If a principle applies across all ages, select all bands. If it is specific to young athletes, select only the relevant bands.",
        example:
          "A chunk about growth plate protection applies to U13-U16. A chunk about periodisation for senior athletes applies to U18-Senior.",
      },
      sports: {
        text: "Which sports does this knowledge apply to? If a principle is universal (e.g. hydration, sleep), leave this broad or select all. If it is sport-specific (e.g. ACL mechanics in football), select only the relevant sport.",
      },
      entity_linkage: {
        text: 'Link this chunk to concepts in the Knowledge Graph. This helps the AI connect related topics — for example, linking a "hamstring strain" chunk to the "hamstring" body region and "Nordic curl" exercise entity so the AI can traverse relationships during complex questions.',
        example:
          'A chunk about sprint mechanics: link to entity "Sprint Speed", entity "Hamstring", entity "Hip Flexor".',
      },
      evidence_citations: {
        text: "Add journal references that support the content of this chunk. Citations do not appear to athletes, but they feed into the evidence grade and allow your team to audit knowledge quality over time.",
        example:
          '"Dalen et al. (2019) — ACWR in youth football, Journal of Sports Sciences, Grade A". Include the DOI or URL where possible.',
      },
    },
  },

  graph: {
    page: {
      summary:
        "This page shows a diagram of how all your sports science concepts, exercises, conditions, and protocols relate to each other.",
      details: [
        'When the AI receives a complex question — like "what exercises are safe for a mid-PHV player with knee pain?" — it navigates this map to find connected, safe recommendations.',
        "You do not edit content here; you use this view to verify that the connections make sense and that no important relationships are missing.",
        "If a connection between a condition and its safe exercise alternatives is missing, the AI cannot make that connection when coaching.",
        "The graph is the AI's reasoning map.",
      ],
      impact:
        'If the connection between "knee pain" and its safe exercise alternatives is missing from the graph, the AI cannot make that connection when coaching a player with knee pain. The graph is the AI\'s reasoning map.',
      warning:
        'Look especially at PHV-related nodes. Ensure all high-risk exercises (heavy Olympic lifts, high-impact plyometrics) are connected to mid-PHV with a "CONTRAINDICATED_FOR" relationship. Missing contraindication links are a safety gap.',
      storageKey: "knowledge-graph",
    },
    fields: {
      entity_type_filter: {
        text: 'Filter the graph to show only one type of entity at a time. Use this to check completeness — for example, filter to "Exercise" entities and verify all major exercises in your programme are present.',
        example:
          '"Body Region" entities should include: hamstring, quadriceps, knee, ankle, hip flexor, lumbar spine, shoulder. If any are missing, exercises linked to that region cannot be properly constrained in AI recommendations.',
      },
      node_click: {
        text: "Click any node to see its full details: what type of entity it is, which knowledge chunks reference it, and all its relationships to other entities. Use this to verify relationship direction and type are correct.",
        example:
          'Click "Nordic Curl" — you should see relationships like "TRAINS -> Hamstring", "PREVENTS -> Hamstring Strain", "SAFE_ALTERNATIVE_TO -> Romanian Deadlift (for mid-PHV)".',
      },
    },
  },
};
