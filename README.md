# Tiara — 錦糸町 夜のお仕事求人プラットフォーム　

## セットアップ手順

### 1. GitHubにプッシュ
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/あなたのユーザー名/tiara.git
git push -u origin main
```

### 2. Vercelにデプロイ
1. https://vercel.com にアクセス
2. 「Add New Project」→ GitHubリポジトリを選択
3. そのままDeploy

### 3. Vercelに環境変数を設定
Vercel Dashboard → Project → Settings → Environment Variables

| 変数名 | 値 |
|--------|-----|
| STRIPE_SECRET_KEY | sk_test_51T8gMs... |
| STRIPE_PUBLISHABLE_KEY | pk_test_51T8gMs... |
| STRIPE_WEBHOOK_SECRET | whsec_... (後で設定) |
| STRIPE_PRICE_LIGHT | price_... (後で設定) |
| STRIPE_PRICE_STANDARD | price_... (後で設定) |
| STRIPE_PRICE_PREMIUM | price_... (後で設定) |

### 4. StripeでPrice（商品）を作成
Stripeダッシュボード → 商品 → 「商品を追加」

| 商品名 | 価格 | 請求サイクル |
|--------|------|-------------|
| Tiaraライトプラン | ¥19,800 | 月次 |
| Tiaraスタンダードプラン | ¥39,800 | 月次 |
| Tiaraプレミアムプラン | ¥79,800 | 月次 |

各商品のPrice IDをVercelの環境変数に設定。

### 5. StripeのWebhookを設定
Stripeダッシュボード → 開発者 → Webhook → 「エンドポイントを追加」

- URL: `https://あなたのドメイン.vercel.app/api/webhook`
- イベント:
  - `invoice.created`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`

表示されたWebhook Signing SecretをVercelの `STRIPE_WEBHOOK_SECRET` に設定。

---

## API一覧

| エンドポイント | メソッド | 説明 |
|--------------|---------|------|
| `/api/create-subscription` | POST | サブスクリプション作成 |
| `/api/apply-guarantee` | POST | 応募ゼロ保証クーポン適用 |
| `/api/subscription-status` | GET | 契約状態・請求履歴取得 |
| `/api/webhook` | POST | Stripeイベント受信 |

## テスト用カード番号
- 成功: `4242 4242 4242 4242`
- 3Dセキュア: `4000 0025 0000 3155`
- 失敗: `4000 0000 0000 0002`
- 有効期限: 未来の日付 / CVV: 任意3桁
