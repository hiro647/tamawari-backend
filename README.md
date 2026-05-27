# 🥚 たまわり バックエンド API

近所で卵をシェア購入するマッチングアプリのバックエンドです。
Node.js + Fastify + PostgreSQL で構築されています。

---

## 必要なもの

- Node.js 18 以上
- PostgreSQL 14 以上

---

## セットアップ手順

### 1. PostgreSQL でデータベースを作成

```bash
createdb tamawari
```

（または psql で `CREATE DATABASE tamawari;`）

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. 環境変数を設定

```bash
cp .env.example .env
```

`.env` を開いて `DATABASE_URL` を自分の環境に合わせて編集します。

```
DATABASE_URL=postgresql://postgres:あなたのパスワード@localhost:5432/tamawari
AUTH_MODE=dev
```

開発中は `AUTH_MODE=dev` のままでOK（後述）。

### 4. テーブルを作成

```bash
npm run migrate
```

### 5. サンプルデータを投入（任意）

```bash
npm run seed
```

実行すると開発用ユーザーのIDが表示されます。これを認証に使います。

### 6. サーバー起動

```bash
npm run dev
```

→ `http://localhost:3000` で起動します。

---

## 認証について

### 開発モード（AUTH_MODE=dev）

Firebaseの設定なしで動かせます。リクエストの HTTP ヘッダーに

```
x-dev-user-id: <ユーザーのUUID>
```

を付けるだけで、そのユーザーとしてログインした扱いになります。
UUIDは `npm run seed` で表示されたものを使ってください。

### 本番モード（AUTH_MODE=firebase）

`.env` に Firebase の認証情報を設定し、リクエストに

```
Authorization: Bearer <Firebase IDトークン>
```

を付けます。

---

## API エンドポイント一覧

### ユーザー

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| POST   | `/users`            | 新規登録 / 更新 | 不要 |
| GET    | `/users/me`         | 自分のプロフィール | 必要 |
| GET    | `/users/:id`        | 他ユーザーの公開情報 | 不要 |
| PUT    | `/users/me`         | プロフィール更新 | 必要 |
| GET    | `/users/:id/reviews`| ユーザーへの評価一覧 | 不要 |

### 募集

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| GET    | `/listings?lat=&lng=&radius=` | 近くの募集一覧 | 不要 |
| POST   | `/listings`         | 募集を投稿 | 必要 |
| GET    | `/listings/:id`     | 募集詳細 | 不要 |
| PUT    | `/listings/:id`     | 募集を編集（主催者） | 必要 |
| PATCH  | `/listings/:id/status` | 完了/キャンセル | 必要 |
| DELETE | `/listings/:id`     | 募集削除（主催者） | 必要 |

### 参加申請

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| POST   | `/listings/:id/applications` | 参加（個数指定） | 必要 |
| DELETE | `/applications/:id` | 参加キャンセル | 必要 |
| GET    | `/me/applications`  | 参加予定の一覧 | 必要 |
| GET    | `/me/listings`      | 自分の募集一覧 | 必要 |

### 評価

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| POST   | `/listings/:id/reviews` | 相手を評価 | 必要 |
| GET    | `/listings/:id/reviews` | 募集の評価一覧 | 不要 |

### チャット

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| GET    | `/listings/:id/messages` | メッセージ一覧（参加者のみ・`?after=` で差分取得） | 必要 |
| POST   | `/listings/:id/messages` | メッセージ送信（参加者のみ） | 必要 |

### ブロック

| メソッド | パス | 説明 | 認証 |
|---|---|---|---|
| GET    | `/me/blocks`          | 自分がブロックしたユーザー一覧 | 必要 |
| POST   | `/users/:id/block`    | 指定ユーザーをブロック | 必要 |
| DELETE | `/users/:id/block`    | ブロック解除 | 必要 |

> ブロックすると、フィード（`GET /listings`）からそのユーザーが投稿した募集が自動的に除外されます（閲覧者を `x-dev-user-id` ヘッダーで判定）。

---

## 動作確認の例（curl）

```bash
# ヘルスチェック
curl http://localhost:3000/health

# 近くの募集一覧（渋谷駅周辺・半径1km）
curl "http://localhost:3000/listings?lat=35.6595&lng=139.7005&radius=1000"

# 自分のプロフィール（dev認証）
curl http://localhost:3000/users/me \
  -H "x-dev-user-id: シードで表示されたUUID"

# 募集に2個で参加
curl -X POST http://localhost:3000/listings/<募集ID>/applications \
  -H "Content-Type: application/json" \
  -H "x-dev-user-id: シードで表示されたUUID" \
  -d '{"egg_count": 2}'
```

---

## フロントエンドと繋ぐ

`tamawari.jsx`（フロントエンド）には API クライアント層が組み込まれています。
ファイル冒頭の設定を書き換えるとバックエンドに接続できます。

```js
const USE_API  = true;                       // false → モック / true → API接続
const API_BASE = "http://localhost:3000";    // バックエンドのURL
const DEV_USER = "シードで表示されたUUID";     // dev認証で使うユーザーID
```

- `USE_API = false`（デフォルト）: モックデータで動作。サーバー不要
- `USE_API = true`: フィードを開くと `/listings` から実データを取得し、投稿・参加もAPI経由になります

### ログインユーザーの切り替え（複数人をテスト）

`tamawari.jsx` の `DEV_USERS` 配列に、seedで出た3人のUUIDを入れておくと、
オンボーディング画面で「どのユーザーでログインするか」を選べるようになります。

```js
const DEV_USERS = [
  { label:"山田さくら（主催者）", id:"23314541-..." },   // dev-yamada
  { label:"佐藤たろう（参加済み）", id:"4af1cf4d-..." }, // dev-sato
  { label:"鈴木はなこ（新規）",   id:"3a5d7d6c-..." },   // dev-suzuki
];
```

これで、ログインし直すだけで別のユーザーとして操作でき、
「主催者で締め切る」「参加者でキャンセルする」などを1台で試せます。
（`DEV_USERS` が空のままなら、従来どおり `DEV_USER` の固定ユーザーで動きます）

> ⚠️ ブラウザのプレビュー環境（Artifactなど）では `localhost` への通信がブロックされるため、`USE_API=true` はローカルにコードを落とした環境で使ってください。

また、独立した API クライアント（`src/api.js`）も用意しています。Vite等のビルド環境では `import { api } from "./api"` で利用でき、`VITE_API_URL` / `VITE_AUTH_MODE` の環境変数に対応しています。

---

## 設計のポイント

- **同時申請の競合対策**: 参加申請・キャンセルは `SELECT ... FOR UPDATE` で行ロックを取り、`confirmed_count` の更新をトランザクションで原子的に処理しています。複数人が同時に「残り1個」を申請しても、二重確定しません。
- **距離計算**: PostgreSQL の `earthdistance` 拡張で緯度経度から実距離（メートル）を計算し、近い順に並べています。
- **評価の自動集計**: 評価が投稿されるたびに、対象ユーザーの平均スコアを再計算して `users` テーブルに反映します。
- **1個あたり価格**: `CEIL(価格 ÷ パック個数)` で切り上げ計算しています。
- **チャットのアクセス制御**: メッセージの読み書きは、その募集の参加者・主催者だけに許可しています（それ以外は403）。新着取得は `?after=` で差分のみ返すため、ポーリングしても無駄が少なくなっています。
- **ブロックの反映**: ブロック関係は `blocks` テーブルで管理し、フィード取得時に `NOT IN (SELECT ...)` でブロック相手の募集を除外します。
