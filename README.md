# 旅行プランナー

Google Maps と連携した旅行計画 Web アプリケーションです。地図上でスポットを探しながら日程を組み立て、経路案内や候補リストを活用して旅行プランを効率的に作成できます。

## 主な機能

### スポット管理
- **地図クリックで追加** — Google Maps 上の POI（観光地・飲食店など）をクリックするだけでスポット情報を取得
- **テキスト検索** — スポット名・地名で検索してタイムラインに追加
- **写真・HP リンク** — Google Places API から写真（最大3枚）と公式 HP URL を自動取得
- **営業時間警告** — 設定した訪問時間が営業時間外の場合にアイコンで警告

### 日程タイムライン
- **日別管理** — 旅行期間の各日にスポットを割り当て
- **ドラッグ＆ドロップ** — スポットの並び替え・日をまたいだ移動に対応
- **経路表示** — スポット間の移動時間・距離を取得（徒歩・車: Routes API、電車: Google マップリンク）
- **開始時間・滞在時間** — スポットごとに設定可能

### 候補リスト
- 訪問を検討中のスポットを「候補リスト」に一時保存
- 写真・HP リンク付きで一覧表示
- ワンクリックで任意の日程に昇格

### 認証・データ永続化
- メール認証（Supabase Auth）
- ログイン状態を跨いでデータを保持（Supabase Database + Row Level Security）
- 旅行プランの共有リンク生成

## 技術スタック

| 分類 | 技術 |
|------|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| 地図 | Google Maps JavaScript API (`@vis.gl/react-google-maps`) |
| Places / Routes | Google Places API (New) / Routes API v2 |
| 認証・DB | Supabase (Auth + PostgreSQL + RLS) |
| 状態管理 | Zustand |
| ドラッグ＆ドロップ | @dnd-kit |
| 日付操作 | date-fns |

## セットアップ

### 1. リポジトリをクローン

```bash
git clone https://github.com/KatsurayamaHaruki/googlemap-travel-planner.git
cd googlemap-travel-planner
npm install
```

### 2. Google Cloud Console の設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 以下の API を有効化
   - Maps JavaScript API
   - Places API (New)
   - Routes API
3. API キーを作成し、HTTP リファラー制限を設定（例: `localhost:3000/*`）

### 3. Supabase の設定

1. [Supabase](https://supabase.com/) でプロジェクトを作成
2. SQL Editor で以下を実行してテーブルと RLS を設定

```sql
-- テーブル作成
create table public.trips (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security 有効化
alter table public.trips enable row level security;

-- 認証ユーザーへの権限付与
grant select, insert, update, delete on public.trips to authenticated;

-- 自分のデータのみ操作できるポリシー
create policy "Users can manage their own trips"
  on public.trips
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

3. Authentication → Providers で **Email** を有効化
4. Authentication → URL Configuration で `Site URL` と `Redirect URLs` に `http://localhost:3000` を追加

### 4. 環境変数の設定

プロジェクトルートに `.env.local` を作成します。

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Supabase の URL と Anon Key は Project Settings → API から確認できます。

### 5. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開きます。

## ディレクトリ構成

```
src/
├── app/
│   ├── page.tsx                  # トップページ（旅行一覧）
│   ├── login/page.tsx            # ログインページ
│   ├── trips/[id]/page.tsx       # 旅行プランページ
│   ├── share/page.tsx            # 共有リンクページ（認証不要）
│   ├── auth/callback/route.ts    # Supabase Auth コールバック
│   └── api/directions/route.ts   # Directions API プロキシ
├── components/
│   ├── TripMap.tsx               # Google マップ表示・POI クリック
│   ├── ItineraryPanel.tsx        # 日程タイムライン・経路表示
│   ├── CandidatePanel.tsx        # 候補リストパネル
│   ├── PendingSpotCard.tsx       # POI クリック後の追加カード
│   ├── SpotDetailPanel.tsx       # スポット詳細・編集
│   ├── SpotSearchModal.tsx       # スポット検索モーダル
│   └── CreateTripModal.tsx       # 旅行作成モーダル
├── store/
│   └── tripStore.ts              # Zustand グローバルストア
├── hooks/
│   └── useDirections.ts          # 経路取得フック
├── lib/
│   ├── supabase.ts               # Supabase クライアント
│   ├── openingHours.ts           # 営業時間ユーティリティ
│   └── utils.ts                  # 汎用ユーティリティ
├── types/
│   └── index.ts                  # 型定義
└── middleware.ts                  # 未ログインリダイレクト
```

## 使い方

### 旅行プランの作成
1. トップページで「新しい旅行」をクリック
2. タイトル・目的地・期間を入力して作成

### スポットの追加
- **地図クリック**: 地図上の観光地・飲食店などをクリック → カードが表示されたら日程を選んで追加
- **テキスト検索**: 「スポット追加」ボタンから検索
- **候補リスト**: カードの「候補リストに保存」でひとまず保存し、後で日程に追加

### 経路の確認
タイムライン上のスポット間にある「経路を表示」をクリックし、移動手段（電車・車・徒歩）を選択します。

## ライセンス

MIT
