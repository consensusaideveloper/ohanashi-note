# WebView (iOS/Android) 互換性調査レポート

**作成日**: 2026-03-02
**ブランチ**: `docs/webview-compatibility-analysis`
**対象**: おはなしエンディングノート — 高齢者向け音声会話Webアプリ

---

## 1. Executive Summary

### 結論: **条件付きで対応可能**

現在のWebアプリは **Capacitor** を使用してiOS/Androidネイティブアプリ化が可能です。ただし、以下の条件があります:

- **そのままでは動作しない** — 3つのCriticalな問題（認証・CORS・APIベースURL）の解決が必須
- **コアの音声会話機能はWebViewで動作する** — WebRTC、getUserMedia、AudioContext、MediaRecorderは全てCapacitor WebViewで対応済み
- **既存のiOS対応コードはWebViewでもそのまま有効** — AEC最適化、マイクミュート/リイネーブル、autoplay対応

### 対応工数の見積もり

| カテゴリ | 変更ファイル数 | 規模 |
|---------|-------------|------|
| Critical（必須） | 3ファイル + 新規設定 | 中 |
| Important（推奨） | 4-5ファイル | 小〜中 |
| Nice-to-have | 2-3ファイル | 小 |

### 推奨フレームワーク: Capacitor

Capacitorが最適な理由:
1. 既存のReact+Viteプロジェクトにそのまま統合可能
2. iOS WKWebView / Android Chrome WebViewをラップ（WebRTC自動対応）
3. Firebase Authのネイティブ連携プラグインが充実
4. マイクパーミッションを自動管理
5. Web開発ワークフローを維持しながらネイティブアプリ化可能

---

## 2. 互換性マトリクス

### ブラウザAPI × プラットフォーム対応表

| API | Web (現状) | iOS WKWebView | Android WebView | Capacitor iOS | Capacitor Android |
|-----|-----------|---------------|-----------------|---------------|-------------------|
| `getUserMedia()` | ✅ | ✅ iOS 14.5+ | ❌ 要カスタム実装 | ✅ 自動 | ✅ 自動 |
| `RTCPeerConnection` | ✅ | ✅ iOS 14.5+ | ❌ デフォルト無効 | ✅ iOS 16+推奨 | ✅ API 24+推奨 |
| `RTCDataChannel` | ✅ | ✅ iOS 14.5+ | ❌ | ✅ | ✅ |
| `AudioContext` | ✅ | ⚠️ suspended状態 | ⚠️ ユーザージェスチャー必要 | ⚠️ resume()追加推奨 | ✅ |
| `AnalyserNode` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MediaRecorder` | ✅ | ⚠️ webm非対応(iOS<17.1) | ✅ webm/opus対応 | ⚠️ mp4フォールバック | ✅ webm/opus |
| `HTMLAudioElement.srcObject` | ✅ | ✅ | ❌ 不安定 | ✅ | ✅ |
| `signInWithPopup()` | ✅ | ❌ ブロック | ❌ ブロック | ❌ → ネイティブ認証 | ❌ → ネイティブ認証 |
| `env(safe-area-inset-*)` | N/A | ✅ iOS 11+ | N/A | ✅ 要設定 | N/A |
| Wake Lock API | ✅ | ❌ | ❌ WebView非対応 | ❌ → プラグイン | ❌ → プラグイン |

### 最小バージョン要件

| プラットフォーム | 最小バージョン | 推奨バージョン | 理由 |
|----------------|-------------|-------------|------|
| iOS | 14.5 | **16.0** | WebRTCの完全対応・安定性 |
| Android | API 23 (6.0) | **API 24 (7.0)** | WebView自動更新による一貫性 |
| Capacitor | 6.x | 6.x最新 | WebRTC/メディアAPI対応改善 |

---

## 3. Critical Issues & Solutions

### Issue 1: Firebase Popup認証が動作しない

**影響度**: ユーザーがログインできない（アプリ使用不可）
**発生確率**: 確実（100%）
**対象ファイル**: `app/client/src/lib/auth.ts:19`

**原因**: `signInWithPopup()` はWebView内でポップアップウィンドウを開けない。Google OAuth 2.0ポリシーもWebView内認証を明示的にブロックしている。

**解決策**: `@capacitor-firebase/authentication` プラグインでネイティブ認証に切替

```typescript
// auth.ts の変更イメージ
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

export async function signInWithGoogle(): Promise<User> {
  if (Capacitor.isNativePlatform()) {
    // ネイティブ: Google Sign-In SDK経由
    const result = await FirebaseAuthentication.signInWithGoogle();
    const credential = GoogleAuthProvider.credential(
      result.credential?.idToken ?? null,
      result.credential?.accessToken ?? null,
    );
    const userCredential = await signInWithCredential(firebaseAuth, credential);
    return userCredential.user;
  } else {
    // Web: 既存のPopup認証を維持
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    return result.user;
  }
}
```

**追加要件**: iOS App Store申請にはApple Sign-Inの実装も必須（Googleログインを提供する場合）。

**必要な設定**:
- Firebase ConsoleにiOS/Androidアプリを追加
- `GoogleService-Info.plist` (iOS) / `google-services.json` (Android) の配置
- URL Schemeの設定（Google Sign-Inコールバック用）

---

### Issue 2: CORS / Origin不一致

**影響度**: 全APIリクエストが失敗
**発生確率**: 確実（100%）
**対象ファイル**: `app/server/src/index.ts`（CORSミドルウェア未設定）

**原因**: 現在のサーバーにはCORSミドルウェアがない。本番環境では同一オリジンで動作しているが、Capacitor WebViewのオリジンは異なる。

| プラットフォーム | Origin |
|----------------|--------|
| iOS Capacitor | `capacitor://localhost` |
| Android Capacitor | `http://localhost` |
| Web (本番) | `https://your-app.railway.app` |

**解決策**: Hono CORSミドルウェアの追加

```typescript
// server/src/index.ts への追加
import { cors } from "hono/cors";

app.use("/api/*", cors({
  origin: config.allowedOrigins,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
  credentials: true,
}));
```

**環境変数の更新**:
```
ALLOWED_ORIGINS=https://your-app.railway.app,capacitor://localhost,http://localhost
```

---

### Issue 3: APIベースURLの解決

**影響度**: 全APIリクエストがlocalhostに向かい失敗
**発生確率**: 確実（100%）
**対象ファイル**: `app/client/src/lib/api.ts`

**原因**: 現在のAPI呼び出しは相対パス（`/api/...`）を使用。Capacitorでローカルコンテンツを配信する場合、相対パスはCapacitorのlocalhostに解決され、APIサーバーに到達しない。

**解決策**: 環境変数 `VITE_API_BASE_URL` の導入

```typescript
// api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function fetchWithAuth(path: string, ...): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ... });
}
```

Capacitorビルド時に `VITE_API_BASE_URL=https://your-app.railway.app` を設定。

---

## 4. Capacitor統合計画

### 必要なCapacitorプラグイン

| プラグイン | 用途 | 優先度 |
|-----------|------|--------|
| `@capacitor/core` + `@capacitor/cli` | Capacitor基盤 | 必須 |
| `@capacitor-firebase/authentication` | ネイティブGoogle/Apple認証 | 必須 |
| `@capacitor/app` | バックボタン、アプリ状態管理 | 必須 |
| `@capacitor-community/keep-awake` | 会話中の画面スリープ防止 | 必須 |
| `@capacitor/status-bar` | ステータスバー外観制御 | 推奨 |
| `@capacitor/splash-screen` | スプラッシュスクリーン | 推奨 |
| `@capacitor/keyboard` | キーボード動作制御 | 推奨 |
| `@capacitor/haptics` | 触覚フィードバック | 任意 |

### iOS固有の設定

**Info.plist**:
```xml
<!-- マイクアクセス（必須） -->
<key>NSMicrophoneUsageDescription</key>
<string>音声会話のためにマイクを使用します</string>

<!-- バックグラウンドオーディオ（任意） -->
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>

<!-- Google Sign-In URL Scheme -->
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

**Xcodeプロジェクト**:
- Minimum Deployment Target: iOS 16.0
- `GoogleService-Info.plist` をプロジェクトに追加

### Android固有の設定

**AndroidManifest.xml**:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

**build.gradle**:
```groovy
android {
    defaultConfig {
        minSdkVersion 24     // Android 7.0
        targetSdkVersion 34  // Google Play Store要件
    }
}
```

### capacitor.config.ts

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.ohanashi",
  appName: "おはなしエンディングノート",
  webDir: "client/dist",
  ios: {
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
    preferredContentMode: "mobile",
  },
  android: {
    allowMixedContent: false,
    adjustResize: false,
  },
  server: {
    allowNavigation: [
      "your-app.railway.app",
      "accounts.google.com",
      "appleid.apple.com",
    ],
  },
  plugins: {
    StatusBar: {
      style: "Light",
      backgroundColor: "#FBF7F0",
    },
    SplashScreen: {
      launchAutoHide: false,
      androidScaleType: "CENTER_CROP",
    },
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ["google.com", "apple.com"],
    },
  },
};

export default config;
```

### デプロイモード: ローカルコンテンツ + リモートAPI（推奨）

ビルド済みクライアントをネイティブアプリにバンドルし、APIリクエストのみリモートサーバーに送信する方式を推奨:
- 高速な初期表示（ネットワーク不要でUI表示）
- App Storeガイドライン準拠
- 標準的なCapacitorデプロイモデル

---

## 5. 必要なコード変更一覧

### Critical（必須 — これがないと動作しない）

| # | ファイル | 変更内容 | 規模 |
|---|---------|---------|------|
| 1 | `app/client/src/lib/auth.ts` | `signInWithPopup` → Capacitorネイティブ認証分岐 | Major |
| 2 | `app/server/src/index.ts` | Hono CORSミドルウェア追加 | Minor |
| 3 | `app/client/src/lib/api.ts` | `VITE_API_BASE_URL` 環境変数対応 | Minor |
| 4 | `app/client/index.html` | `viewport-fit=cover` 追加 | Trivial |
| 5 | 新規: `capacitor.config.ts` | Capacitor設定ファイル作成 | New |
| 6 | 新規: iOS/Android ネイティブプロジェクト | `npx cap add ios/android` | New |

### Important（推奨 — 品質・安定性に影響）

| # | ファイル | 変更内容 | 規模 |
|---|---------|---------|------|
| 7 | `app/client/src/hooks/useWebRTC.ts` | `AudioContext.resume()` 追加（L135付近） | Trivial |
| 8 | `app/client/src/app.css` | `env(safe-area-inset-*)` パディング追加 | Minor |
| 9 | `app/client/src/hooks/useConversation.ts` | バックグラウンド/フォアグラウンド遷移処理追加 | Minor |
| 10 | `app/client/src/hooks/useConversation.ts` | 画面スリープ防止（keep-awake）連携 | Minor |
| 11 | App.tsx or 新規hook | Androidバックボタン処理 | Minor |

### Nice-to-have（任意 — UX向上）

| # | ファイル | 変更内容 | 規模 |
|---|---------|---------|------|
| 12 | `app/client/src/lib/platform.ts` | `Capacitor.isNativePlatform()` 検出追加 | Trivial |
| 13 | `app/client/src/hooks/useConversation.ts` | Android用エコーガード（軽量版）追加 | Minor |
| 14 | 会話開始前画面 | マイクパーミッション説明UI | Minor |

---

## 6. リスクアセスメント

### 高リスク

| リスク | 影響 | 発生確率 | 対策 |
|--------|------|---------|------|
| `signInWithPopup()` がWebViewで動作しない | 認証不可 — アプリ使用不能 | 確実 | ネイティブ認証プラグインに切替 |
| CORSでAPIリクエスト全拒否 | 全機能停止 | 確実 | Hono CORSミドルウェア追加 |
| APIベースURLがlocalhostに解決 | API通信不可 | 確実 | `VITE_API_BASE_URL` 環境変数導入 |
| SafeArea未対応でUI重なり | ノッチ/Dynamic Island下にUI要素が隠れる | 確実 | viewport-fit=cover + CSS safe-area |
| 会話中に画面スリープ | 会話中断・高齢者に混乱 | 確実 | keep-awakeプラグイン導入 |

### 中リスク

| リスク | 影響 | 発生確率 | 対策 |
|--------|------|---------|------|
| バックグラウンド移行でWebRTC切断 | 会話中断 | 高 | appStateChange検知 + 再接続UI |
| Androidバックボタンで会話離脱 | データ未保存で終了 | 高 | @capacitor/app でハンドリング |
| AudioContextがsuspended状態で開始 | マイクレベル可視化が動作しない | 中 | `ctx.resume()` 追加 |
| 格安Androidデバイスでエコー発生 | 会話品質低下 | 中 | Android用エコーガード追加検討 |
| iOS WKWebViewストレージクリア | 認証状態消失 | 低〜中 | @capacitor/preferences でバックアップ |
| 電話着信でオーディオセッション中断 | WebRTC切断 | 中 | 再接続フロー実装 |

### 低リスク

| リスク | 影響 | 発生確率 | 対策 |
|--------|------|---------|------|
| MediaRecorder MIMEタイプ不一致 | 録音フォーマットのラベルずれ | 低 | 既存フォールバックで対応済み |
| プラットフォーム検出失敗 | iOS固有制御が適用されない | 低 | UAにデバイス情報含まれるため概ね問題なし |
| iOS メモリ圧迫でWebView終了 | 接続切断・データ消失 | 低 | 定期的な状態保存 |
| Bluetooth接続/切断で音声ルート変更 | 一時的な音声中断 | 低 | ネイティブプラグインで対応可能 |

---

## 7. 推奨ロードマップ

### Phase 1: サーバー側CORS対応（クライアント変更なし）

```
所要時間: 1日
変更ファイル:
  - app/server/src/index.ts (CORSミドルウェア追加)
  - .env.production (ALLOWED_ORIGINS更新)
```

### Phase 2: Capacitorプロジェクトセットアップ

```
所要時間: 1-2日
作業:
  - npm install @capacitor/core @capacitor/cli
  - npx cap init
  - npx cap add ios && npx cap add android
  - capacitor.config.ts 作成
  - 必須プラグインインストール
  - Info.plist / AndroidManifest.xml 設定
  - GoogleService-Info.plist / google-services.json 配置
```

### Phase 3: 認証リファクタリング

```
所要時間: 2-3日
変更ファイル:
  - app/client/src/lib/auth.ts (ネイティブ認証分岐)
  - Firebase Console設定 (iOS/Androidアプリ追加)
  - Google Cloud Console (OAuth Client ID追加)
  - Apple Developer (Sign in with Apple設定)
```

### Phase 4: API・UI基盤対応

```
所要時間: 1-2日
変更ファイル:
  - app/client/src/lib/api.ts (API_BASE_URL)
  - app/client/index.html (viewport-fit=cover)
  - app/client/src/app.css (safe-area-inset)
  - app/client/src/hooks/useWebRTC.ts (AudioContext.resume)
```

### Phase 5: プラットフォーム固有対応

```
所要時間: 2-3日
変更ファイル:
  - useConversation.ts (バックグラウンド処理, keep-awake)
  - App.tsx (Androidバックボタン)
  - platform.ts (Capacitorネイティブ検出)
```

### Phase 6: テスト・最適化

```
所要時間: 3-5日
テストデバイス:
  iOS: iPhone SE (小画面), iPhone 14/15 (ノッチ/Dynamic Island), iPad
  Android: Google Pixel (基準), Samsung Galaxy (普及帯), AQUOS sense/arrows (高齢者向け)
テスト項目:
  - 認証フロー（Google/Apple Sign-In）
  - マイクパーミッション（初回・2回目以降）
  - WebRTC接続（SDP交換・P2P確立・データチャネル）
  - AI音声再生（スピーカー・イヤホン・Bluetooth）
  - ローカル録音（MediaRecorder → R2アップロード）
  - エコーテスト（iPhoneスピーカー・iPad・Bluetooth）
  - バックグラウンド/フォアグラウンド遷移
  - 電話着信中の挙動
  - バックボタン/ジェスチャーナビゲーション
  - SafeArea表示確認
  - 画面スリープ防止確認
```

### Phase 7: App Store準備

```
所要時間: 2-3日
作業:
  - Apple Sign-In実装（App Store要件）
  - プライバシーラベル設定
  - アプリアイコン・スクリーンショット
  - App Store / Google Play審査提出
```

---

## 8. 検証方法

### 各課題の検証手順

| 検証項目 | 手順 | 期待結果 |
|---------|------|---------|
| Firebase認証 | Capacitorアプリでログインボタンをタップ | ネイティブGoogle Sign-Inシートが表示され、認証後にアプリに戻る |
| CORS | Capacitorアプリから `/api/profile` にリクエスト | 200 OKでユーザー情報が返る（CORSエラーなし） |
| APIベースURL | Capacitorアプリで会話一覧画面を表示 | Railway サーバーからデータが正常取得される |
| マイクパーミッション | 初回会話開始ボタンタップ | OSネイティブのパーミッションダイアログが表示される |
| WebRTC接続 | 会話を開始 | SDP交換成功 → P2P接続確立 → データチャネルopen |
| AI音声再生 | AIが応答 | スピーカーから音声が再生される（autoplayブロックなし） |
| エコーテスト | iPhoneスピーカーでAI発話中→マイク再有効化 | エコーループが発生しない |
| ローカル録音 | 会話終了後 | 録音ファイルがR2にアップロードされる |
| マイクレベル | 会話中にマイクに向かって話す | AiOrbのグロー表示がリアルタイムに反応する |
| バックグラウンド | 会話中にホームボタンを押してアプリに戻る | 再接続UIが表示されるか、会話が安全に終了する |
| SafeArea | iPhone 14以降で画面確認 | ノッチ/Dynamic Island下にUI要素が重ならない |
| 画面スリープ | 5分間会話を継続 | 画面がスリープしない |
| バックボタン (Android) | 会話中にバックジェスチャー | 確認ダイアログが表示される（即座に離脱しない） |

---

## 9. 現在の実装で問題ない項目

以下の項目は **コード変更なし** でCapacitor WebViewでも正常に動作します:

| 項目 | 理由 |
|------|------|
| WebRTC P2P接続 (OpenAI Realtime API) | Capacitor WebViewはWebRTCフル対応 |
| iOS AEC最適化 (`autoGainControl: false`) | WKWebViewでもSafariと同じWebKitエンジン |
| マイクミュート/リイネーブル（エコーガード） | `track.enabled` トグルはWebViewでも同一動作 |
| 明示的 `audio.play()` 呼び出し | iOS WebRTCのautoplay特例で動作 |
| MediaRecorder MIMEフォールバックチェーン | iOS: mp4にフォールバック、Android: webm/opusを選択 |
| プラットフォーム検出 (`isIOSDevice()`) | WebView UAにデバイス情報が含まれる |
| Firebase Auth状態の永続化 | IndexedDB/localStorageはCapacitorで動作 |
| Secure Context (getUserMedia/WebRTC) | `capacitor://localhost` / `http://localhost` は安全なコンテキスト |
| ノイズフィルタリング (Whisper幻覚除去) | クライアントサイドロジックのため影響なし |
| セッションタイマー・クォータ管理 | サーバーサイドロジックのため影響なし |

---

## 10. 個別調査レポートへのリンク

詳細な技術調査は以下の個別レポートを参照:

- [iOS WKWebView互換性調査](investigation/ios-webview-findings.md)
- [Android WebView互換性調査](investigation/android-webview-findings.md)
- [認証・統合互換性調査](investigation/auth-integration-findings.md)
