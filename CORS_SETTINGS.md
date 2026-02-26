# Cloudflare R2 CORS設定

R2バケットでCORSを設定する必要があります。Cloudflareダッシュボードから以下の設定を追加してください：

## R2 > バケット > ohanashi-media > 設定 > CORS ポリシー

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://ohanashi-staging.railway.app",
      "https://ohanashi-production.railway.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 設定手順

1. Cloudflareダッシュボードにログイン
2. R2を選択
3. `ohanashi-media`バケットを選択
4. 「設定」タブを選択
5. 「CORSポリシー」セクションで「編集」をクリック
6. 上記のJSON設定を貼り付け
7. 保存

これにより、ブラウザから直接R2への音声アップロードが可能になります。