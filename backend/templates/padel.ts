export default {
  name: "Padel",
  warmup: {
    rest: [],
    light: [
      { exercise: "Light jogging", duration: "3 min" },
      { exercise: "Arm circles", reps: "10 each direction" },
      { exercise: "Wrist rotations", reps: "10 each direction" },
      { exercise: "Shadow swings", duration: "3 min" },
    ],
    moderate: [
      { exercise: "Jogging with direction changes", duration: "5 min" },
      { exercise: "Dynamic stretching", duration: "5 min" },
      { exercise: "Wall bounce practice", duration: "3 min" },
      { exercise: "Light rally", duration: "5 min" },
    ],
    hard: [
      { exercise: "Progressive running", duration: "5 min" },
      { exercise: "Dynamic stretching circuit", duration: "5 min" },
      { exercise: "Quick feet ladder drills", duration: "3 min" },
      { exercise: "Reaction drills", duration: "3 min" },
      { exercise: "Fast-paced rally warm-up", duration: "5 min" },
    ],
  },
  workouts: {
    skill: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 30, exercises: [
        { exercise: "Serve technique practice", duration: "10 min" },
        { exercise: "Wall shots - forehand", duration: "10 min" },
        { exercise: "Wall shots - backhand", duration: "10 min" },
      ]},
      moderate: { duration: 45, exercises: [
        { exercise: "Serve practice", duration: "10 min" },
        { exercise: "Volley practice at net", duration: "10 min" },
        { exercise: "Bandeja and vibora practice", duration: "15 min" },
        { exercise: "Lob defense drills", duration: "10 min" },
      ]},
      hard: { duration: 60, exercises: [
        { exercise: "Serve and volley patterns", duration: "15 min" },
        { exercise: "Wall play combinations", duration: "15 min" },
        { exercise: "Smash and overhead drills", duration: "15 min" },
        { exercise: "Point simulation", duration: "15 min" },
      ]},
    },
    cardio: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Easy rally", duration: "15 min" },
        { exercise: "Light court movement", duration: "10 min" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Rally with movement", duration: "20 min" },
        { exercise: "Court positioning drills", duration: "10 min" },
        { exercise: "Side shuffle practice", duration: "10 min" },
      ]},
      hard: { duration: 55, exercises: [
        { exercise: "High-intensity point play", duration: "20 min" },
        { exercise: "Sprint recovery drills", reps: "8 sets" },
        { exercise: "Practice match", duration: "25 min" },
      ]},
    },
    strength: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Bodyweight squats", sets: 2, reps: "10" },
        { exercise: "Shoulder stability exercises", sets: 2, reps: "10" },
        { exercise: "Core holds", sets: 2, duration: "30 sec" },
      ]},
      moderate: { duration: 35, exercises: [
        { exercise: "Lateral lunges", sets: 3, reps: "10 each leg" },
        { exercise: "Rotational core work", sets: 3, reps: "12 each side" },
        { exercise: "Shoulder strengthening", sets: 3, reps: "10" },
        { exercise: "Wrist and forearm work", sets: 2, reps: "15" },
      ]},
      hard: { duration: 50, exercises: [
        { exercise: "Split squats", sets: 4, reps: "8 each leg" },
        { exercise: "Medicine ball throws", sets: 3, reps: "10 each side" },
        { exercise: "Push-ups with rotation", sets: 3, reps: "10" },
        { exercise: "Core circuit", sets: 3, duration: "45 sec each" },
        { exercise: "Box jumps", sets: 3, reps: "8" },
      ]},
    },
    recovery: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Light walking", duration: "10 min" },
        { exercise: "Static stretching", duration: "10 min" },
      ]},
      moderate: { duration: 30, exercises: [
        { exercise: "Foam rolling", duration: "10 min" },
        { exercise: "Hip and shoulder mobility", duration: "10 min" },
        { exercise: "Wrist and forearm stretches", duration: "10 min" },
      ]},
      hard: { duration: 40, exercises: [
        { exercise: "Full body foam rolling", duration: "15 min" },
        { exercise: "Yoga flow", duration: "15 min" },
        { exercise: "Cold therapy", duration: "10 min", notes: "If available" },
      ]},
    },
  },
  cooldown: {
    standard: [
      { exercise: "Easy hitting", duration: "3 min" },
      { exercise: "Walking", duration: "2 min" },
      { exercise: "Static stretching", duration: "7 min", notes: "Shoulders, wrists, hips, calves" },
    ],
  },
  focusAreas: ["wall play", "net game", "positioning", "shot selection", "partner communication"],
  modifications: {
    beginner: "Focus on basic shots and positioning, practice wall bounces more",
    injuries: "Avoid overhead shots for shoulder issues, reduce wrist snap for elbow/wrist problems",
  },
};
