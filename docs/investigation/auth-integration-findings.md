# Auth & Integration Compatibility Investigation Report

## Summary

This report investigates the compatibility challenges of running the current voice conversation web app (React + Vite client, Hono + Node.js server) inside a Capacitor WebView for iOS and Android deployment. The investigation covers six critical areas: Firebase Authentication, CORS configuration, secure context requirements, storage persistence, network/fetch behavior, and Capacitor server configuration.

**Key findings:**
- `signInWithPopup()` will **not work** in Capacitor WebView and must be replaced with a native authentication flow.
- CORS requires explicit server-side configuration for Capacitor-specific origins (`capacitor://localhost` on iOS, `http://localhost` on Android).
- Secure context requirements for `getUserMedia` and WebRTC are satisfied by Capacitor's default configuration on both platforms.
- Storage persistence (localStorage, IndexedDB, Firebase Auth state) is generally reliable in Capacitor but has platform-specific caveats.
- `fetch()` works from Capacitor WebView but requires proper CORS or use of Capacitor's native HTTP plugin.
- Two viable deployment modes exist: local content + remote API, or fully remote URL mode.

---

## 1. Firebase Authentication in WebView

### Problem

The current implementation uses `signInWithPopup(firebaseAuth, googleProvider)` in `app/client/src/lib/auth.ts`. This method fails in Capacitor WebView for several fundamental reasons:

1. **Popup blocking**: WebViews do not support `window.open()` popups the way desktop browsers do. On iOS (WKWebView) and Android (Android WebView), popup windows are either blocked entirely or open in an uncontrollable manner that breaks the OAuth redirect flow.

2. **Cross-origin restrictions**: The OAuth popup flow requires opening a Google authentication page, receiving the OAuth response, and communicating the result back to the opener window via `postMessage`. In WebViews, this cross-origin communication is restricted or impossible.

3. **Google's policy on embedded WebViews**: Google explicitly blocks OAuth sign-in from embedded WebViews (user-agent restrictions). Google's OAuth 2.0 policy has historically disallowed authentication flows inside WebViews that are not the system browser or a recognized in-app browser tab (like ASWebAuthenticationSession on iOS or Chrome Custom Tabs on Android).

4. **`signInWithRedirect()` limitations**: While `signInWithRedirect()` avoids popups, it also has issues in Capacitor WebView:
   - On iOS with `capacitor://localhost` origin, the redirect back from Google's OAuth page may not resolve correctly.
   - The redirect flow expects the app to reload at the redirect URL, which may not work as expected in a locally-served WebView context.
   - Firebase SDK's `getRedirectResult()` relies on `sessionStorage` or the URL hash, which may not persist correctly across the redirect in a WebView.

### Solution Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. `@capacitor-firebase/authentication`** | Official Capacitor community plugin; uses native Firebase SDK for sign-in, then syncs credentials to Firebase Web SDK; supports Google, Apple, and other providers; well-maintained | Requires native project configuration (GoogleService-Info.plist, google-services.json); adds native dependency; platform-specific setup | **Recommended** |
| **B. `@codetrix-studio/capacitor-google-auth`** | Focused specifically on Google Sign-In; simpler API; uses Google Sign-In native SDK | Only covers Google (not Apple or other providers); may not be maintained long-term; credential must be manually synced to Firebase | Viable alternative for Google-only |
| **C. `signInWithRedirect()` with `@capacitor/browser`** | No native Firebase SDK dependency; stays closer to web-only code | Unreliable redirect resolution in WebView; Google may block embedded WebView user-agent; poor UX with external browser switch | Not recommended |
| **D. Custom OAuth with system browser** | Full control over flow; uses ASWebAuthenticationSession / Chrome Custom Tabs | Complex implementation; must handle deep link callback; requires manual Firebase credential creation | Not recommended unless other plugins fail |
| **E. Firebase Phone Auth (alternative)** | Works well in WebView; no popup/redirect needed; appropriate for elderly users who may prefer phone number | Different auth provider (not Google); requires SMS costs; phone number may change | Consider as supplementary option |

### Recommended Approach

**Option A: `@capacitor-firebase/authentication`**

This plugin bridges native Firebase Authentication SDKs (iOS/Android) with the Firebase Web SDK. The flow works as follows:

1. The native SDK presents the platform's native Google Sign-In UI (Google Identity Services on Android, Google Sign-In SDK on iOS).
2. The user authenticates natively -- this is not blocked by WebView restrictions.
3. The plugin returns the credential (ID token / access token) to the JavaScript layer.
4. The credential is used to sign in to the Firebase Web SDK via `signInWithCredential()`.
5. From this point, `firebaseAuth.currentUser`, `getIdToken()`, and `onAuthStateChanged()` all work as expected.

**Code change required in `auth.ts`:**

```typescript
import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

import { firebaseAuth } from "./firebase";

import type { User, Unsubscribe } from "firebase/auth";

/**
 * Sign in with Google.
 * Uses native sign-in flow on Capacitor (mobile), popup on web.
 */
export async function signInWithGoogle(): Promise<User> {
  if (Capacitor.isNativePlatform()) {
    // Native flow: use Capacitor Firebase Auth plugin
    const result = await FirebaseAuthentication.signInWithGoogle();

    // Sync the native credential to the Firebase Web SDK
    const credential = GoogleAuthProvider.credential(
      result.credential?.idToken ?? null,
      result.credential?.accessToken ?? null,
    );
    const userCredential = await signInWithCredential(
      firebaseAuth,
      credential,
    );
    return userCredential.user;
  } else {
    // Web flow: use popup (existing behavior)
    const { signInWithPopup } = await import("firebase/auth");
    const googleProvider = new GoogleAuthProvider();
    const popupResult = await signInWithPopup(firebaseAuth, googleProvider);
    return popupResult.user;
  }
}
```

**Key points about this approach:**
- The web flow (development, desktop browser) remains unchanged -- `signInWithPopup` is used when not on a native platform.
- On native platforms, the plugin handles the native Google Sign-In, and the result is synced to the Firebase Web SDK.
- After `signInWithCredential()` succeeds, all existing code that uses `firebaseAuth.currentUser`, `getIdToken()`, and `onAuthStateChanged()` continues to work without modification.
- The `fetchWithAuth()` function in `api.ts` requires **no changes** -- it already reads the token from `firebaseAuth.currentUser.getIdToken()`.

### Required Setup

#### Firebase Console

1. **Enable Google Sign-In provider**: Already done (current web app uses it).
2. **Add iOS app**: In Firebase Console > Project Settings > General > "Your apps", add an iOS app with the app's bundle identifier (e.g., `com.example.ohanashi`). Download `GoogleService-Info.plist`.
3. **Add Android app**: Add an Android app with the package name and SHA-1 fingerprint of the signing certificate. Download `google-services.json`.

#### Google Cloud Console

1. **OAuth 2.0 Client IDs**: Firebase automatically creates web client IDs. For native apps, ensure:
   - An **iOS** OAuth client ID exists (type: iOS application) with the correct bundle ID.
   - An **Android** OAuth client ID exists (type: Android application) with the correct package name and SHA-1.
2. **Consent Screen**: Ensure the OAuth consent screen is configured with the app name, support email, and appropriate scopes (email, profile).

#### Native Project Configuration

**iOS (in `ios/App/App/`):**
- Place `GoogleService-Info.plist` in the Xcode project.
- Add the reversed client ID as a URL scheme in `Info.plist`:
  ```xml
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
      </array>
    </dict>
  </array>
  ```
- In `AppDelegate.swift`, no additional code is typically needed if using the Capacitor plugin (it auto-registers).

**Android (in `android/app/`):**
- Place `google-services.json` in `android/app/`.
- Ensure `build.gradle` applies the Google Services plugin.
- Add SHA-1 fingerprint to Firebase Console (for both debug and release keystores).

#### Plugin Installation

```bash
npm install @capacitor-firebase/authentication firebase
npx cap sync
```

The `firebase` package is already installed. `@capacitor-firebase/authentication` adds the native SDK bridges.

#### Additional Consideration: Apple Sign-In

For iOS App Store distribution, Apple requires apps that offer third-party sign-in (Google) to also offer Sign in with Apple. `@capacitor-firebase/authentication` supports Apple Sign-In as well:

```typescript
export async function signInWithApple(): Promise<User> {
  const result = await FirebaseAuthentication.signInWithApple();
  const provider = new OAuthProvider("apple.com");
  const credential = provider.credential({
    idToken: result.credential?.idToken ?? "",
    rawNonce: result.credential?.nonce ?? "",
  });
  const userCredential = await signInWithCredential(firebaseAuth, credential);
  return userCredential.user;
}
```

---

## 2. CORS Configuration

### Problem

The current server (`app/server/src/index.ts`) has **no CORS middleware**. This works in production because the client is served as static files from the same origin (Hono serves both the API and the static client build). In development, the Vite dev server proxies requests or operates on `http://localhost:5173` with the API on `http://localhost:3000`.

When running in Capacitor WebView, the origin changes:
- **iOS**: `capacitor://localhost` -- a custom scheme that is not `http://` or `https://`.
- **Android**: `http://localhost` -- standard HTTP on localhost.

If the Capacitor app makes `fetch()` requests to the remote Railway server (e.g., `https://your-app.railway.app/api/...`), the browser's same-origin policy triggers CORS preflight checks. Without CORS headers, all API requests will fail.

### Solution

Add Hono CORS middleware to the server. The `hono/cors` package provides this functionality.

**Server-side change required in `index.ts`:**

```typescript
import { cors } from "hono/cors";

const config = loadConfig();
const app = new Hono();

// CORS middleware - must be before route registration
app.use(
  "/api/*",
  cors({
    origin: config.allowedOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400, // 24 hours preflight cache
    credentials: true,
  }),
);
```

**Environment variable update for `ALLOWED_ORIGINS`:**

```
# Development
ALLOWED_ORIGINS=http://localhost:5173,capacitor://localhost,http://localhost

# Production
ALLOWED_ORIGINS=https://your-app.railway.app,capacitor://localhost,http://localhost
```

**Important considerations:**

1. **`capacitor://localhost`** (iOS) is the critical origin. This is a non-standard scheme and some CORS implementations may not handle it correctly. Hono's `cors()` middleware does string matching on the `Origin` header, so it should work.

2. **Android WebView origin**: Android Capacitor uses `http://localhost` by default. This is a standard HTTP origin and works with standard CORS.

3. **Preflight caching**: The `maxAge: 86400` setting tells browsers to cache preflight responses for 24 hours, reducing the number of OPTIONS requests.

4. **Credentials**: Setting `credentials: true` is necessary because the `Authorization` header is a non-simple header that triggers preflight requests. The response must include `Access-Control-Allow-Credentials: true`.

### Alternative: Capacitor HTTP Plugin (CORS bypass)

Capacitor offers `@capacitor/http` which routes HTTP requests through the native layer, bypassing WebView CORS restrictions entirely. However, this approach has trade-offs:

- Pro: No server-side CORS configuration needed for mobile.
- Con: Different network stack behavior; cookie handling differs; harder to debug; need to maintain two code paths.
- Con: Does not work for WebSocket/WebRTC connections.

**Recommendation**: Configure CORS on the server. It is the standard, reliable approach and benefits all clients (web, iOS, Android).

---

## 3. Secure Context

### Findings

This app uses `getUserMedia()` for microphone access and WebRTC for real-time audio communication with OpenAI's Realtime API. Both APIs require a **secure context** (HTTPS or equivalent).

#### iOS (`capacitor://localhost`)

- **Is it a secure context?** **Yes.** WKWebView on iOS treats the `capacitor://` scheme as a secure context. Apple's WKWebView security model grants secure context status to locally-loaded content.
- `getUserMedia()` works in WKWebView as of iOS 14.3+. Prior to iOS 14.3, WKWebView did not support `getUserMedia()` at all.
- WebRTC (RTCPeerConnection) is supported in WKWebView on iOS 14.3+.
- **Microphone permission**: The app must include `NSMicrophoneUsageDescription` in `Info.plist` with a Japanese description explaining why the microphone is needed:
  ```xml
  <key>NSMicrophoneUsageDescription</key>
  <string>音声会話のためにマイクを使用します</string>
  ```

#### Android (`http://localhost`)

- **Is it a secure context?** **Yes.** `localhost` (and `127.0.0.1`) is explicitly listed as a secure context in the W3C Secure Contexts specification, regardless of the scheme (HTTP or HTTPS). Android WebView respects this.
- `getUserMedia()` works in Android WebView (Chromium-based) with appropriate permissions.
- WebRTC is supported in Android WebView.
- **Microphone permission**: The app must request `android.permission.RECORD_AUDIO` at runtime. Capacitor handles this through the permissions API, but the permission must be declared in `AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
  ```

#### WebRTC-Specific Considerations

The app uses WebRTC to connect to OpenAI's Realtime API (SDP exchange via `/api/realtime/connect`). Key considerations:

1. **ICE/STUN/TURN**: WebRTC in WebView uses the same ICE negotiation as in browsers. The SDP exchange happens via the app's server, which proxies to OpenAI. This should work identically in WebView.

2. **Audio routing**: On mobile, the WebRTC audio output goes through the device speaker by default. Consider using `@capacitor-community/audio` or native audio session configuration for optimal routing (speaker vs. earpiece).

3. **Background audio**: When the app goes to the background on iOS, WKWebView suspends JavaScript execution and WebRTC connections may be interrupted. This is a fundamental iOS limitation. On Android, WebView behavior in the background is also restricted but slightly more lenient.

#### SSL/TLS for Remote Server

When the Capacitor app connects to the Railway production server:
- The Railway server must serve over HTTPS (Railway provides this by default).
- Certificate pinning is not required but can be added for additional security using Capacitor plugins.
- No self-signed certificate issues since Railway provides valid Let's Encrypt certificates.

---

## 4. Storage Persistence

### Findings

#### localStorage

- **Does it persist across app restarts?** **Yes**, in most cases. Capacitor's WKWebView (iOS) and Android WebView persist localStorage data across app restarts.
- **Caveats on iOS**: Apple may clear WKWebView localStorage under storage pressure (low disk space). This is rare but possible. Starting with iOS 16, WKWebView data is more reliably persisted, but it is not guaranteed to the same degree as native storage.
- **Caveats on Android**: localStorage persists reliably across app restarts. Data is stored in the app's sandboxed WebView data directory.

#### IndexedDB

- **Does it persist?** **Yes**, IndexedDB persists across app restarts on both iOS and Android WebView.
- **iOS caveat**: Same storage pressure risk as localStorage. Apple treats WKWebView storage as "non-persistent" by default -- the OS may evict it under memory/storage pressure, though this is uncommon for apps that are regularly used.

#### Firebase Auth Persistence

Firebase Auth's default persistence on web is `browserLocalPersistence`, which uses `indexedDB` (preferred) or `localStorage` as a fallback. In Capacitor WebView:

- **Does it work?** **Yes.** Firebase Auth stores the user session in IndexedDB/localStorage, and this persists across app restarts on both platforms. The user remains signed in between app launches.
- **Potential issue**: If iOS clears WKWebView storage under pressure, the user would be signed out. This is the same risk as localStorage/IndexedDB above.
- **Recommendation**: For maximum reliability, consider using `@capacitor/preferences` (native key-value storage) to store a backup authentication state flag. This way, even if WebView storage is cleared, the app can detect the inconsistency and re-authenticate.

#### `@capacitor/preferences` (Native Key-Value Storage)

- Uses `NSUserDefaults` on iOS and `SharedPreferences` on Android.
- Data persists reliably across app restarts, updates, and is not subject to WebView storage eviction.
- **Use case for this app**: Store non-sensitive flags (e.g., "user has completed onboarding", "preferred settings"). Do NOT store authentication tokens here -- use Firebase Auth's built-in persistence.

#### Cookies

- Cookies in WKWebView have historically been problematic. WKWebView has its own cookie store (`WKHTTPCookieStore`) separate from `NSHTTPCookieStorage`.
- In Capacitor WebView, cookies set by HTTP responses are managed by WKWebView's cookie store and may not persist reliably across restarts on older iOS versions.
- **Impact on this app**: The current app does not use cookies for authentication (it uses Bearer tokens). No action needed unless cookies are introduced later.

### Recommendation

The current Firebase Auth persistence mechanism (IndexedDB/localStorage) should work adequately in Capacitor WebView. For critical data that must survive WebView storage clearing, use `@capacitor/preferences`. Authentication tokens should continue to use Firebase Auth's built-in persistence, not manual storage.

---

## 5. Network Configuration

### Findings

#### `fetch()` from Capacitor WebView

- `fetch()` works from Capacitor WebView and behaves like a standard browser `fetch()`.
- Requests to the same origin (if serving locally) work without CORS issues.
- Requests to a remote server (Railway) are subject to CORS policies -- the server must include appropriate `Access-Control-Allow-Origin` headers (see Section 2).
- The `Authorization` header is a non-simple header, so all authenticated requests trigger CORS preflight (OPTIONS request).

#### `@capacitor/http` Plugin

- The `@capacitor/http` plugin (previously `@capacitor-community/http`) routes HTTP requests through the native networking layer (URLSession on iOS, OkHttp on Android) instead of the WebView's networking stack.
- **Advantages**:
  - Bypasses CORS entirely (native HTTP has no same-origin policy).
  - Better performance for large payloads.
  - Access to native cookie jar.
- **Disadvantages**:
  - Adds complexity -- need to decide per-request whether to use native or web fetch.
  - Different error handling semantics.
  - Does not apply to WebSocket or WebRTC connections (those always go through the WebView's networking stack).
  - Since Capacitor 6, the HTTP plugin can be configured to automatically patch `window.fetch` on native platforms, but this can introduce subtle differences.
- **Is it needed for this app?** **No**, if proper CORS is configured on the server. The standard `fetch()` with correct CORS headers is the simpler, more maintainable approach. The `@capacitor/http` plugin is only needed if CORS configuration is not feasible (e.g., third-party API without CORS support).

#### WebSocket Connections

The current app does not use WebSocket connections directly (it uses WebRTC via SDP exchange over HTTP). If WebSocket connections are added in the future:
- WebSocket connections from Capacitor WebView work the same as in browsers.
- CORS does not apply to WebSocket connections (the `Origin` header is sent but there is no preflight). However, the server should validate the `Origin` header for security.

#### Cookie Handling Differences

- Cookies from `fetch()` in Capacitor WebView are stored in WKWebView's cookie store (iOS) or Android WebView's cookie store.
- Third-party cookies may be blocked by default (same as modern browsers).
- **Impact on this app**: Not applicable -- the app uses Bearer token authentication, not cookies.

### Recommendation

Configure proper CORS on the server (Section 2) and continue using standard `fetch()`. The `@capacitor/http` plugin is not needed for this app's requirements.

---

## 6. Capacitor Configuration

### Deployment Modes

There are two main approaches for running this app in Capacitor:

#### Mode A: Local Content + Remote API (Recommended)

The built client (Vite output) is bundled into the native app. API requests go to the remote Railway server.

**Pros:**
- Fast initial load (no network needed for UI).
- Works partially offline (UI loads, but API calls require network).
- Standard Capacitor deployment model.
- App Store compliant.

**Cons:**
- App updates require native app store release.
- Must configure CORS for API calls to remote server.
- Environment variables must be baked into the build.

#### Mode B: Remote URL (Live Server)

The Capacitor app loads the entire app from the Railway server URL, essentially acting as a "wrapper" browser.

**Pros:**
- Instant updates without app store release.
- Same deployment as web -- no separate build.
- No CORS issues (same origin).

**Cons:**
- Requires network for everything (even UI).
- Slower initial load.
- May violate Apple App Store guidelines (apps that are essentially web wrappers can be rejected).
- Less "native" feel.

**Recommendation**: **Mode A (Local Content + Remote API)** is recommended for production. It provides a better user experience, is App Store compliant, and is the standard Capacitor deployment model.

### `capacitor.config.ts` Example

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.ohanashi",
  appName: "おはなし帳",
  webDir: "client/dist",
  // Server configuration
  server: {
    // For local development, point to Vite dev server
    // url: "http://192.168.x.x:5173",
    // In production, comment out `url` to serve from webDir

    // Allow navigation to your API server for OAuth redirects
    allowNavigation: [
      "your-app.railway.app",
      "accounts.google.com",
      "appleid.apple.com",
    ],

    // Android-specific: cleartext traffic (only for development)
    // androidScheme: "https", // Use HTTPS scheme on Android (default is "http")
  },

  // iOS-specific configuration
  ios: {
    // Use the standard content mode
    contentInset: "automatic",
    // Allow inline media playback (important for audio)
    allowsLinkPreview: false,
    // Scroll behavior
    scrollEnabled: true,
  },

  // Android-specific configuration
  android: {
    // Allow mixed content (HTTP resources on HTTPS page) -- only for development
    // allowMixedContent: true,

    // Capture external intents (for OAuth redirect)
    // appendUserAgent: "CapacitorApp",
  },

  // Plugins configuration
  plugins: {
    // Splash screen
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: "CENTER_CROP",
    },

    // Firebase Auth (if using @capacitor-firebase/authentication)
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
    },
  },
};

export default config;
```

### Development Workflow

For local development with Capacitor:

```bash
# Build the client
cd app && npm run build

# Copy web assets to native project
npx cap copy

# Open native IDE
npx cap open ios    # Opens Xcode
npx cap open android  # Opens Android Studio

# Live reload during development (optional)
# Set server.url in capacitor.config.ts to Vite dev server
# Then: npx cap run ios --livereload --external
```

### API Base URL Configuration

When running in Capacitor with local content (Mode A), API requests using relative paths (e.g., `/api/conversations`) will resolve against the local server (`capacitor://localhost` or `http://localhost`), which does not have the API. The `fetchWithAuth()` function must be updated to use an absolute URL pointing to the Railway server.

**Required change in `api.ts`:**

```typescript
// Determine API base URL based on environment
function getApiBaseUrl(): string {
  // In Capacitor native app, always use the remote server
  if (window.location.protocol === "capacitor:" ||
      (window.location.protocol === "http:" &&
       window.location.hostname === "localhost" &&
       window.location.port === "")) {
    return "https://your-app.railway.app";
  }
  // In web (development or production), use relative URLs
  return "";
}

const API_BASE_URL = getApiBaseUrl();

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  // ... existing code ...
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  // ... existing code ...
}
```

A cleaner approach would be to use an environment variable:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
```

Set `VITE_API_BASE_URL=https://your-app.railway.app` in the Capacitor build environment.

---

## Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| `signInWithPopup()` fails entirely in WebView | Users cannot sign in at all | Implement native auth via `@capacitor-firebase/authentication` (Section 1) |
| CORS blocks all API requests | App is non-functional after sign-in | Add Hono CORS middleware with Capacitor origins (Section 2) |
| API base URL resolves to localhost in Capacitor | All API calls fail with network error | Configure `VITE_API_BASE_URL` or dynamic base URL detection (Section 6) |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| iOS WKWebView clears storage under pressure | User signed out unexpectedly | Use `@capacitor/preferences` as backup state indicator |
| WebRTC audio interrupted when app goes to background (iOS) | Conversation cut off mid-session | Document limitation for users; explore iOS background audio entitlement |
| Apple rejects app for not offering Sign in with Apple | App Store rejection | Implement Apple Sign-In alongside Google (Section 1) |
| Microphone permission denied by user | Voice conversation cannot start | Show clear Japanese-language explanation before requesting permission; handle denial gracefully |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cookie-related issues | No impact (app uses Bearer tokens) | No action needed |
| Certificate issues with Railway server | API calls fail | Railway uses Let's Encrypt; no action needed |
| Android cleartext traffic blocked | API calls fail in development | Use `androidScheme: "https"` or configure cleartext for dev only |

---

## Recommendations

### Priority 1: Critical (Must Do Before Capacitor Launch)

1. **Replace `signInWithPopup()` with native auth flow**
   - Install `@capacitor-firebase/authentication`.
   - Modify `auth.ts` to use native sign-in on Capacitor platforms (code example in Section 1).
   - Add Firebase iOS and Android app configurations.
   - Implement Sign in with Apple for iOS App Store compliance.

2. **Add CORS middleware to Hono server**
   - Add `hono/cors` middleware to `index.ts` (code example in Section 2).
   - Update `ALLOWED_ORIGINS` environment variable to include `capacitor://localhost` and `http://localhost`.

3. **Configure API base URL for Capacitor builds**
   - Add `VITE_API_BASE_URL` environment variable.
   - Update `fetchWithAuth()` to prepend the base URL (Section 6).

### Priority 2: Important (Should Do)

4. **Add native permissions declarations**
   - iOS: `NSMicrophoneUsageDescription` in `Info.plist`.
   - Android: `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` in `AndroidManifest.xml`.

5. **Create `capacitor.config.ts`** with appropriate settings (Section 6).

6. **Test WebRTC audio in WebView** -- verify that the SDP exchange and audio stream work correctly in both iOS and Android WebView. Pay special attention to:
   - Audio routing (speaker vs. earpiece).
   - Echo cancellation behavior.
   - Background/foreground transitions.

### Priority 3: Nice to Have

7. **Install `@capacitor/preferences`** for reliable native key-value storage as a supplement to WebView storage.

8. **Implement graceful handling of background interruption** -- when the app goes to background during a voice conversation, detect the interruption and resume or show appropriate UI when foregrounded.

9. **Add certificate pinning** for additional security on API calls to the Railway server (optional, low priority).

### Implementation Order

```
Phase 1: Server-side CORS (no client changes, benefits all clients)
    |
Phase 2: Capacitor project setup (capacitor.config.ts, native projects)
    |
Phase 3: Auth refactoring (auth.ts changes, plugin installation)
    |
Phase 4: API base URL configuration (api.ts changes)
    |
Phase 5: Native permissions and platform-specific testing
    |
Phase 6: WebRTC audio testing and optimization
    |
Phase 7: App Store preparation (Apple Sign-In, privacy labels, etc.)
```

---

## Appendix: Current Code Impact Assessment

| File | Change Required | Scope |
|------|----------------|-------|
| `app/client/src/lib/auth.ts` | Replace `signInWithPopup` with platform-aware auth | Major |
| `app/client/src/lib/firebase.ts` | No changes needed | None |
| `app/client/src/lib/api.ts` | Add API base URL prefix | Minor |
| `app/server/src/index.ts` | Add CORS middleware | Minor |
| `app/server/src/lib/config.ts` | Update `ALLOWED_ORIGINS` defaults | Minor |
| `app/server/src/middleware/auth.ts` | No changes needed | None |
| `app/server/src/routes/realtime.ts` | No changes needed (CORS covers it) | None |
| `capacitor.config.ts` | New file | New |
| `ios/` and `android/` | New native projects via `npx cap add` | New |
