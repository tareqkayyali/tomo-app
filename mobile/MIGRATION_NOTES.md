# Mobile Auth Migration: Firebase -> Supabase

## New files (copy into your mobile/src/services/)
- `supabase.ts` — Supabase client with AsyncStorage persistence
- `auth.ts` — Drop-in replacement for Firebase auth (same interface)
- `apiConfig.ts` — Updated with Vercel production URL

## Required changes in existing mobile code

### 1. Install new dependencies
```bash
cd tomo/mobile
npx expo install @supabase/supabase-js react-native-url-polyfill
npm uninstall firebase
```

### 2. Update api.ts — Add /v1/ prefix
All API endpoints need the `/v1/` prefix. Example changes:
- `/api/checkin` → `/api/v1/checkin`
- `/api/today` → `/api/v1/today`
- `/api/user` → `/api/v1/user`
- `/api/user/register` → `/api/v1/user/register`
- `/api/user/onboarding` → `/api/v1/user/onboarding`
- `/api/feedback` → `/api/v1/feedback`
- `/api/stats` → `/api/v1/stats`

Health check changes: `/health` → `/api/health`

### 3. Update useAuth.tsx
- Replace `import { ... } from '../services/auth'` — uses same interface, no changes needed
- Remove Firebase-specific imports if any remain

### 4. Remove firebase.ts
Delete `mobile/src/services/firebase.ts` (Firebase config/init file)

### 5. Add environment variables
Create/update `app.config.js` or `app.json` extra config:
```json
{
  "expo": {
    "extra": {
      "supabaseUrl": "YOUR_SUPABASE_URL",
      "supabaseAnonKey": "YOUR_SUPABASE_ANON_KEY"
    }
  }
}
```

Or use `.env` with expo-env:
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
