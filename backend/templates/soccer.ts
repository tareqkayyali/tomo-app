export default {
  name: "Soccer",
  warmup: {
    rest: [],
    light: [
      { exercise: "Light jogging", duration: "5 min" },
      { exercise: "Hip circles", reps: "10 each direction" },
      { exercise: "Leg swings", reps: "10 each leg" },
      { exercise: "Light ball work", duration: "3 min" },
    ],
    moderate: [
      { exercise: "Jogging with direction changes", duration: "5 min" },
      { exercise: "Dynamic stretching", duration: "5 min" },
      { exercise: "Ball mastery - basic", duration: "5 min" },
      { exercise: "Passing in pairs", duration: "3 min" },
    ],
    hard: [
      { exercise: "Progressive running", duration: "5 min", notes: "Jog to 75% sprint" },
      { exercise: "Dynamic stretching circuit", duration: "5 min" },
      { exercise: "Agility ladder", duration: "3 min" },
      { exercise: "Ball mastery at pace", duration: "5 min" },
      { exercise: "Rondo warm-up", duration: "5 min" },
    ],
  },
  workouts: {
    strength: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Bodyweight squats", sets: 2, reps: "12" },
        { exercise: "Calf raises", sets: 2, reps: "15" },
        { exercise: "Single-leg balance", sets: 2, duration: "30 sec each" },
        { exercise: "Core holds", sets: 2, duration: "30 sec" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Lateral lunges", sets: 3, reps: "10 each" },
        { exercise: "Single-leg squats", sets: 3, reps: "8 each" },
        { exercise: "Nordic curls", sets: 3, reps: "6" },
        { exercise: "Hip adductor exercises", sets: 3, reps: "12 each" },
        { exercise: "Rotational core work", sets: 3, reps: "10 each side" },
      ]},
      hard: { duration: 55, exercises: [
        { exercise: "Power step-ups", sets: 4, reps: "8 each" },
        { exercise: "Romanian deadlifts", sets: 4, reps: "8" },
        { exercise: "Box jumps", sets: 4, reps: "6" },
        { exercise: "Copenhagen planks", sets: 3, duration: "30 sec each" },
        { exercise: "Medicine ball rotational throws", sets: 3, reps: "8 each side" },
        { exercise: "Plyometric lunges", sets: 3, reps: "8 each" },
      ]},
    },
    cardio: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Light jogging with ball", duration: "20 min" },
        { exercise: "Easy passing", duration: "5 min" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Tempo runs", duration: "20 min", notes: "70-80% effort with ball" },
        { exercise: "Small-sided game (relaxed)", duration: "15 min" },
        { exercise: "Cool down jog", duration: "5 min" },
      ]},
      hard: { duration: 60, exercises: [
        { exercise: "High intensity interval running", duration: "20 min", notes: "30 sec sprint, 30 sec jog" },
        { exercise: "Small-sided game (intense)", duration: "25 min" },
        { exercise: "Sprint recovery runs", reps: "6 x 40m", notes: "Full recovery between" },
      ]},
    },
    skill: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Ball mastery - stationary", duration: "10 min" },
        { exercise: "Short passing", duration: "10 min" },
        { exercise: "First touch practice", duration: "5 min" },
      ]},
      moderate: { duration: 45, exercises: [
        { exercise: "Ball mastery - moving", duration: "15 min" },
        { exercise: "Passing combinations", duration: "15 min" },
        { exercise: "Shooting practice", duration: "10 min" },
        { exercise: "1v1 moves", duration: "5 min" },
      ]},
      hard: { duration: 60, exercises: [
        { exercise: "Advanced ball mastery", duration: "15 min" },
        { exercise: "Game-speed passing patterns", duration: "15 min" },
        { exercise: "Finishing drills", duration: "15 min" },
        { exercise: "Position-specific work", duration: "15 min" },
      ]},
    },
    recovery: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Light walking with ball", duration: "10 min" },
        { exercise: "Static stretching", duration: "10 min" },
      ]},
      moderate: { duration: 30, exercises: [
        { exercise: "Light juggling", duration: "10 min" },
        { exercise: "Foam rolling - legs", duration: "10 min" },
        { exercise: "Hip and groin stretches", duration: "10 min" },
      ]},
      hard: { duration: 40, exercises: [
        { exercise: "Pool recovery session", duration: "20 min", notes: "If available" },
        { exercise: "Full body foam rolling", duration: "10 min" },
        { exercise: "Yoga for athletes", duration: "10 min" },
      ]},
    },
  },
  cooldown: {
    standard: [
      { exercise: "Light jogging", duration: "5 min" },
      { exercise: "Static stretching", duration: "7-10 min", notes: "Quads, hamstrings, hip flexors, groin, calves" },
      { exercise: "Light ball work", duration: "3 min", notes: "Optional" },
    ],
  },
  focusAreas: ["endurance", "agility", "ball control", "change of direction", "shooting accuracy"],
  modifications: {
    beginner: "Reduce game intensity, focus on technique over speed",
    injuries: "Avoid sudden direction changes for ankle/knee injuries, reduce shooting power for hip issues",
  },
};
