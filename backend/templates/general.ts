export default {
  name: "General Fitness",
  warmup: {
    rest: [],
    light: [
      { exercise: "Light walking", duration: "3 min" },
      { exercise: "Arm circles", reps: "10 each direction" },
      { exercise: "Hip circles", reps: "10 each direction" },
    ],
    moderate: [
      { exercise: "Jumping jacks", duration: "2 min" },
      { exercise: "Arm circles", reps: "15 each direction" },
      { exercise: "Leg swings", reps: "10 each leg" },
      { exercise: "Bodyweight squats", reps: "10" },
    ],
    hard: [
      { exercise: "Jump rope", duration: "3 min" },
      { exercise: "Dynamic stretches", duration: "2 min" },
      { exercise: "High knees", duration: "1 min" },
      { exercise: "Butt kicks", duration: "1 min" },
      { exercise: "Bodyweight squats", reps: "15" },
    ],
  },
  workouts: {
    strength: {
      rest: { duration: 0, exercises: [] },
      light: {
        duration: 20,
        exercises: [
          { exercise: "Wall push-ups", sets: 2, reps: "10" },
          { exercise: "Supported squats", sets: 2, reps: "10" },
          { exercise: "Dead bug", sets: 2, reps: "8 each side" },
        ],
      },
      moderate: {
        duration: 35,
        exercises: [
          { exercise: "Push-ups", sets: 3, reps: "10-12" },
          { exercise: "Goblet squats", sets: 3, reps: "12" },
          { exercise: "Dumbbell rows", sets: 3, reps: "10 each" },
          { exercise: "Lunges", sets: 3, reps: "10 each leg" },
          { exercise: "Plank", sets: 3, duration: "30 sec" },
        ],
      },
      hard: {
        duration: 50,
        exercises: [
          { exercise: "Barbell squats", sets: 4, reps: "8" },
          { exercise: "Bench press", sets: 4, reps: "8" },
          { exercise: "Deadlifts", sets: 4, reps: "6" },
          { exercise: "Pull-ups", sets: 3, reps: "8-10" },
          { exercise: "Overhead press", sets: 3, reps: "8" },
          { exercise: "Core circuit", sets: 2, duration: "5 min" },
        ],
      },
    },
    cardio: {
      rest: { duration: 0, exercises: [] },
      light: {
        duration: 20,
        exercises: [{ exercise: "Easy walking", duration: "20 min", notes: "Conversational pace" }],
      },
      moderate: {
        duration: 30,
        exercises: [
          { exercise: "Brisk walking or light jog", duration: "25 min" },
          { exercise: "Cool down walk", duration: "5 min" },
        ],
      },
      hard: {
        duration: 40,
        exercises: [
          { exercise: "Interval training", duration: "30 min", notes: "1 min hard, 2 min easy" },
          { exercise: "Cool down", duration: "10 min" },
        ],
      },
    },
    skill: {
      rest: { duration: 0, exercises: [] },
      light: {
        duration: 20,
        exercises: [
          { exercise: "Balance exercises", duration: "10 min" },
          { exercise: "Coordination drills", duration: "10 min" },
        ],
      },
      moderate: {
        duration: 30,
        exercises: [
          { exercise: "Agility ladder", duration: "15 min" },
          { exercise: "Reaction drills", duration: "15 min" },
        ],
      },
      hard: {
        duration: 45,
        exercises: [
          { exercise: "Complex movement patterns", duration: "20 min" },
          { exercise: "Sport-specific skills", duration: "25 min" },
        ],
      },
    },
    recovery: {
      rest: { duration: 0, exercises: [] },
      light: {
        duration: 15,
        exercises: [
          { exercise: "Light stretching", duration: "10 min" },
          { exercise: "Deep breathing", duration: "5 min" },
        ],
      },
      moderate: {
        duration: 25,
        exercises: [
          { exercise: "Foam rolling", duration: "10 min" },
          { exercise: "Static stretching", duration: "10 min" },
          { exercise: "Meditation", duration: "5 min" },
        ],
      },
      hard: {
        duration: 30,
        exercises: [
          { exercise: "Light walking", duration: "10 min" },
          { exercise: "Foam rolling", duration: "10 min" },
          { exercise: "Yoga flow", duration: "10 min" },
        ],
      },
    },
  },
  cooldown: {
    standard: [
      { exercise: "Light walking", duration: "3 min" },
      { exercise: "Static stretches", duration: "5 min" },
      { exercise: "Deep breathing", duration: "2 min" },
    ],
  },
  focusAreas: ["full body", "core stability", "mobility", "cardiovascular health"],
  modifications: {
    beginner: "Reduce sets/reps by 30%, focus on form",
    injuries: "Avoid exercises that stress injured areas, substitute with similar movements",
  },
};
