# Listening LabのOAuth接続先判別

2026-10-25。既存のSite URL・Authorization Pathを維持し、筋トレアプリで取得したSupabaseの接続詳細のclient IDから用途を判別する。URLパラメーターやアプリ名では判別しない。Site URLの変更は不要。

## フロントエンドの公開設定

本人が公開先のビルド設定へ次を登録する。秘密のclient secretは設定しない。実際の設定ファイル・認証情報は今回の作業では読んでいない。

| 設定名 | 値 |
| --- | --- |
| `VITE_NUTRITION_OAUTH_CLIENT_ID` | 現在使っている栄養専用client ID |
| `VITE_LISTENING_QUIZ_CLIENT_ID` | 別途登録したListening Lab問題作成専用client ID |
| `VITE_LISTENING_QUIZ_CONSENT_URL` | Listening Labの公開済み同意画面の完全なHTTPS URL。query・fragment・認証情報を含めない |

設定を登録してからフロントエンドを再ビルド・公開する。栄養の既存client IDを必ず登録する。未設定のclientは既存接続であっても今回の画面では承認できない。両用途で同じclient IDを使わない。

栄養の既知clientは従来の所有者確認・`hypertrophy_nutrition_client`登録・OAuth承認へ進む。Listening Labの既知clientは`openid`だけを要求していることを確認し、固定の同意画面へ`authorization_id`だけを付けたリンクを表示する。栄養登録・OAuth承認はこの分岐では行わない。Listening Labへのログインは同アプリ側で別途必要であり、セッションやトークンをURLへ渡さない。

Listening Lab側では既存の`VITE_LISTENING_QUIZ_CLIENT_ID`と`VITE_LISTENING_QUIZ_CALLBACK_URL`も本人が登録する。同アプリ側の所有者・接続ID・要求範囲・正確な戻り先の検証を維持する。別プロジェクトのソースは変更していない。

Supabaseが承認済み接続について`redirect_url`だけを返す場合、その応答には用途を判別するclient IDがない。未知clientを推測で扱わないため、この場合は転送を停止する。画面の案内に従いChatGPTで接続を取り消してから接続し直す。コード付きURLを表示・ログ保存しない。これは初回承認後の通常の戻り処理とは別で、栄養画面の承認成功後は従来どおり戻り先のorigin/pathを照合して戻る。

## Token Hookの統合準備

調査で確認した関数：栄養の`public.hypertrophy_nutrition_token_hook(jsonb)`は登録済み本人・clientへaud/client_id/scopeを設定する。Listening Labの`public.listening_quiz_token_hook(jsonb)`は専用登録clientと所有者を確認してrole/quiz_resourceを設定する。通常ログインと対象外clientは各helperで維持する。

`supabase/security/work-oauth-token-hook.sql`は両helperを順に呼ぶ統合関数の準備用SQL。通常ログインはそのまま返し、両登録先に重複するclient IDや食い違ったclient IDは拒否する。既存helperは上書きせず、Auth設定も変更しない。

現時点のDashboardで有効なHookは未確認。本人が現在の設定を確認し、既存Hookが上記以外ならその処理もレビューして統合するまで切り替えない。両方の元SQLが存在すること、通常ログイン・栄養・Listening Lab・未知client・重複clientを試験環境の架空ユーザーで検証してから、統合関数をCustom Access Token Hookに設定する。実データやトークンをチャット・ログへ出さない。専用ロールの分離監査もListening Lab側の手順を継続する。

## 検証と未完了の範囲

`tests/oauthConsent.test.ts`はダミーだけでclient IDの完全一致、表示名を無視した分岐、設定不足・衝突、不正URL、本人・接続ID・scopeの不一致、未ログイン、取得失敗、承認済み応答の停止を検証する。既存の栄養・MCPテストも実行する。ビルドには秘密の設定ファイルを読み込まない`npm.cmd run build:safe`を使う。

公開URLとclient IDの登録、SQLの適用・実Postgres上の検証、現在有効なHookの確認と切り替え、公開後の両用途のOAuth往復、通常ログインの実機確認は今回未実施。公開後は架空の食材・英文でそれぞれ接続→取得→下書き/問題保存を確認する。

公式仕様：[Supabaseの接続詳細API](https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails)、[同意画面の設定](https://supabase.com/docs/guides/auth/oauth-server/getting-started)。
