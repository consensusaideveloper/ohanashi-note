# iOS WKWebView Compatibility Investigation Report

**Date**: 2026-03-02
**Scope**: Evaluate whether this voice conversation web app can run inside iOS WKWebView (particularly via Capacitor)
**App Architecture**: React+Vite client using WebRTC to connect directly to OpenAI Realtime API; Hono+Node.js server handling SDP exchange and auth

---

## Summary

The app's core WebRTC-based voice conversation flow **can work in WKWebView on iOS 14.5+**, but requires significant configuration and several code adjustments. The primary risks are:

1. **Firebase `signInWithPopup()` will not work** in WKWebView -- this is a blocking issue requiring a switch to `signInWithRedirect()` or a Capacitor-native auth plugin.
2. **Microphone permission** requires native Info.plist configuration and proper Capacitor plugin setup; WKWebView cannot prompt for mic access on its own without the host app's entitlements.
3. **MediaRecorder** has limited MIME type support on iOS (no webm until iOS 17.1+); the existing fallback chain mostly handles this, but `audio/mp4` will be the primary format on older iOS versions.
4. **Background audio** will cause WebRTC disconnection unless the native app configures `UIBackgroundModes` and AVAudioSession correctly.
5. **Safe area** handling is entirely absent from the current codebase and must be added for notch/Dynamic Island devices.
6. **AudioContext suspended state** requires user-gesture-initiated resumption, which the current code partially handles but may need reinforcement in WKWebView.

Overall feasibility: **Possible with moderate effort**, targeting iOS 16+ as the minimum deployment version for best WebRTC compatibility.

---

## API Compatibility Matrix

| API | WKWebView Support | Min iOS | Status | Notes |
|-----|------------------|---------|--------|-------|
| `RTCPeerConnection` | Yes | 14.5 (basic), 16.0 (full) | Supported | Added in iOS 14.5; full feature parity with Safari from iOS 16 |
| `RTCDataChannel` | Yes | 14.5 | Supported | Works identically to Safari |
| `getUserMedia()` | Yes | 14.5 | Requires config | Host app must declare `NSMicrophoneUsageDescription` in Info.plist |
| `AudioContext` | Yes | 14.5 | Caution | Starts in suspended state; requires user gesture to resume |
| `AnalyserNode` | Yes | 14.5 | Supported | Works normally once AudioContext is running |
| `MediaRecorder` | Yes | 14.0 | Partial | No webm support until iOS 17.1; audio/mp4 works from iOS 14 |
| `HTMLAudioElement.srcObject` | Yes | 14.5 | Supported | Works with MediaStream from WebRTC |
| `Audio.autoplay` | Restricted | 14.5 | Caution | Requires user gesture or explicit `.play()` call |
| `signInWithPopup()` | No | N/A | Blocked | Popups are blocked in WKWebView; must use redirect or native auth |
| `env(safe-area-inset-*)` | Yes | 11.0 | Supported | Requires `viewport-fit=cover` in meta tag |

---

## Detailed Findings

### 1. WebRTC (RTCPeerConnection)

**Status**: Supported (iOS 16+ recommended)

WebRTC was first enabled in WKWebView starting with **iOS 14.5** (released April 2021). Prior to iOS 14.5, WebRTC was only available in Safari -- not in any WKWebView-based browser or app.

**Key details**:
- iOS 14.5: Basic WebRTC support added to WKWebView (`getUserMedia`, `RTCPeerConnection`).
- iOS 15: Improved stability; VP8/VP9 codec support expanded.
- iOS 16 (Safari 16): Full feature parity between WKWebView and Safari for WebRTC. This is the version where Apple considers WRTCWebView WebRTC "production-ready." Includes improved data channel reliability.
- iOS 17+: Further performance improvements, Simulcast support.

**Limitations vs Safari**:
- Before iOS 16, some edge cases around ICE candidate gathering and TURN relay could behave differently in WKWebView vs Safari.
- WKWebView shares the same WebKit engine as Safari, so codec support (Opus for audio, H.264/VP8 for video) is identical.
- No STUN/TURN limitations specific to WKWebView -- these are handled at the network level.

**Impact on this app**: The app creates `new RTCPeerConnection()` without any ICE server configuration (line 272 of `useWebRTC.ts`). This relies on direct connectivity, which works fine for connecting to OpenAI's Realtime API servers. If TURN relay is ever needed, it would work the same as in Safari.

**Recommendation**: Target **iOS 16+** as minimum deployment version for reliable WebRTC in WKWebView. This is reasonable given the elderly user demographic (most modern iPhones support iOS 16+).

---

### 2. getUserMedia (Microphone Access)

**Status**: Supported with native configuration required

**Permission flow in WKWebView**:
- In standalone Safari, the browser handles microphone permission prompts directly.
- In WKWebView (Capacitor app), the **host iOS app** must declare microphone usage in `Info.plist`.
- iOS will show the native permission dialog (not a web prompt) asking the user to allow microphone access for the app.
- Once granted, all subsequent `getUserMedia()` calls succeed without re-prompting.

**Required Info.plist entries**:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>音声会話のためにマイクを使用します</string>
```

**Capacitor handling**:
- Capacitor's WKWebView configuration automatically bridges `getUserMedia()` to the native permission system.
- The `@capacitor/browser` plugin is NOT needed -- Capacitor's main WebView natively supports `getUserMedia()`.
- As of Capacitor 5+, no additional plugin is required for basic microphone access via `getUserMedia()`.

**iOS-specific constraints**: The app already applies iOS-specific audio constraints in `useWebRTC.ts` (lines 25-29):
```typescript
const IOS_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
};
```
These constraints are honored by WKWebView identically to Safari.

**Platform detection concern**: The current `isIOSDevice()` function in `platform.ts` uses `navigator.userAgent` checks. In a Capacitor WKWebView, the user agent string will contain "iPhone" or "iPad", so detection will work correctly. However, Capacitor also allows customizing the user agent, which could break detection if modified. A more robust approach would be to also check for `window.Capacitor` as an additional signal.

---

### 3. AudioContext and AnalyserNode

**Status**: Supported with user-gesture caveat

**Suspended state issue**: On iOS (both Safari and WKWebView), a new `AudioContext` is created in the **suspended** state. It must be resumed via a user gesture (tap, click). The app creates its `AudioContext` inside `startAudioLevelMonitor()` (line 135), which is called from `connect()`. The `connect()` method is called after `requestMicAccess()`, which the code comments indicate "Must be called from a user gesture handler" (line 182). If the `connect()` call chain originates from a user tap, the AudioContext creation should succeed.

**However**: There is no explicit `audioContext.resume()` call in the code. The `AudioContext` is created with `new AudioContext()` and immediately used. On some iOS versions, particularly in WKWebView, the context may remain suspended even if created during a user gesture callback, especially if there are intervening async operations (like the SDP exchange in `connect()`).

**AnalyserNode**: Works identically to Safari once the AudioContext is running. The FFT size of 256 and `getByteTimeDomainData()` usage (lines 138-157) are fully supported.

**Recommendation**: Add an explicit `await ctx.resume()` after creating the AudioContext in `startAudioLevelMonitor()`, and add a state check:
```typescript
const ctx = new AudioContext();
if (ctx.state === "suspended") {
  await ctx.resume();
}
```

---

### 4. MediaRecorder

**Status**: Partial support -- MIME type limitations

**MIME type support timeline in iOS WKWebView**:
| MIME Type | iOS Support |
|-----------|-------------|
| `audio/mp4` | iOS 14.0+ |
| `audio/mp4;codecs=aac` | iOS 14.0+ |
| `audio/webm` | iOS 17.1+ (Safari 17.1) |
| `audio/webm;codecs=opus` | iOS 17.1+ |
| `audio/ogg;codecs=opus` | Not supported on iOS |

**App's current fallback chain** (`useConversation.ts`, lines 78-83):
```typescript
const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",   // Not supported on iOS < 17.1
  "audio/webm",                // Not supported on iOS < 17.1
  "audio/mp4",                 // Supported on iOS 14+
  "audio/ogg;codecs=opus",     // Not supported on iOS
] as const;
```

**Analysis**: The fallback chain will correctly land on `audio/mp4` for iOS 14-17.0, and `audio/webm;codecs=opus` for iOS 17.1+. This is well-designed and will work in WKWebView.

**Potential issue**: The `DEFAULT_RECORDING_MIME_TYPE` is `"audio/webm"` (line 77). If all candidates fail and the fallback empty-string path is taken (creating `new MediaRecorder(recordingStream)` without specifying MIME type), iOS will default to `audio/mp4`. The `DEFAULT_RECORDING_MIME_TYPE` constant is only used as a label for the blob type; it does not affect actual recording. However, the mismatch between the label (`audio/webm`) and the actual format (`audio/mp4`) on iOS could cause issues if the server validates MIME types.

**Recommendation**: Consider making `DEFAULT_RECORDING_MIME_TYPE` platform-aware, or always use the actual `recorder.mimeType` rather than the fallback constant.

---

### 5. Audio Playback (HTMLAudioElement.srcObject)

**Status**: Supported with autoplay restrictions

**HTMLAudioElement.srcObject**: Assigning a `MediaStream` to `audio.srcObject` is fully supported in WKWebView from iOS 14.5+. The app does this correctly in `useWebRTC.ts` (lines 290-291):
```typescript
const audio = new Audio();
audio.srcObject = remoteStream;
```

**Autoplay restrictions**: iOS WKWebView enforces the same autoplay policy as Safari:
- Audio cannot autoplay without a prior user gesture.
- Setting `audio.autoplay = true` alone is insufficient.
- An explicit `.play()` call is required, and it must be traceable to a user gesture.

**App's current handling**: The app sets `audio.autoplay = true` AND calls `audio.play().catch(() => {})` (lines 292-300). This explicit `.play()` call is the correct approach. However, the `.play()` happens inside the `pc.ontrack` callback, which fires asynchronously after the WebRTC connection is established. The user gesture chain (button tap -> requestMicAccess -> connect) may have been broken by this point.

**iOS WebRTC special case**: When audio comes through a WebRTC peer connection (as opposed to a static audio file), iOS/WKWebView typically allows playback even without a direct user gesture, because the user already granted microphone permission (which implies intent to have a two-way audio session). This is a WebKit-specific behavior that benefits this app.

**Recommendation**: The current implementation should work. However, as a safety measure, consider calling `audio.play()` inside a user-gesture handler during session start and storing the audio element reference for reuse. If issues arise, the `@nickautomatic/capacitor-audio-session` plugin or similar can help configure AVAudioSession for more permissive playback.

---

### 6. iOS Audio Session (AVAudioSession)

**Status**: Requires native configuration for optimal behavior

**AVAudioSession categories**: When WebRTC is active in WKWebView, iOS automatically configures the audio session to `playAndRecord` category. This enables simultaneous microphone input and speaker output with hardware echo cancellation.

**Key considerations**:
- WKWebView manages AVAudioSession automatically when `getUserMedia()` is called -- it switches to `playAndRecord`.
- When the WebRTC session ends and the mic stream is stopped, iOS may switch back to the default `soloAmbient` category.
- Hardware AEC (Acoustic Echo Cancellation) is active when in `playAndRecord` mode, which is what the app relies on (echoCancellation: true in constraints).

**WebRTC + MediaRecorder simultaneously**: The app clones mic tracks for MediaRecorder (lines 538-540 of `useConversation.ts`), which means both WebRTC and MediaRecorder use the same underlying audio session. This works correctly because:
- Both use the same mic input (cloned tracks from the same stream).
- The audio session remains in `playAndRecord` mode throughout.
- No conflicting audio route changes occur.

**Capacitor's role**: Capacitor does not automatically configure AVAudioSession beyond what WKWebView does. For advanced audio session management (e.g., mixing with other apps, handling interruptions), a native plugin like `capacitor-plugin-audio-session` would be needed.

**Recommendation**: For most use cases, WKWebView's automatic AVAudioSession management is sufficient. Monitor for edge cases like:
- Phone calls interrupting the session (audio session interruption handling).
- Bluetooth audio device connection/disconnection mid-session.
- Silent mode switch behavior (the `playAndRecord` category ignores the silent switch by default).

---

### 7. Background Audio

**Status**: WebRTC will disconnect when backgrounded unless configured

**Default behavior**: When an iOS app goes to background:
- WKWebView's JavaScript execution is suspended after ~5-10 seconds.
- WebRTC connections will time out and disconnect.
- MediaRecorder will stop receiving data.
- AudioContext will be suspended.

**Required configuration for background audio**:

1. **UIBackgroundModes** in Info.plist:
```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

2. **AVAudioSession** must be configured with `.playAndRecord` category and the session must be active when the app backgrounds.

3. Even with background audio mode enabled, **WKWebView JavaScript execution may still be suspended**. This is a fundamental iOS limitation -- WebView content does not get the same background execution privileges as native code.

**Capacitor handling**: Capacitor does not natively handle background audio. The `@nickautomatic/capacitor-background-mode` or similar community plugin would be needed. However, maintaining a WebRTC session in the background on iOS is inherently unreliable.

**Practical impact for this app**: Given the target demographic (elderly users 60-80), it is unlikely they will intentionally keep a conversation running while switching apps. The more common scenario is accidental backgrounding (pressing home button, receiving a phone call).

**Recommendation**:
1. Accept that WebRTC sessions will disconnect on background.
2. Implement graceful reconnection when the app returns to foreground (listen for `visibilitychange` or Capacitor's `appStateChange` event).
3. Save conversation state (transcripts, recording chunks) before disconnection so the user can resume.
4. Consider showing a notification or toast when the user returns explaining that the connection was interrupted.

---

### 8. Safe Area / Notch / Dynamic Island

**Status**: Not currently handled -- must be added

**Current state**: The app's `index.html` viewport meta tag does NOT include `viewport-fit=cover`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

There is no usage of `env(safe-area-inset-*)` anywhere in the CSS (`app.css` or components).

**What needs to change**:

1. **Update viewport meta tag**:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

2. **Add safe area padding** to the root layout and fixed-position elements:
```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

3. **Capacitor default behavior**: Capacitor 5+ defaults to `viewport-fit=cover` and exposes the full screen to the WebView. The `StatusBar` plugin can be used to configure status bar appearance. Without safe area insets, UI elements will render behind the notch/Dynamic Island and home indicator.

**Impact**: On iPhone models with notch (X and later) or Dynamic Island (14 Pro and later), the conversation UI -- especially the mic button at the bottom and any top navigation -- will overlap with system UI elements.

**Recommendation**: This is a required change for any Capacitor deployment. Safe area handling must be added to:
- The main app shell/layout component (top and bottom padding).
- Any fixed-position elements (floating buttons, bottom sheets, modals).
- The conversation screen's orb/mic button area, which is likely near the bottom of the screen.

---

### 9. Echo Cancellation

**Status**: Current approach works in WKWebView, but behavior may vary

**Current implementation**: The app uses a mic-muting strategy for iOS echo prevention:
1. When AI starts speaking (`response.audio.delta`), the mic is muted via `setMicEnabled(false)` (line 834 of `useConversation.ts`).
2. When AI finishes speaking (`response.audio.done`), after a 300ms delay, the mic is re-enabled via `setMicEnabled(true)` (lines 866-869).
3. `setMicEnabled` works by toggling `track.enabled` on the audio tracks, which sends silence frames through WebRTC rather than actual mic audio.

**WKWebView-specific AEC behavior**:
- WKWebView uses the same WebKit audio pipeline as Safari, including hardware AEC via the iOS audio unit.
- The `echoCancellation: true` constraint is honored identically to Safari.
- `autoGainControl: false` is correctly disabled for iOS (AGC can interfere with AEC on iOS, as noted in the code comments referencing the LiveKit agents issue).

**Potential WKWebView differences**:
- Audio routing through WKWebView may have slightly different latency characteristics compared to Safari, which could affect AEC timing.
- The 300ms re-enable delay (`IOS_MIC_REENABLE_DELAY_MS`) was presumably tuned for Safari. It may need adjustment for WKWebView if echo behavior differs.
- When using external speakers (e.g., Bluetooth), AEC effectiveness decreases regardless of Safari vs WKWebView.

**Recommendation**: The current approach is sound and should work in WKWebView. Test with the following scenarios:
- iPhone speaker (closest distance, most likely to echo).
- iPad speaker (louder, more echo potential).
- AirPods/Bluetooth headphones (should work without issues).
- Wired headphones (best case, no echo).

Consider increasing `IOS_MIC_REENABLE_DELAY_MS` to 500ms for WKWebView if echo is observed during testing.

---

### 10. Firebase Authentication (signInWithPopup)

**Status**: BLOCKED -- requires code change

**The problem**: The app uses `signInWithPopup()` for Google authentication (`auth.ts`, line 19). **Popup windows are not supported in WKWebView.** The `window.open()` call that Firebase uses internally will either:
- Be silently blocked.
- Open in the system Safari browser (losing the auth callback context).
- Fail with an error.

This is a **fundamental incompatibility** and the single most critical issue for Capacitor deployment.

**Solutions (in order of recommendation)**:

1. **Capacitor Firebase Auth plugin** (`@capacitor-firebase/authentication`):
   - Uses native Google Sign-In SDK on iOS.
   - Provides the best UX (native sign-in sheet).
   - Handles token exchange automatically.
   - Recommended for production Capacitor apps.

2. **`signInWithRedirect()`**:
   - Replace `signInWithPopup()` with `signInWithRedirect()` + `getRedirectResult()`.
   - Works in WKWebView by navigating the full page to Google's auth flow.
   - Less ideal UX (full page redirect and back).
   - Requires configuring Firebase authorized redirect URIs for the Capacitor app's URL scheme.

3. **Custom Chrome Tab / ASWebAuthenticationSession**:
   - Use Capacitor's `@capacitor/browser` plugin to open an in-app browser for auth.
   - More complex but avoids popup issues.

**Recommendation**: Use the Capacitor Firebase Auth plugin for the best native experience. This requires:
- Adding the plugin: `npm install @capacitor-firebase/authentication`.
- Configuring `GoogleService-Info.plist` in the Xcode project.
- Adding URL scheme for Google Sign-In callback.
- Modifying `auth.ts` to use platform-specific auth flow.

---

## Capacitor iOS Configuration

### Required Xcode Project Settings

1. **Minimum iOS Deployment Target**: **iOS 16.0**
   - Ensures full WebRTC support in WKWebView.
   - iOS 16 supports iPhone 8 and later, which is reasonable for the target demographic.

2. **Capabilities**:
   - Background Modes > Audio (if background audio is desired).
   - Push Notifications (if session reminders are planned).

3. **Info.plist Required Entries**:
```xml
<!-- Microphone access -->
<key>NSMicrophoneUsageDescription</key>
<string>音声会話のためにマイクを使用します</string>

<!-- Camera access (not currently needed, but good practice to omit) -->
<!-- Only add if video features are planned -->

<!-- Background audio (optional) -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>

<!-- Google Sign-In URL scheme (if using Firebase Auth) -->
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

4. **Capacitor Configuration** (`capacitor.config.ts`):
```typescript
const config: CapacitorConfig = {
  appId: 'com.yourcompany.endnote',
  appName: 'おはなしエンディングノート',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
    // WKWebView configuration
    preferredContentMode: 'mobile',
  },
  server: {
    // For development
    url: 'http://localhost:5173',
    cleartext: true,
  },
  plugins: {
    // Status bar configuration
    StatusBar: {
      style: 'Light',
      backgroundColor: '#FBF7F0',
    },
  },
};
```

### Required Capacitor Plugins

| Plugin | Purpose | Required? |
|--------|---------|-----------|
| `@capacitor/status-bar` | Status bar appearance | Yes |
| `@capacitor/splash-screen` | App launch screen | Yes |
| `@capacitor/keyboard` | Keyboard behavior | Yes (for text input screens) |
| `@capacitor-firebase/authentication` | Native Google Sign-In | Yes (replaces popup auth) |
| `@capacitor/app` | App lifecycle events (foreground/background) | Yes |
| `@capacitor/haptics` | Vibration feedback | Optional (good for elderly UX) |

### Known Capacitor iOS Issues with WebRTC/Audio

1. **Capacitor 5 / iOS 17 WebView crash**: Early Capacitor 5 releases had a bug where WKWebView could crash on iOS 17 when using certain Web APIs. Ensure Capacitor 5.5+ is used.

2. **Audio route changes**: When a Bluetooth device connects/disconnects during a WebRTC session, the audio route can change silently. This may cause a brief audio interruption. No Capacitor-level handling exists; native plugin or AVAudioSession observer is needed.

3. **WKWebView process termination**: iOS may terminate WKWebView's web content process under memory pressure. This will kill the WebRTC connection. Capacitor's `webViewDidTerminate` delegate method should be handled to show a reconnection UI.

4. **Local file access**: If the app needs to store/read local audio recordings, Capacitor's `@capacitor/filesystem` plugin is needed. Direct `file://` URLs do not work in WKWebView by default.

---

## Risk Assessment

### High Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `signInWithPopup()` fails in WKWebView | Auth is completely broken; users cannot log in | Certain | Switch to Capacitor Firebase Auth plugin or `signInWithRedirect()` |
| No safe area insets | UI overlaps with notch/Dynamic Island/home indicator | Certain | Add `viewport-fit=cover` and `env(safe-area-inset-*)` CSS |
| AudioContext suspended in WKWebView | Mic level visualization does not work | Likely | Add explicit `ctx.resume()` call |

### Medium Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WebRTC disconnect on background | Conversation interrupted when user switches apps or receives call | Likely | Implement reconnection flow, save state |
| MediaRecorder MIME mismatch label | Server rejects or misidentifies audio format | Possible | Use actual `recorder.mimeType` for all metadata |
| AEC timing different in WKWebView | Echo feedback during conversation | Possible | Test and adjust `IOS_MIC_REENABLE_DELAY_MS` |
| Phone call interrupts audio session | WebRTC session disrupted, may not recover cleanly | Possible | Handle `AVAudioSession.interruptionNotification` via native plugin |

### Low Risk

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| iOS memory pressure kills WebView | Connection lost, unsaved data | Unlikely | Periodic state saves; handle `webViewDidTerminate` |
| Platform detection fails | iOS-specific audio constraints not applied | Unlikely (UA string contains device info) | Add `window.Capacitor` as fallback detection |
| WKWebView data channel reliability | Events dropped or delayed | Unlikely (stable since iOS 16) | Existing retry/error handling is sufficient |

---

## Recommendations

### Must-Do Before Capacitor Deployment

1. **Replace `signInWithPopup()` with Capacitor-compatible auth** (BLOCKING)
   - Install `@capacitor-firebase/authentication`.
   - Create a platform-aware auth module that uses native sign-in on iOS and popup on web.
   - File: `app/client/src/lib/auth.ts`

2. **Add safe area inset handling** (BLOCKING for notch devices)
   - Update `index.html` viewport meta tag to include `viewport-fit=cover`.
   - Add `env(safe-area-inset-*)` padding to body/root layout in `app.css`.
   - Audit all fixed-position UI elements for safe area compliance.

3. **Add explicit AudioContext.resume()** (HIGH priority)
   - In `useWebRTC.ts` `startAudioLevelMonitor()`, add `await ctx.resume()` after `new AudioContext()`.
   - This ensures mic level monitoring works even if the context starts suspended.

4. **Add `NSMicrophoneUsageDescription` to Info.plist** (BLOCKING)
   - Without this, the app will crash when calling `getUserMedia()`.
   - Use a clear Japanese description for elderly users.

5. **Configure Capacitor project** with minimum iOS 16.0 target.

### Should-Do for Production Quality

6. **Implement app lifecycle handling**
   - Listen for Capacitor `appStateChange` events.
   - Save conversation state (transcripts, recording) when backgrounding.
   - Show reconnection UI when returning to foreground after disconnection.

7. **Make `DEFAULT_RECORDING_MIME_TYPE` platform-aware**
   - Change default to `"audio/mp4"` on iOS, keep `"audio/webm"` elsewhere.
   - Ensures MIME type metadata is always accurate for server-side processing.

8. **Test and tune echo cancellation timing**
   - The 300ms `IOS_MIC_REENABLE_DELAY_MS` may need adjustment for WKWebView.
   - Test with iPhone speaker, iPad speaker, and various Bluetooth devices.
   - Consider increasing to 400-500ms if echo is observed.

9. **Add platform detection enhancement**
   - In `platform.ts`, add `window.Capacitor` check alongside UA detection:
     ```typescript
     // Capacitor always runs in WKWebView on iOS
     if (typeof (window as any).Capacitor !== 'undefined') {
       return Capacitor.getPlatform() === 'ios';
     }
     ```

10. **Handle audio session interruptions**
    - Phone calls, Siri activation, and alarms can interrupt the audio session.
    - Use a native plugin to observe `AVAudioSession.interruptionNotification`.
    - On interruption end, re-establish audio routing and resume WebRTC.

### Nice-to-Have Improvements

11. **Add haptic feedback** for elderly users
    - Vibration on mic button tap, session start/end.
    - Use `@capacitor/haptics` plugin.

12. **Implement native splash screen**
    - Use `@capacitor/splash-screen` for a polished app launch experience.
    - Match the warm `#FBF7F0` background color.

13. **Consider adding `audio/aac` to MIME candidates**
    - `audio/mp4` with AAC codec is iOS's native format.
    - Adding `audio/mp4;codecs=aac` as an explicit candidate ensures the best quality.

---

## Platform Detection in WKWebView

The current `isIOSDevice()` function in `platform.ts` will work correctly in Capacitor's WKWebView because:
- iPhone WKWebView UA contains "iPhone".
- iPad WKWebView UA (iPadOS 13+) contains "Macintosh" with `maxTouchPoints >= 2`.

However, for a more robust Capacitor integration, consider creating a `isCapacitorIOS()` function that checks `Capacitor.isNativePlatform()` and `Capacitor.getPlatform() === 'ios'`. This avoids any UA parsing edge cases and clearly distinguishes between web Safari and native app contexts.

---

## Test Plan for Capacitor Migration

1. **Auth flow**: Verify Google Sign-In works via native plugin, tokens are properly exchanged.
2. **Mic permission**: First launch shows native permission dialog, subsequent launches skip it.
3. **WebRTC connection**: Verify SDP exchange, peer connection establishment, data channel open.
4. **Audio playback**: AI voice plays through speaker without explicit user gesture after session start.
5. **Audio recording**: MediaRecorder produces valid `audio/mp4` file on iOS < 17.1.
6. **Mic level visualization**: AudioContext + AnalyserNode drives the orb animation.
7. **Echo test**: AI speaking does not trigger self-loop on iPhone speaker.
8. **Background/foreground**: Verify graceful degradation when app backgrounds and recovers.
9. **Safe area**: UI elements are not obscured by notch, Dynamic Island, or home indicator.
10. **Interruption**: Phone call during conversation does not cause app crash; session can be restarted.
11. **Devices**: Test on iPhone SE (small screen), iPhone 14/15 (notch/Dynamic Island), iPad.

---

## Appendix: Source Files Referenced

| File | Relevant APIs |
|------|--------------|
| `app/client/src/hooks/useWebRTC.ts` | RTCPeerConnection, getUserMedia, AudioContext, AnalyserNode, HTMLAudioElement.srcObject |
| `app/client/src/hooks/useConversation.ts` | MediaRecorder, MIME type fallback, mic mute/unmute |
| `app/client/src/lib/platform.ts` | iOS device detection |
| `app/client/src/lib/auth.ts` | Firebase signInWithPopup |
| `app/client/src/app.css` | Styles (no safe area handling) |
| `app/client/index.html` | Viewport meta tag (no viewport-fit=cover) |
