import type { PageHelp } from "./types";

/** Consumed by: programs/page.tsx, ProgramForm.tsx */
export const programsHelp: Record<string, PageHelp> = {
  list: {
    page: {
      summary:
        "Programs are structured multi-week training blocks made up of drills arranged in a specific order with prescribed sets, reps, and rest.",
      details: [
        "When the AI determines an athlete needs a specific type of training (sprint development, ACL prevention, return-to-play), it recommends an appropriate program from this catalog.",
        "Athletes see the program as a series of planned sessions in their app timeline.",
        "Programs recommended by the AI go through eight automated checks (the guardrail system) to verify they match the athlete's readiness, workload, and position.",
        "A program with incorrect difficulty or targeting settings will pass through guardrails incorrectly.",
      ],
      impact:
        "Programs recommended by the AI go through eight automated checks (the guardrail system) to verify they match the athlete's readiness, workload, and position. A program with incorrect difficulty or targeting settings will pass through guardrails incorrectly.",
      warning:
        "Do not add a program to the catalog until it has been reviewed by a qualified coach or sports scientist for the target age band. The AI trusts the content of this catalog.",
      storageKey: "programs-list",
    },
    fields: {
      category: {
        text: "The training category this program belongs to. This is the primary way the AI matches programs to athlete needs. Choose the category that best describes the physical quality or injury focus of this program.",
        example:
          'A 6-week sprint development block = "Sprint". An 8-week knee resilience programme = "ACL Prevention". A 4-week return from hamstring strain = "Hamstring".',
      },
      duration_weeks: {
        text: "How many weeks the full programme lasts. This determines how far ahead the AI schedules sessions in the athlete's timeline. Programmes shorter than 3 weeks may not produce measurable adaptation.",
      },
      difficulty: {
        text: "The overall difficulty level of this programme. The AI matches programme difficulty to the athlete's current fitness rating and experience level. A beginner athlete will not be assigned an Elite-difficulty programme.",
        example:
          'A foundational movement programme for new athletes = "Beginner". An in-season maintenance programme for experienced athletes = "Intermediate". A pre-season peaking block = "Advanced".',
      },
      sessions_per_week: {
        text: "How many sessions per week this programme requires. The Planning Agent uses this to build a realistic weekly schedule. Set this accurately — a programme requiring 5 sessions per week will overload an athlete who only has 3 available training days.",
        warning:
          "For student-athletes, consider the academic load. A programme requiring 5 sessions per week may be appropriate in holiday periods but not during exam season.",
      },
      linked_drills_order: {
        text: "The sequence of drills within each session of this programme. Order matters — warm-up drills must come first, high-intensity main work in the middle, cool-down last. The app displays drills to the athlete in exactly this order.",
      },
      minimum_fitness_level: {
        text: "The minimum performance rating an athlete needs before this programme can be assigned. Prevents the AI from recommending advanced programmes to athletes who are not yet physically prepared.",
        warning:
          "Do not leave this blank. Without a minimum fitness level, the AI may assign this programme to any athlete, regardless of their readiness.",
      },
    },
  },
};
