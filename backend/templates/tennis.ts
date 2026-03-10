export default {
  name: "Tennis",
  warmup: {
    rest: [],
    light: [
      { exercise: "Light jogging", duration: "3 min" },
      { exercise: "Arm circles", reps: "10 each direction" },
      { exercise: "Shoulder stretches", duration: "2 min" },
      { exercise: "Shadow swings", reps: "10 forehand, 10 backhand" },
    ],
    moderate: [
      { exercise: "Jogging with side shuffles", duration: "5 min" },
      { exercise: "Dynamic stretching", duration: "5 min" },
      { exercise: "Shadow swings at pace", duration: "3 min" },
      { exercise: "Mini tennis rally", duration: "5 min" },
    ],
    hard: [
      { exercise: "Progressive running", duration: "5 min" },
      { exercise: "Dynamic stretching circuit", duration: "5 min" },
      { exercise: "Agility ladder", duration: "3 min" },
      { exercise: "Quick feet drills", duration: "3 min" },
      { exercise: "High-pace shadow swings", duration: "5 min" },
    ],
  },
  workouts: {
    skill: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 30, exercises: [
        { exercise: "Serve technique practice", duration: "10 min", notes: "Focus on form" },
        { exercise: "Forehand consistency", duration: "10 min" },
        { exercise: "Backhand consistency", duration: "10 min" },
      ]},
      moderate: { duration: 45, exercises: [
        { exercise: "Serve practice", duration: "10 min" },
        { exercise: "Groundstroke rallies", duration: "15 min" },
        { exercise: "Volley practice", duration: "10 min" },
        { exercise: "Footwork drills", duration: "10 min" },
      ]},
      hard: { duration: 60, exercises: [
        { exercise: "Serve practice with targets", duration: "15 min" },
        { exercise: "Game-speed groundstrokes", duration: "15 min" },
        { exercise: "Approach and volley drills", duration: "15 min" },
        { exercise: "Point play simulation", duration: "15 min" },
      ]},
    },
    cardio: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Easy baseline rallies", duration: "15 min" },
        { exercise: "Light movement drills", duration: "10 min" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Baseline rally with movement", duration: "20 min" },
        { exercise: "Court sprints", reps: "6 x baseline to net" },
        { exercise: "Side-to-side shuffles", duration: "10 min" },
      ]},
      hard: { duration: 55, exercises: [
        { exercise: "High-intensity interval rallies", duration: "20 min" },
        { exercise: "Suicide sprints", reps: "8 sets" },
        { exercise: "Practice match", duration: "25 min" },
      ]},
    },
    strength: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Bodyweight squats", sets: 2, reps: "10" },
        { exercise: "Shoulder rotations with light band", sets: 2, reps: "12" },
        { exercise: "Core holds", sets: 2, duration: "30 sec" },
      ]},
      moderate: { duration: 35, exercises: [
        { exercise: "Lunges", sets: 3, reps: "10 each leg" },
        { exercise: "Rotational core exercises", sets: 3, reps: "12 each side" },
        { exercise: "Shoulder strengthening", sets: 3, reps: "10" },
        { exercise: "Wrist curls", sets: 2, reps: "15" },
      ]},
      hard: { duration: 50, exercises: [
        { exercise: "Split squats", sets: 4, reps: "8 each leg" },
        { exercise: "Medicine ball rotational throws", sets: 3, reps: "10 each side" },
        { exercise: "Shoulder press", sets: 3, reps: "10" },
        { exercise: "Core circuit", sets: 3, duration: "45 sec each" },
        { exercise: "Plyometric jumps", sets: 3, reps: "8" },
      ]},
    },
    recovery: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Light walking", duration: "10 min" },
        { exercise: "Static stretching", duration: "10 min" },
      ]},
      moderate: { duration: 30, exercises: [
        { exercise: "Foam rolling - shoulders and back", duration: "10 min" },
        { exercise: "Hip mobility work", duration: "10 min" },
        { exercise: "Shoulder and wrist stretches", duration: "10 min" },
      ]},
      hard: { duration: 40, exercises: [
        { exercise: "Full body foam rolling", duration: "15 min" },
        { exercise: "Yoga for tennis players", duration: "15 min" },
        { exercise: "Ice bath or contrast therapy", duration: "10 min", notes: "If available" },
      ]},
    },
  },
  cooldown: {
    standard: [
      { exercise: "Light hitting", duration: "3 min" },
      { exercise: "Walking", duration: "2 min" },
      { exercise: "Static stretching", duration: "7 min", notes: "Shoulders, forearms, hips, calves" },
    ],
  },
  focusAreas: ["serve accuracy", "footwork", "court coverage", "shot consistency", "mental focus"],
  modifications: {
    beginner: "Focus on technique over power, use slower ball feeds",
    injuries: "Avoid overhead serves for shoulder issues, reduce grip intensity for wrist/elbow problems",
  },
};
