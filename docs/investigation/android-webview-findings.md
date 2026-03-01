# Android WebView Compatibility Investigation Report

## Summary

This report investigates whether the voice conversation web app (React + Vite, using WebRTC to connect directly to OpenAI's Realtime API) can work inside Android WebView, particularly via Capacitor. The core challenge is that the app relies heavily on WebRTC (`RTCPeerConnection`, `RTCDataChannel`), `getUserMedia()`, `MediaRecorder`, `AudioContext`, and Firebase popup auth -- all of which have varying degrees of support in Android WebView environments.

**Key finding**: Standard Android WebView (`android.webkit.WebView`) does NOT support WebRTC by default. Capacitor solves this by using the system Chrome-based WebView, which inherits full Chromium WebRTC support. With Capacitor 6+, the app's core functionality is achievable on Android API 23+ (Android 6.0+), though several integration points require careful configuration and code changes.

**Critical blockers that require code changes**:
1. Firebase `signInWithPopup()` does not work in WebView -- must switch to `signInWithRedirect()` or Capacitor's native Google Sign-In plugin.
2. No `visibilitychange` / background handling -- WebRTC connections will be killed when the app goes to background on Android.
3. No Screen Wake Lock implementation -- the screen will dim/lock during voice conversations.

## API Compatibility Matrix

| API | Standard Android WebView | Capacitor WebView | Min Android | Notes |
|-----|-------------------------|-------------------|-------------|-------|
| `RTCPeerConnection` | Not supported | Supported | API 23 (6.0) | Chrome WebView required |
| `RTCDataChannel` | Not supported | Supported | API 23 (6.0) | Works via Chromium stack |
| `getUserMedia()` | Requires custom `WebChromeClient` | Auto-handled | API 23 (6.0) | Capacitor bridges permission requests |
| `MediaRecorder` | Limited MIME support | Full Chrome support | API 23 (6.0) | `audio/webm;codecs=opus` works |
| `AudioContext` | Supported (with caveats) | Supported | API 23 (6.0) | May need user gesture to resume |
| `AnalyserNode` | Supported | Supported | API 23 (6.0) | Performance varies on low-end devices |
| `HTMLAudioElement.srcObject` | Not reliably supported | Supported | API 23 (6.0) | Chrome WebView inherits full support |
| `MediaRecorder.isTypeSupported()` | Varies | Consistent with Chrome | API 23 (6.0) | `audio/webm;codecs=opus` primary |
| `navigator.wakeLock` | Not supported | Partially (Chrome 84+) | API 29 (10.0) | Needs Capacitor plugin fallback |
| Firebase `signInWithPopup()` | BLOCKED | BLOCKED | N/A | Must use redirect or native plugin |

## Detailed Findings

### 1. Standard Android WebView vs Capacitor WebView

**Status**: Standard WebView is NOT viable. Capacitor is required.

#### Standard Android WebView (`android.webkit.WebView`)

The standard Android WebView is backed by the Android System WebView APK, which is a stripped-down version of Chrome. Critically:

- **WebRTC is disabled by default** in `android.webkit.WebView`. Even though the underlying Chromium engine supports WebRTC, the WebView component does not expose it without significant native customization.
- `getUserMedia()` requires manually overriding `WebChromeClient.onPermissionRequest()` in native Java/Kotlin code.
- There is no built-in mechanism to handle WebRTC permission grants from JavaScript.
- The app would need a full native Android wrapper with custom `WebChromeClient` and `WebViewClient` implementations.

#### Capacitor WebView

Capacitor (v5+, currently v6) uses the system Chrome-based WebView but with crucial enhancements:

- **Engine**: On Android, Capacitor uses `android.webkit.WebView` but configures it with a custom `BridgeWebChromeClient` that properly handles modern web APIs.
- **WebRTC**: Capacitor's bridge layer enables WebRTC by default, including `getUserMedia()` permission delegation.
- **Key advantage**: Capacitor's Android implementation includes `onPermissionRequest()` handling that bridges WebView permission requests to Android runtime permissions, which is the critical piece that standard WebView lacks.
- **Chrome version**: Depends on the user's installed Android System WebView or Chrome Custom Tabs version. On Android 7.0+, WebView is updated via Google Play Store independently of OS updates.

#### WebView Engine Version Considerations

| Android Version | WebView Update Mechanism | Typical Chrome Version |
|----------------|-------------------------|----------------------|
| Android 5.0-6.0 | System update only (pre-Nougat) | Chrome 44-51 (outdated) |
| Android 7.0+ | Google Play Store (auto-updated) | Latest Chrome stable |
| Android 10+ | Bundled with Chrome | Latest Chrome stable |

**Recommendation**: Target Android 7.0+ (API 24) minimum to ensure auto-updating WebView with modern Chrome features.

### 2. WebRTC Support in Capacitor Android

**Status**: Supported (full `RTCPeerConnection`, `RTCDataChannel`, codec negotiation)

#### RTCPeerConnection
- Fully supported through Chrome's WebRTC stack in Capacitor's WebView.
- The app creates `new RTCPeerConnection()` without ICE server configuration (line 272 of `useWebRTC.ts`). This works because the connection is to OpenAI's Realtime API servers, which handle the SDP offer/answer exchange via the app's relay server. No STUN/TURN is needed for this architecture since it is not a peer-to-peer connection between two clients.
- SDP offer creation (`pc.createOffer()`), local description setting, and remote description setting all work identically to Chrome desktop.

#### RTCDataChannel
- Fully supported. The app creates a data channel named `"oai-events"` for JSON message exchange with OpenAI.
- `dc.onopen`, `dc.onmessage`, `dc.onerror` event handlers work normally.
- String-based messaging (`dc.send(JSON.stringify(event))`) is fully supported.

#### Codec Negotiation
- **Opus audio codec**: Fully supported. Android's Chromium WebView has had Opus support since Android 5.0. The WebRTC stack automatically negotiates Opus for audio tracks.
- The app adds a mic audio track via `pc.addTrack(audioTrack, micStream)` and receives remote audio via `pc.ontrack`. Both directions use Opus by default in WebRTC, which matches OpenAI's Realtime API requirements.

#### STUN/TURN
- Not directly relevant to this app's architecture (the SDP exchange goes through the app's server, not peer-to-peer). However, if needed in the future, STUN/TURN are fully supported in Capacitor's WebView.

#### Minimum Android for Full WebRTC
- API 23 (Android 6.0) is the minimum for `getUserMedia()` runtime permission model.
- API 24 (Android 7.0) is recommended for auto-updating WebView ensuring modern WebRTC features.

### 3. getUserMedia Permissions

**Status**: Supported in Capacitor, requires AndroidManifest configuration

#### How Android WebView Handles getUserMedia()

In standard Android WebView, calling `navigator.mediaDevices.getUserMedia()` triggers `WebChromeClient.onPermissionRequest()`. If this method is not overridden, the permission request is silently denied, and the Promise rejects.

#### Capacitor's Automatic Handling

Capacitor's `BridgeWebChromeClient` overrides `onPermissionRequest()` and bridges it to Android's runtime permission system:

1. JavaScript calls `getUserMedia({ audio: constraints })`.
2. Capacitor's `BridgeWebChromeClient.onPermissionRequest()` is triggered.
3. Capacitor checks if `RECORD_AUDIO` permission is granted.
4. If not, Capacitor triggers Android's runtime permission dialog.
5. Once granted, Capacitor calls `request.grant(request.getResources())`.
6. The JavaScript Promise resolves with the `MediaStream`.

This happens automatically -- no additional Capacitor plugin is needed for basic `getUserMedia()`.

#### Required AndroidManifest.xml Permissions

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

#### Audio Constraints Compatibility

The app uses these constraints (from `useWebRTC.ts`):

```typescript
const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
```

All three constraints are supported in Android's Chrome WebView:
- `echoCancellation`: Supported. Android uses its platform AEC (Acoustic Echo Cancellation) module, typically Google's WebRTC AEC implementation.
- `noiseSuppression`: Supported. Uses Android's platform noise suppressor.
- `autoGainControl`: Supported. Uses Android's AGC module. Unlike iOS (where the app disables AGC to prevent AEC degradation), Android's AEC implementation is generally more robust with AGC enabled.

#### Permission UX for Elderly Users

- Android shows a system permission dialog ("Allow [app] to record audio?").
- After the first grant, the permission persists until the user revokes it in Settings.
- On Android 11+, if the user denies twice, the permission is permanently denied and must be re-enabled from Settings. This is a UX concern for elderly users -- consider adding a pre-permission explanation screen.

### 4. MediaRecorder in Android WebView

**Status**: Supported with good MIME type compatibility

#### MIME Type Support in Chrome-based Android WebView

The app's MIME fallback chain (`useConversation.ts` lines 78-83):

```typescript
const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",  // Primary
  "audio/webm",              // Fallback 1
  "audio/mp4",               // Fallback 2
  "audio/ogg;codecs=opus",   // Fallback 3
];
```

| MIME Type | Android Chrome WebView | Notes |
|-----------|----------------------|-------|
| `audio/webm;codecs=opus` | Supported (Android 5.0+) | Will be selected as primary |
| `audio/webm` | Supported (Android 5.0+) | Uses VP8/Opus by default |
| `audio/mp4` | Supported (Android 8.0+ in some builds) | Inconsistent across devices |
| `audio/ogg;codecs=opus` | Not commonly supported | Chrome does not typically support OGG recording |

**Result**: The app's fallback chain will work correctly. `audio/webm;codecs=opus` will be selected as the primary format on virtually all Android devices with an updated Chrome WebView.

#### MediaRecorder API Compatibility

- `MediaRecorder` constructor: Supported.
- `MediaRecorder.isTypeSupported()`: Supported and works correctly for MIME type detection.
- `ondataavailable` event: Supported. The app uses `recorder.start(1000)` for 1-second chunks, which works correctly.
- `recorder.stop()` / `recorder.state`: Supported.
- `BlobEvent.data`: Supported.

#### Recording Quality

- Audio quality is consistent with Chrome desktop when using `audio/webm;codecs=opus`.
- Opus codec at default WebRTC bitrate (typically 32kbps for voice) produces good quality for voice recording.
- No significant differences from Chrome desktop.

### 5. AudioContext in Android WebView

**Status**: Supported, but requires user gesture for initial creation

#### AnalyserNode Support

The app uses `AudioContext` + `AnalyserNode` for mic level visualization (`useWebRTC.ts` lines 133-161):

```typescript
const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
analyser.fftSize = 256;  // ANALYSER_FFT_SIZE
const source = ctx.createMediaStreamSource(stream);
source.connect(analyser);
```

All of these APIs are fully supported in Chrome-based Android WebView:
- `AudioContext` constructor: Supported.
- `createAnalyser()`: Supported.
- `createMediaStreamSource()`: Supported.
- `getByteTimeDomainData()`: Supported.
- `fftSize = 256`: Supported.

#### Suspended State / User Gesture Requirement

Chrome on Android (and thus Chrome WebView) enforces an autoplay policy:
- `AudioContext` starts in a `"suspended"` state if created without a preceding user gesture.
- The app creates the `AudioContext` inside `startAudioLevelMonitor()`, which is called from `connect()`, which is triggered by a user button press. **This satisfies the user gesture requirement.**
- However, if there is any async delay between the user gesture and `new AudioContext()`, the gesture may not propagate. The current code flow should be fine since `connect()` is called directly from the button handler.

#### Performance on Older Android Devices

- The app polls `getByteTimeDomainData()` every 16ms (`AUDIO_LEVEL_INTERVAL_MS`). This is a lightweight operation.
- On very old or low-end devices (under 2GB RAM, old SoCs), this could contribute to minor frame drops.
- The FFT size of 256 is small and performant.
- **Recommendation**: No changes needed. The `try/catch` wrapper around the entire audio level monitor (line 159) gracefully handles failures.

### 6. Audio Playback (HTMLAudioElement with srcObject)

**Status**: Supported in Capacitor WebView

#### HTMLAudioElement.srcObject

The app plays AI audio via (`useWebRTC.ts` lines 290-301):

```typescript
const audio = new Audio();
audio.srcObject = remoteStream;
audio.autoplay = true;
audio.play().catch(() => {});
```

- `HTMLAudioElement.srcObject` with a `MediaStream`: Supported in Chrome-based Android WebView. This is part of the Media Capture and Streams spec and has been supported since Chrome 52 (Android 7.0+ with auto-updating WebView).
- `autoplay = true`: In Android WebView within a Capacitor app, autoplay policies are generally more relaxed than in standalone Chrome, because the WebView is embedded in a native app context. However, `audio.play()` is called explicitly as a safety measure, which is correct.

#### Autoplay Policy in Android WebView

- Android WebView within Capacitor is less restrictive about autoplay than standalone Chrome browser.
- Capacitor apps are considered "first-party" contexts by the WebView, so autoplay restrictions are typically not enforced.
- The explicit `audio.play().catch(() => {})` call ensures playback even if autoplay is blocked.
- **Important**: The `play()` call happens inside `pc.ontrack`, which is an async callback -- not directly in a user gesture handler. In Capacitor's WebView, this typically works because the app has a "user engagement" score from the initial button press that started the connection.

#### Audio Output Routing

- By default, Android routes audio to the earpiece for voice calls and to the speaker for media playback.
- WebRTC audio in WebView is treated as media playback and routes to the speaker by default.
- Users can switch to earpiece/headphones/Bluetooth as normal.
- No additional Android configuration is needed for basic audio routing.

### 7. Background Behavior

**Status**: CRITICAL ISSUE -- WebRTC connections will be disrupted

#### What Happens When the App Goes to Background

On Android, when a Capacitor app goes to the background:

1. **WebView is paused**: Android's `WebView.onPause()` is called, which suspends JavaScript execution, timers, and network activity within approximately 5 seconds.
2. **WebRTC connections are affected**: The `RTCPeerConnection` remains technically "open" but:
   - Audio tracks stop transmitting (mic is effectively muted).
   - Incoming audio stops being processed.
   - Data channel messages may be queued but not delivered.
   - After Android's Doze mode kicks in (variable timing), the connection may be terminated entirely.
3. **AudioContext is suspended**: The `AudioContext` transitions to `"suspended"` state.
4. **MediaRecorder may stop**: The recording may produce gaps or stop entirely.

#### Foreground Service Requirement

To maintain WebRTC connections in the background, Android requires a foreground service with a persistent notification:

```kotlin
// Required in native Android code
val notification = NotificationCompat.Builder(this, CHANNEL_ID)
    .setContentTitle("Voice Conversation Active")
    .setSmallIcon(R.drawable.ic_mic)
    .build()
startForeground(NOTIFICATION_ID, notification)
```

Without a foreground service, Android 8.0+ will aggressively suspend background WebView processes.

#### Capacitor Background Mode

- Capacitor does not natively support background audio/WebRTC.
- The community plugin `@capawesome/capacitor-background-task` provides basic background execution but is not designed for continuous audio streaming.
- For persistent background WebRTC, you would need a custom Capacitor plugin that starts an Android foreground service.

#### Current App Code Gap

The app has **no `visibilitychange` event handling**. There is no code to:
- Pause/resume the WebRTC connection on background/foreground transitions.
- Save conversation state before backgrounding.
- Reconnect after returning to foreground.

#### Recommendations

1. **Primary approach**: Add a `visibilitychange` listener that gracefully pauses the conversation when backgrounded and resumes when foregrounded.
2. **Alternative**: Use Capacitor's `@capacitor/app` plugin to listen for `appStateChange` events, which is more reliable than `visibilitychange` in a native wrapper.
3. **For elderly users**: Show a toast/notification when returning from background if the connection was lost: "The conversation was paused. Would you like to continue?"
4. **Foreground service** (advanced): If background conversation is a requirement, implement a custom Capacitor plugin with an Android foreground service. This is complex and may not be necessary for the target use case.

### 8. Back Button / Gesture Navigation

**Status**: Requires handling to prevent accidental exits

#### Android Hardware Back Button

On Android, the hardware/software back button has special behavior in WebView:

- By default, pressing Back in a Capacitor app calls `WebView.goBack()` if there is history, or exits the app if there is no history.
- For an SPA (Single Page Application) like this React app, `WebView.goBack()` navigates to the previous page load, not the previous SPA route. This means pressing Back during a conversation could navigate away from the app entirely.

#### Capacitor's Default Back Button Handling

Capacitor 6 provides basic back button handling:
- If the WebView has navigation history, it goes back.
- If not, it minimizes the app (does not close it).

However, this default behavior is problematic for this app because:
1. During a voice conversation, pressing Back should not navigate away.
2. The SPA uses client-side routing -- WebView history does not match app state.

#### Gesture Navigation (Android 10+)

- Android 10+ supports gesture navigation (swipe from left/right edge = Back).
- This triggers the same `onBackPressed()` as the back button.
- Users may accidentally trigger it during the voice conversation screen.

#### Required Implementation

Use Capacitor's `@capacitor/app` plugin:

```typescript
import { App as CapacitorApp } from "@capacitor/app";

CapacitorApp.addListener("backButton", ({ canGoBack }) => {
  // Custom handling based on app state
  if (isInConversation) {
    // Show confirmation dialog instead of navigating
    showEndConversationDialog();
  } else if (canGoBack) {
    window.history.back();
  } else {
    CapacitorApp.minimizeApp();
  }
});
```

#### Recommendations

1. **Install `@capacitor/app` plugin** and handle `backButton` events.
2. **During active conversation**: Show a confirmation dialog ("End the conversation?") instead of navigating away.
3. **On other screens**: Use `window.history.back()` for SPA navigation.
4. **Predictive back gesture (Android 14+)**: Capacitor 6 supports the predictive back gesture API. Consider enabling it for a modern feel.

### 9. Minimum Android Version

**Status**: API 24 (Android 7.0) recommended, API 23 (6.0) absolute minimum

#### API Level Requirements by Feature

| Feature | Minimum API | Notes |
|---------|------------|-------|
| `getUserMedia()` | API 21 (5.0) | Basic support |
| Runtime permissions | API 23 (6.0) | Required for mic permission |
| `RTCPeerConnection` | API 21 (5.0) | Via Chrome WebView |
| `MediaRecorder` | API 21 (5.0) | Basic; `webm/opus` requires updated WebView |
| Auto-updating WebView | API 24 (7.0) | Critical for consistent behavior |
| Opus codec in MediaRecorder | API 21 (5.0) | Via Chrome WebView |
| `AudioContext` | API 21 (5.0) | Via Chrome WebView |
| Screen Wake Lock API | API 29 (10.0) | Limited; use Capacitor plugin |

#### Capacitor 6 Requirements

- **Minimum**: API 22 (Android 5.1)
- **Target**: API 34 (Android 14) -- required for Google Play Store submission as of 2025
- **Recommended minimum for this app**: API 24 (Android 7.0) due to auto-updating WebView requirement

#### Android Version Market Share (Japan, 2025-2026 estimates)

| Android Version | API Level | Estimated Share (Japan) | Notes |
|----------------|-----------|------------------------|-------|
| Android 14+ | API 34+ | ~35% | Latest |
| Android 13 | API 33 | ~20% | |
| Android 12 | API 31-32 | ~15% | |
| Android 11 | API 30 | ~10% | |
| Android 10 | API 29 | ~8% | |
| Android 9 | API 28 | ~5% | |
| Android 8.x | API 26-27 | ~4% | |
| Android 7.x | API 24-25 | ~2% | Minimum recommended |
| Below 7.0 | < API 24 | ~1% | Not recommended |

**For elderly users in Japan (60-80 years old)**: Many use mid-range phones from carriers (Docomo, au, SoftBank) that are typically 2-4 years old, running Android 11-13. Setting the minimum to API 24 (Android 7.0) provides excellent coverage (99%+).

### 10. Echo Cancellation on Android

**Status**: Generally better than iOS, but still needs attention

#### Android WebView AEC (Acoustic Echo Cancellation)

Android's audio stack handles AEC differently from iOS:

1. **Platform-level AEC**: Android provides `android.media.audiofx.AcousticEchoCanceler` at the platform level. When WebRTC's `echoCancellation: true` constraint is set, Chrome WebView uses this platform AEC.

2. **WebRTC's built-in AEC**: Chrome also includes its own AEC implementation (from the WebRTC project). On Android, Chrome typically uses the platform AEC if available and falls back to software AEC otherwise.

3. **Device variability**: AEC quality varies significantly across Android devices:
   - **Samsung Galaxy series**: Generally good AEC (Samsung provides hardware DSP).
   - **Google Pixel**: Excellent AEC (Google's own audio processing).
   - **Budget devices (AQUOS, arrows, etc.)**: Variable AEC quality. Some older models have poor AEC.
   - **Huawei/Xiaomi**: Generally acceptable AEC.

#### autoGainControl on Android

The app currently uses `autoGainControl: true` for non-iOS devices (`DEFAULT_AUDIO_CONSTRAINTS`).

On Android:
- AGC is generally safe and does not interfere with AEC like it does on iOS.
- Android's AGC implementation operates independently of AEC in most device audio stacks.
- The current setting (`autoGainControl: true`) is correct for Android.

#### Does Android Need an Echo Guard Like iOS?

The app currently implements an iOS-specific echo guard:
- Mutes the mic while AI is speaking (via `setMicEnabled(false)`).
- Re-enables the mic after a 300ms delay (`IOS_MIC_REENABLE_DELAY_MS`).

**For Android**:
- The platform AEC is generally more effective than iOS Safari's AEC in WebView contexts.
- An echo guard is **not strictly necessary** on most Android devices but would be **beneficial as a safety measure** on budget devices with poor AEC.
- **Recommendation**: Apply a lighter version of the echo guard on Android -- perhaps mute during AI speech but with a shorter (or zero) re-enable delay, since Android AEC recovers faster.

#### Current Code Analysis

The app's `isIOSDevice()` function in `platform.ts` only detects iOS. For Android-specific behavior, a corresponding `isAndroidDevice()` helper would be needed:

```typescript
export function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}
```

### 11. Screen Wake Lock

**Status**: Needs implementation -- screen will dim/lock during conversations

#### Problem

During a voice conversation that may last 5-20 minutes, the Android device screen will dim and eventually lock based on the user's screen timeout setting (typically 30 seconds to 2 minutes). For elderly users, this would be confusing and disruptive.

#### Wake Lock API in Android WebView

The W3C Screen Wake Lock API (`navigator.wakeLock.request("screen")`) support:

| Environment | Support | Notes |
|------------|---------|-------|
| Chrome Android (browser) | Supported (Chrome 84+, API 29+) | Full support |
| Android WebView (standalone) | Not supported | Feature disabled in WebView |
| Capacitor WebView | Not reliably supported | Depends on WebView version and flags |

**Key issue**: The Wake Lock API is generally **not available** in Android WebView, even when the underlying Chrome version supports it. This is because WebView disables certain "powerful features" that require user trust signals.

#### Capacitor Plugin Solutions

1. **`@capacitor-community/keep-awake`** (recommended):
   ```typescript
   import { KeepAwake } from "@capacitor-community/keep-awake";

   // When conversation starts
   await KeepAwake.keepAwake();

   // When conversation ends
   await KeepAwake.allowSleep();
   ```
   This plugin uses Android's native `FLAG_KEEP_SCREEN_ON` window flag, which is reliable and does not require any special permissions.

2. **Manual implementation**: In the Capacitor Android project, add a plugin that sets:
   ```kotlin
   activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
   ```

#### Recommendations

1. Install `@capacitor-community/keep-awake` plugin.
2. Activate keep-awake when a conversation session starts.
3. Deactivate when the conversation ends (including error states).
4. Add a fallback using the Web Wake Lock API for non-Capacitor environments (PWA/browser).

### 12. Known Capacitor Android Issues

**Status**: Several known issues relevant to this app

#### WebRTC-Related Issues

1. **Microphone permission on first launch**: Some Capacitor versions (pre-5.5) had a bug where the first `getUserMedia()` call would fail even after the user granted permission. The workaround is to call `getUserMedia()` again after a short delay. Capacitor 6 has fixed this in most cases.

2. **Audio focus conflicts**: Android's audio focus system can cause issues when the WebView's audio competes with other apps (notifications, incoming calls). When another app takes audio focus, the WebRTC audio track may be interrupted. Capacitor does not handle audio focus management automatically.

3. **Bluetooth audio routing**: When Bluetooth headphones are connected, Android may route `getUserMedia()` audio to the phone's built-in mic instead of the Bluetooth mic. This is a known Chromium issue in WebView contexts. A native plugin may be needed for reliable Bluetooth audio routing.

#### Permission-Related Issues

1. **Android 11+ (API 30) one-time permissions**: Android 11 introduced "one-time" permission grants. If the user selects "Only this time" for microphone permission, the permission is revoked when the app goes to background. On return, `getUserMedia()` will fail. The app should handle this gracefully.

2. **Android 12+ (API 31) approximate permissions**: Android 12 introduced privacy indicators (green dot for mic/camera). This is informational only and does not affect functionality, but elderly users may be confused by the indicator.

3. **Permanent denial**: After two denials on Android 11+, the system stops showing the permission dialog. The app must detect this state and guide users to Settings. Capacitor's `@capacitor/permissions` or `@capacitor/microphone` plugin can check permission status.

#### Audio-Related Issues

1. **Audio output to earpiece**: Some Android devices route WebRTC audio to the earpiece by default (as if it were a phone call). This can be confusing for users. A native plugin to force speaker output may be needed.

2. **Audio interruption on notifications**: Notification sounds can cause brief audio interruptions in the WebRTC stream. Android does not automatically duck (reduce volume of) WebRTC audio for notifications.

3. **Sample rate mismatch**: Some older Android devices have a native sample rate of 44100Hz, while WebRTC typically uses 48000Hz. Chrome handles resampling automatically, but this can introduce minimal latency on very old devices.

#### Firebase Auth in WebView

1. **`signInWithPopup()` is BROKEN**: This is the most critical issue. Firebase's `signInWithPopup()` opens a new browser window/tab for OAuth. In Android WebView (including Capacitor), popup windows are blocked or open in an external browser, causing the auth flow to break. The popup cannot communicate back to the WebView.

2. **Solution options**:
   - **`signInWithRedirect()`**: Works in WebView but has its own quirks (requires `getRedirectResult()` on return, URL may not match).
   - **Capacitor Firebase Auth plugin** (`@capacitor-firebase/authentication`): Uses native Google Sign-In on Android, providing the best UX. The native flow opens a system account picker (familiar to Android users) and returns credentials to the WebView.
   - **Custom Chrome Tab flow**: Use `@capacitor/browser` to open the OAuth flow in a Chrome Custom Tab, then deep-link back to the app.

   **Recommended**: Use `@capacitor-firebase/authentication` for native Google Sign-In, with `signInWithRedirect()` as a web fallback.

#### General Capacitor Android Issues

1. **WebView caching**: Capacitor WebView aggressively caches assets. During development, you may need to clear the app cache or use `server.cleartext: true` in `capacitor.config.ts` for local development.

2. **Mixed content**: If the Hono server serves over HTTP in development, Android WebView blocks mixed content by default. Capacitor's `allowMixedContent` configuration option may be needed for development.

3. **Keyboard behavior**: The Android soft keyboard pushes the WebView content up (adjustResize mode). During a voice conversation, if a text input is focused, the keyboard may obscure the conversation UI. Capacitor allows configuring this via `android.adjustResize` in `capacitor.config.ts`.

## Capacitor Android Configuration

### capacitor.config.ts

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.ohanashi",
  appName: "おはなし",
  webDir: "../client/dist",
  android: {
    // Required for WebRTC getUserMedia
    allowMixedContent: false,
    // Prevent keyboard from pushing conversation UI
    adjustResize: false,
  },
  server: {
    // For development only -- remove in production
    // url: "http://10.0.2.2:5173",
    // cleartext: true,
  },
  plugins: {
    // Firebase Auth configuration (if using @capacitor-firebase/authentication)
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com"],
    },
  },
};

export default config;
```

### AndroidManifest.xml Additions

```xml
<!-- Required permissions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Optional: for wake lock plugin -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Optional: for foreground service (background audio) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
```

### build.gradle Additions

```groovy
// In app/build.gradle
android {
    defaultConfig {
        minSdkVersion 24  // Android 7.0 for auto-updating WebView
        targetSdkVersion 34  // Required for Play Store
    }
}

dependencies {
    // Firebase BoM (if using @capacitor-firebase/authentication)
    implementation platform('com.google.firebase:firebase-bom:33.0.0')
    implementation 'com.google.firebase:firebase-auth'
}
```

### Required Capacitor Plugins

| Plugin | Purpose | Priority |
|--------|---------|----------|
| `@capacitor/app` | Back button handling, app state changes | Required |
| `@capacitor-firebase/authentication` | Native Google Sign-In | Required (replaces popup auth) |
| `@capacitor-community/keep-awake` | Screen wake lock during conversation | Required |
| `@capacitor/splash-screen` | App launch experience | Recommended |
| `@capacitor/status-bar` | Status bar styling | Recommended |
| `@capacitor/haptics` | Tactile feedback for button presses | Optional (good for elderly UX) |

## Risk Assessment

### High Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Firebase `signInWithPopup()` fails in WebView | Auth completely broken | Certain | Switch to native Firebase Auth plugin or `signInWithRedirect()` |
| Screen locks during conversation | Conversation interrupted, confusing UX for elderly users | Certain | Implement keep-awake plugin |
| App backgrounded during conversation | WebRTC connection dropped, data loss | High | Add `visibilitychange`/`appStateChange` handling |
| Back button navigates away during conversation | Conversation abruptly ended | High | Handle back button via `@capacitor/app` |

### Medium Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Poor AEC on budget Android devices | Echo loop, conversation breaks down | Medium | Implement echo guard (mute mic during AI speech) |
| Mic permission permanently denied (2 denials) | App unusable | Medium | Guide users to Settings, add pre-permission explanation |
| Audio routed to earpiece instead of speaker | User cannot hear AI | Medium | Document for users; consider native audio routing plugin |
| Notification interrupts WebRTC audio | Brief audio gap during conversation | Medium | Request audio focus via native plugin |
| Android 11+ "one-time" permission | Mic fails after background | Medium | Check permission status on foreground return |

### Low Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `MediaRecorder` MIME type mismatch | Recording fails | Low | Fallback chain already handles this |
| `AudioContext` suspended state | Mic level visualization stops | Low | Already wrapped in try/catch |
| WebView cache serves stale assets | App shows old version | Low | Implement cache-busting in Vite build |
| Bluetooth mic routing issues | Wrong mic used | Low | Rare for target demographic |

## Recommendations

### Phase 1: Critical Changes (Must Do Before Launch)

1. **Replace `signInWithPopup()` with Capacitor-compatible auth**
   - Install `@capacitor-firebase/authentication`.
   - Create a platform-aware auth module that uses native Sign-In on Android/iOS and `signInWithPopup()` on web.
   - File to modify: `app/client/src/lib/auth.ts`.

2. **Implement Screen Wake Lock**
   - Install `@capacitor-community/keep-awake`.
   - Activate when conversation starts, deactivate when it ends.
   - File to modify: `app/client/src/hooks/useConversation.ts` (start/end session).

3. **Handle Back Button**
   - Install `@capacitor/app`.
   - Add back button listener that shows a confirmation dialog during active conversations.
   - File to create: Platform-aware back button handler, integrated into the main App component.

4. **Handle App Background/Foreground**
   - Listen for `visibilitychange` or Capacitor's `appStateChange`.
   - When backgrounded during a conversation: mute mic, pause recording, show a reconnection prompt on return.
   - File to modify: `app/client/src/hooks/useConversation.ts` or a new lifecycle hook.

### Phase 2: Important Improvements

5. **Add Android Echo Guard (lighter than iOS)**
   - Create `isAndroidDevice()` helper in `platform.ts`.
   - Consider applying the existing iOS echo guard pattern to Android, possibly with a shorter re-enable delay.
   - The existing `IOS_MIC_REENABLE_DELAY_MS = 300` could be reduced to 100-150ms for Android.

6. **Pre-Permission Explanation Screen**
   - Before requesting mic permission, show a friendly Japanese explanation: "This app uses your microphone for voice conversation. Please allow microphone access when asked."
   - Detect permanent denial and guide to Settings with clear Japanese instructions.

7. **Audio Focus Management**
   - Create a Capacitor plugin or use an existing one to request audio focus when a conversation starts.
   - Handle audio focus loss (incoming call, notification) gracefully.

### Phase 3: Nice to Have

8. **Haptic Feedback**
   - Use `@capacitor/haptics` for button presses, which provides tactile feedback useful for elderly users.

9. **Foreground Service for Background Audio**
   - Only if background conversation is a requirement.
   - Requires a custom Capacitor plugin with native Android foreground service.

10. **Bluetooth Audio Routing**
    - Only needed if target users commonly use Bluetooth headphones.
    - Requires a native plugin for reliable Bluetooth SCO audio routing.

### Development Setup

```bash
# Initialize Capacitor in the project
cd app
npm install @capacitor/core @capacitor/cli
npx cap init

# Add Android platform
npm install @capacitor/android
npx cap add android

# Install required plugins
npm install @capacitor/app
npm install @capacitor-firebase/authentication
npm install @capacitor-community/keep-awake

# Build and sync
npm run build -w client
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Testing Strategy

1. **Device matrix**: Test on at least:
   - A Google Pixel device (reference Android, good AEC)
   - A Samsung Galaxy mid-range (most popular in Japan)
   - A budget device (AQUOS sense, arrows series -- common among elderly users in Japan)
   - An older Android 7-8 device (minimum supported)

2. **Key test scenarios**:
   - Full conversation flow (start, speak, listen, end)
   - Background/foreground during conversation
   - Incoming phone call during conversation
   - Back button/gesture during conversation
   - Permission denial and re-grant
   - Low battery / battery saver mode (may throttle WebView)
   - Speaker vs. earpiece audio output
   - Screen rotation (if not locked)

3. **Echo testing**:
   - Test with device speaker at various volumes
   - Test in quiet and noisy environments
   - Compare echo behavior between devices
