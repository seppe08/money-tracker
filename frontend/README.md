# Money Tracker – frontend

Expo (React Native) app with TypeScript, Expo Router, and JWT authentication.

## Requirements

- Node.js 20+
- The [Expo Go](https://expo.dev/go) app on your phone, or an Android/iOS emulator
- The backend running (see `../backend/README.md`)

## Setup

```sh
npm install
cp .env.example .env   # optional; only needed for an explicit API URL
```

The app derives the backend URL automatically in `src/api/api-url.ts`:

- **Phone / Expo Go:** the Expo dev server's LAN address, e.g.
  `http://192.168.1.200:8000`
- **Android emulator:** `http://10.0.2.2:8000`
- **Web:** the page's hostname, e.g. `http://localhost:8000`

Set `EXPO_PUBLIC_API_URL` in `.env` only when the backend is not reachable at
the dev server's address, for example with `expo start --tunnel`.

## Run

```sh
npm start        # QR code for Expo Go
npm run android  # Android emulator / connected device
npm run ios      # iOS simulator (macOS only)
npm run web      # browser
```

## Backend connection

- Start the API bound to all interfaces:

  ```sh
  uv run fastapi dev app/main.py --host 0.0.0.0
  ```

  The default `127.0.0.1` is only reachable from the computer itself.
- Put the phone on the same Wi-Fi as the computer. The API URL shown at the
  bottom of the login screen is the one the app is using; open it in the phone's
  browser to confirm it responds.
- Allow Python through Windows Firewall when prompted (private network).
- `expo start --tunnel` tunnels the JavaScript bundle, not the API, so set
  `EXPO_PUBLIC_API_URL` to a reachable backend URL in that case.
- Restart the Expo dev server after changing `.env`.

## Authentication

- `src/auth/AuthContext.tsx` owns the session: `signIn`, `signUp`, `signOut`,
  and `authedRequest`, which retries once after refreshing an expired access
  token.
- The **refresh token** is stored with `expo-secure-store` (iOS Keychain /
  Android Keystore). The **access token stays in memory only** and is never
  persisted.
- On launch the app silently exchanges the stored refresh token at
  `/api/v1/auth/refresh`, then loads `/api/v1/users/me`. A failed refresh clears
  storage and shows the login screen.
- Refresh tokens rotate on every use, so concurrent refreshes are de-duplicated
  in the provider before they reach the API. Signing out revokes the session
  server-side.
- On web, `expo-secure-store` is unavailable, so the refresh token is kept in
  memory only: reloading the page requires signing in again. A production web
  client should use an HttpOnly refresh cookie instead.
- Routes are protected with Expo Router's `Stack.Protected`: `login`/`register`
  for signed-out users, the `(app)` group for signed-in users. The native splash
  stays up until the stored session has been checked.

## Scripts

```sh
npm run lint       # ESLint (expo lint)
npm run typecheck  # tsc --noEmit
```

## Structure

```
src/
  app/          # Expo Router routes
    (app)/      # Protected screens (home)
    login.tsx   # Sign-in screen
    register.tsx
  api/          # Backend client and types
  auth/         # Auth context and secure token storage
  components/   # Reusable UI components
  hooks/        # Data fetching hooks
  theme/        # Colors, spacing, radii
  utils/        # Formatting helpers
```
