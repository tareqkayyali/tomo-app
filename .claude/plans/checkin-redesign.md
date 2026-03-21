# Check-in Screen Redesign — Gen Z UX

## Current State
- 7-step wizard with numbered grid buttons (1-10), basic progress bar, functional but dated
- Uses hardcoded `colors` import (not theme-aware)
- Grid of 10 tiny buttons per step feels like a form, not an experience

## Gen Z Redesign Principles Applied
1. **Emoji-driven steps** — Replace number grids with 5 large tappable emoji circles (much faster, more expressive)
2. **One card per step** — Each step is a full-screen card with bold question, emoji options, and instant feedback
3. **Dot progress** — Replace progress bar with minimal dots (like Instagram Stories)
4. **Swipe navigation** — Tap emoji auto-advances to next step (zero friction)
5. **Glass card aesthetic** — Match app's GlassCard + GlowWrapper pattern
6. **Theme-aware** — Use `useTheme()` hook for dark/light mode
7. **Haptic on every tap** — Selection, success, error feedback
8. **Large display value** — Show selected emoji large with label below
9. **Gradient submit button** — Orange→Teal gradient on final step
10. **Celebration screen** — Keep confetti + add animated readiness result

## Step Redesign (7 steps → 7 steps, same data, better UX)

| Step | Question | Input Type | Options |
|------|----------|-----------|---------|
| 1. Mood | How you feeling? | 5 emoji circles | 😫 😕 😐 🙂 😄 |
| 2. Sleep | How'd you sleep? | 5 emoji circles | 😴4h 😪5-6h 😊7h 😎8h 🤩9h+ |
| 3. Energy | Energy level? | 5 emoji circles | 🪫 😮‍💨 😐 ⚡ 🔥 |
| 4. Soreness | Body soreness? | 5 emoji circles | 💪 👍 😐 😣 🤕 |
| 5. Study Stress | Academic load? | 5 emoji circles | 😎 📚 😰 🤯 💀 |
| 6. Yesterday's Effort | Yesterday's training? | 5 emoji circles | 🛋️ 🚶 🏃 💪 🥵 |
| 7. Pain Check | Any pain/injury? | 2 large buttons | ✅ No / 🩹 Yes + location |

## Emoji → Value Mapping
- 5 options map to scale values: 2, 4, 6, 8, 10 (evenly distributed)
- Sleep maps to: 4, 5.5, 7, 8, 9.5 hours
- Maintains full backward compatibility with existing API payload

## Files Changed
- `mobile/src/screens/CheckinScreen.tsx` — Full rewrite with new UI, same exports/types/pure functions

## Files NOT Changed
- Backend API (same payload)
- Navigation (same route)
- Test file (pure function exports unchanged)
- CheckinHeaderButton (unchanged)
