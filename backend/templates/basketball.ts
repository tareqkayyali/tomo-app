export default {
  name: "Basketball",
  warmup: {
    rest: [],
    light: [
      { exercise: "Light jogging", duration: "3 min" },
      { exercise: "Arm circles", reps: "10 each direction" },
      { exercise: "Leg swings", reps: "10 each leg" },
      { exercise: "Light ball handling", duration: "2 min" },
    ],
    moderate: [
      { exercise: "Jogging with high knees/butt kicks", duration: "5 min" },
      { exercise: "Dynamic stretching", duration: "3 min" },
      { exercise: "Ball handling drills", duration: "3 min" },
      { exercise: "Layup lines", duration: "3 min" },
    ],
    hard: [
      { exercise: "Dynamic warm-up circuit", duration: "7 min" },
      { exercise: "Agility ladder drills", duration: "3 min" },
      { exercise: "Ball handling at pace", duration: "3 min" },
      { exercise: "Shooting warm-up", duration: "5 min" },
      { exercise: "Sprint build-ups", reps: "3 x full court" },
    ],
  },
  workouts: {
    strength: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Bodyweight squats", sets: 2, reps: "12" },
        { exercise: "Push-ups", sets: 2, reps: "10" },
        { exercise: "Single-leg balance", sets: 2, duration: "30 sec each" },
        { exercise: "Core holds", sets: 2, duration: "30 sec" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Jump squats", sets: 3, reps: "10" },
        { exercise: "Lateral lunges", sets: 3, reps: "10 each" },
        { exercise: "Box jumps", sets: 3, reps: "8" },
        { exercise: "Medicine ball slams", sets: 3, reps: "12" },
        { exercise: "Plank variations", sets: 3, duration: "45 sec" },
      ]},
      hard: { duration: 55, exercises: [
        { exercise: "Power cleans", sets: 4, reps: "5" },
        { exercise: "Bulgarian split squats", sets: 4, reps: "8 each" },
        { exercise: "Depth jumps", sets: 4, reps: "6" },
        { exercise: "Weighted step-ups", sets: 3, reps: "10 each" },
        { exercise: "Core circuit", sets: 2, duration: "5 min" },
        { exercise: "Rotational medicine ball throws", sets: 3, reps: "8 each side" },
      ]},
    },
    cardio: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Light shooting around", duration: "15 min" },
        { exercise: "Easy court walking", duration: "5 min" },
      ]},
      moderate: { duration: 30, exercises: [
        { exercise: "Half-court games", duration: "20 min" },
        { exercise: "Continuous layup drill", duration: "10 min" },
      ]},
      hard: { duration: 45, exercises: [
        { exercise: "Full-court sprints", reps: "10 x down and back", notes: "30 sec rest between" },
        { exercise: "Defensive slides", duration: "5 min" },
        { exercise: "Game simulation drills", duration: "20 min" },
      ]},
    },
    skill: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 25, exercises: [
        { exercise: "Stationary ball handling", duration: "10 min" },
        { exercise: "Form shooting", reps: "30 shots", notes: "Close range" },
        { exercise: "Free throws", reps: "20" },
      ]},
      moderate: { duration: 40, exercises: [
        { exercise: "Ball handling circuit", duration: "15 min" },
        { exercise: "Shooting drill - spot up", reps: "50 shots" },
        { exercise: "Layup variations", duration: "10 min" },
        { exercise: "Passing drills", duration: "10 min" },
      ]},
      hard: { duration: 60, exercises: [
        { exercise: "Advanced ball handling", duration: "15 min" },
        { exercise: "Game-speed shooting", reps: "100 shots", notes: "Move between spots" },
        { exercise: "Finishing through contact", duration: "15 min" },
        { exercise: "1-on-1 moves", duration: "15 min" },
      ]},
    },
    recovery: {
      rest: { duration: 0, exercises: [] },
      light: { duration: 20, exercises: [
        { exercise: "Light shooting", duration: "10 min", notes: "No jumping" },
        { exercise: "Static stretching", duration: "10 min" },
      ]},
      moderate: { duration: 30, exercises: [
        { exercise: "Light ball handling while walking", duration: "10 min" },
        { exercise: "Foam rolling - legs", duration: "10 min" },
        { exercise: "Hip and ankle mobility", duration: "10 min" },
      ]},
      hard: { duration: 35, exercises: [
        { exercise: "Light shooting", duration: "10 min" },
        { exercise: "Full body foam rolling", duration: "15 min" },
        { exercise: "Yoga for athletes", duration: "10 min" },
      ]},
    },
  },
  cooldown: {
    standard: [
      { exercise: "Light jogging/walking", duration: "3 min" },
      { exercise: "Static stretching", duration: "5-7 min", notes: "Quads, hamstrings, hips, shoulders" },
      { exercise: "Free throws", reps: "10", notes: "End on made shot" },
    ],
  },
  focusAreas: ["explosiveness", "lateral quickness", "ball handling", "shooting", "conditioning"],
  modifications: {
    beginner: "Reduce intensity, focus on fundamentals, longer rest periods",
    injuries: "Avoid jumping for lower body injuries, limit contact drills",
  },
};
