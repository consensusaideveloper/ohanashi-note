# Railwayでログを確認する方法

## 1. Railwayダッシュボードにアクセス
1. https://railway.app にアクセス
2. ログイン

## 2. プロジェクトを選択
1. ダッシュボードで「ohanashi-staging」プロジェクトをクリック

## 3. サービスを選択
プロジェクト内には複数のサービスがあります：
- **Webサービス（アプリ）** ← これのログを見る
- PostgreSQL（データベース） ← これではない

**Webサービス（四角いアイコン）をクリック**

## 4. ログを表示
1. サービスページの上部メニューで「Logs」タブをクリック
2. または、右側のパネルに「View Logs」ボタンがあればクリック

## 5. 確認するログメッセージ

### サーバー起動時のログ
```
[INFO] Server started
[INFO] R2 configured  ← これが出ていればR2設定OK
または
[INFO] R2 not configured — audio storage disabled  ← これが出ていたらR2未設定
```

### 会話時のログ
```
[INFO] WebSocket client connected
[INFO] Connected to OpenAI Realtime API
```

## 6. ブラウザのコンソールも確認

1. アプリを開く（https://ohanashi-staging.railway.app）
2. F12キーを押して開発者ツールを開く
3. 「Console」タブを選択
4. 会話を録音して終了
5. 以下のログを確認：
   - `Saving audio recording:`
   - `saveAudioRecording called:`
   - `Got upload URL response:` または `Failed to get upload URL:`

## トラブルシューティング

もし「R2 not configured」と出ていたら：
1. Railwayの環境変数を確認
2. 以下の変数が設定されているか確認：
   - R2_ACCOUNT_ID
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME