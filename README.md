# 💭 Monolog (webapp-monolog)

> **開いてワンタップ、0.1秒でつぶやける思考の逃げ場・マイクロジャーナルPWA**  
> 📁 開発リポジトリ: `/Users/s-ikari/work/webapp-monolog`  
> 🔗 連携先: `personal-vault` (`00_Inbox/monolog/YYYY/YYYY-MM-DD.md`)  
> 🗺️ 作戦ノート: `personal-vault/10_職人・発明家/webapp-monolog.md`

---

## 🎯 コンセプト & 動機
道端や電車の中などで「ふと思ったこと」「あの時のイラッとした感情」「後で調べたい小さな疑問」など、タスク管理（TODO）に書くほどではないが後で振り返らないと勿体ない思考の断片を、X（旧Twitter）感覚で一瞬で書き留めるマイクロジャーナルPWA。

- **0.1秒入力の極限UX**:
  - スマホ（iPhone PWA）を開いてワンタップでキーボードが出現、入力してEnterで完了。
  - 画面遷移・初期ロード・通信待ちは完全ゼロ（Local-First）。
- **位置情報の自動付加（Prefetch）**:
  - アプリ起動と同時にバックグラウンドでGPS測位を開始。送信時にはすでに現在地が判明しているため、遅延ゼロで場所（例: `東京都渋谷区道玄坂`）をタグ付け。
- **GitHub Private Repo 直接同期**:
  - バックエンドサーバー不要。端末ローカルから GitHub API で `personal-vault`（または専用リポジトリ）の日別Markdownに直接追記コミット。
  - 将来的に `webapp-obsidian` での閲覧、AIによる週次振り返り、`todo-calendar` へのタスク昇格の源泉として有機的に連動。

---

## 🚀 クイックスタート

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build
```

---

## 📱 iPhone PWA (ホーム画面追加) の手順

1. Safari でデプロイ先URL（またはローカルViteサーバー）を開く。
2. 画面下部の中央にある共有アイコン（四角から上矢印）をタップ。
3. **「ホーム画面に追加」** を選択。
4. ホーム画面に作成された「Monolog」アプリアイコンをタップして起動。
   - アドレスバーやツールバーのない全画面スタンドアロンモードで起動します。
   - 画面を開いてワンタップでキーボードが開き、0.1秒でつぶやきを開始できます。

---

## ⚙️ 初期設定（初回起動時）

1. 画面右上の ⚙️（設定アイコン）をタップ。
2. 以下の項目を入力：
   - **GitHub PAT**: Fine-grained Personal Access Token（`Contents: Read and write` 権限）
   - **Owner**: GitHubユーザー名（例: `hatomachi`）
   - **Repo**: 保存先リポジトリ（例: `personal-vault`）
   - **Branch**: ブランチ名（例: `main`）
   - **保存先フォルダ**: 保存先パス（デフォルト: `00_Inbox/monolog`）
3. **「GitHub 接続テスト」** を押して疎通を確認し、「保存する」をタップ。
   - ※ 同じブラウザで `webapp-obsidian` を利用している場合は、自動的に既存のVault設定が初期値としてサジェストされます。
