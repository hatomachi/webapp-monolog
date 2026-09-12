# AI Agent Instruction Guide for Monolog (webapp-monolog)

このドキュメントは、AIエージェント（Antigravity / Pair Programmer）が本プロジェクトに参加した際に、**設計思想・開発動機・アーキテクチャ・0.1秒入力UX・セキュリティ方針** を正確に理解し、ブレずに高品質な開発を継続するための総合ガイドです。

> [!IMPORTANT]
> **🎯 プロダクト作戦ノート & Next Actions (personal-vault)**:  
> 本プロダクトの全体ビジョン、現在地、ユーザーからの日常フィードバック、直近の Next Actions は [webapp-monolog.md](file:///Users/s-ikari/work/personal-vault/10_%E8%81%B7%E4%BA%BA%E3%83%BB%E7%99%BA%E6%98%8E%E5%AE%B6/webapp-monolog.md) に一元管理されています。実装着手・機能完了時は必ず確認・更新してください。

---

## 1. 🎯 プロジェクトの存在理由と開発動機

- **思考の逃げ場・マイクロジャーナル**:
  - 道端や電車の中などで「ふと思ったこと」「あの時のイラッとした感情」「後で調べたい疑問」など、タスク管理（TODO）に書くほどではないが後で振り返らないと勿体ない思考の断片を、X（旧Twitter）感覚で一瞬で書き留める。
- **0.1秒入力への徹底的なこだわり**:
  - スマホ（iPhone PWA）を開いてワンタップ、0.1秒でキーボードが立ち上がり、入力してEnterで完了。
  - 初期ロード時間や画面遷移、通信待ちは完全ゼロ（Local-First）。
  - 移動中の位置情報（GPS緯度経度・スポット名）とタイムスタンプを自動付与し、「いつ・どこで・何を考えたか」を有機的に記録。
- **パーソナルエコシステムとの連動**:
  - `personal-vault`（または専用リポジトリ）の日別Markdown（`00_Inbox/monolog/YYYY-MM-DD.md`）へバックグラウンド同期。
  - 将来的に `webapp-obsidian` での閲覧、AI（Gemini/AI Notebook）による週次振り返り、`todo-calendar` へのタスク昇格の源泉とする。

---

## 2. 🛡️ コアアーキテクチャ原則（破ってはならないルール）

1. **完全サーバーレス & ローカルファースト**:
   - ホスティングは Cloudflare Pages / Workers Assets 等の静的ファイル配信のみ。中継サーバーは置かない。
   - 送信操作は通信を待たず、即座に IndexedDB / LocalStorage にローカル保存して入力欄を0msでクリアする。
2. **位置情報の事前取得（Prefetch）**:
   - 送信ボタン押下時にGPS測位を開始するのではなく、アプリ起動時にバックグラウンドで事前取得しておくことで、送信時の位置情報付与遅延をゼロにする。
3. **GitHub Private Repo 直接同期**:
   - GitHub PAT は端末内（localStorage）に安全に保持。
   - バックグラウンドで日別Markdownファイルへの追記コミットをキューイング処理。
4. **Obsidian完全互換のMarkdownフォーマット**:
   - 出力はObsidian標準の日別ノート形式を採用し、手動でもAIでも扱いやすい構造を維持する。
