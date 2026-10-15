# 栄養自動処理：架空データのMCP接続テスト

2026-10-15。今回は「ChatGPTが専用ツールを呼び、下書きを保存して読み返す」までを検証する。実際の栄養値の計算、スマホ・Supabaseとの往復、食事合計への反映、朝昼夜の定期処理はまだ実装していない。

## 作成したもの

`tools/nutrition-mcp-demo/server.mjs`はNode.js標準機能だけで動く、限定したMCP stdioサーバー。外部パッケージの取得は不要。MCPの初期化・通知・ping・ツール一覧・ツール実行に対応する試作で、汎用MCPサーバーではない。本番用に展開する際は公式SDKと認証設計を別途検証する。

ツールは3個だけ。

- `get_demo_meal`：固定した架空の食事を取得する。
- `save_demo_draft`：同じ依頼ID・revision=1・nutrients=nullだけを下書き保存する。
- `get_demo_draft`：保存できたか読み返す。

実際の食材名・栄養値・自由な文章は受け付けない。SQL、ファイル操作、任意URLへのアクセス、Supabase接続、AI API呼出しの機能はない。下書きはプロセスのメモリ内だけに保持され、サーバー停止・再起動で消える。既存アプリの確定記録は変わらない。

## ローカルで確認する

PowerShellで次を実行する。

```powershell
cd C:\Users\user\dev\hypertrophy-navigator
node tests/nutrition-mcp.test.mjs
```

4件成功が期待結果。初期化・限定ツール・不正入力・重複送信・日本語の途中分割・サイズ制限からの復帰を、同じプロセス内のストリームで確認する。プロセス分離するNodeテストランナーは作業環境でspawn EPERMとなったため使っていない。制約を解除・迂回していない。ChatGPT・トンネル・ブラウザーはこのテストに含まれない。

単独起動は以下。コマンド実行後に文字が出ず待機するのは正常。標準出力はMCP通信専用。

```powershell
node tools/nutrition-mcp-demo/server.mjs
```

そのPCのブラウザーで `http://127.0.0.1:8790/` を開くと架空の食事と下書きの状態を見られる。保存後はページを更新する。単独起動したままトンネルから別プロセスも起動するとポートが競合するため、トンネル設定へ進む前にこのPowerShellでCtrl+Cを押して停止する。PC以外から表示できるページではない。

## ChatGPTから接続する：公式Secure MCP Tunnel

通常のServer URL欄にlocalhostやSupabaseのProject URLを入れても、このサーバーへの接続にはならない。今回はカスタムMCP追加画面に表示されていた「トンネル」を使う。[公式手順](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)

1. [OpenAI Platformのトンネル設定](https://platform.openai.com/settings/organization/tunnels)をユーザー自身で開きログインする。対象ChatGPTワークスペースへ関連付けたトンネルを作成・利用できるか確認する。画面に権限不足が出た場合、設定やセキュリティ制限を緩めず、その表示を確認する。機能の利用可否・料金はこの環境では未確認。
2. その公式画面から案内される`openai/tunnel-client`の配布物をユーザー自身で入手する。エージェントはダウンロードやインストールをしていない。
3. `tunnel-client help quickstart`で、入手したバージョンの設定方法を確認する。公式の接続認証はユーザー自身が設定する。キー・認証ファイルをチャット、Git、コマンド引数やログへ出さない。PCのアクセス制限を無効化して起動しない。
4. 公式手順のローカルstdioプロファイルを用いる。プロファイル名の例は`nutrition-demo`、MCP commandは以下。秘密情報は含まない。

```text
node C:/Users/user/dev/hypertrophy-navigator/tools/nutrition-mcp-demo/server.mjs
```

公式CLIに沿った設定例（TUNNEL_ID_FROM_YOUR_SCREENは画面のトンネルIDに自分で置き換える。認証の設定完了後に使用）：

```powershell
tunnel-client init --sample sample_mcp_stdio_local --profile nutrition-demo --tunnel-id TUNNEL_ID_FROM_YOUR_SCREEN --mcp-command "node C:/Users/user/dev/hypertrophy-navigator/tools/nutrition-mcp-demo/server.mjs"
tunnel-client doctor --profile nutrition-demo --explain
tunnel-client run --profile nutrition-demo
```

`doctor`等の出力を共有する場合は、キー・認証情報・アカウント情報がないことをユーザー自身で確認する。プロファイル/認証ファイルはこのリポジトリに置かず、エージェントに読ませない。トンネル稼働中はCLIを終了しない。CLIがサーバーを起動するため、別のPowerShellで同じサーバーを重ねて起動しない。

5. ChatGPTの「プラグイン → ＋ → カスタムMCPサーバーを作成」で設定する。
   - 名前：`栄養連携テスト`
   - 説明：`架空の食事を取得し、確認待ちの下書きを返す接続テスト`
   - 接続タイプ：`トンネル`
   - トンネル：自分が作成した対象を選択する。
   - この試作にはアプリ独自のOAuthは未実装。認証方法が選択可能なら、このダミー専用試作では「認証なし」を使用する。公開Server URLとしては使わない。公式トンネル側の利用者・ワークスペースのアクセス管理が別途必要。
   - OAuthが必須で変更できない、トンネルが出ない、権限がない場合はそのまま止める。実サービス用のキーを代わりに入力したり、制限を緩めたりしない。
6. 表示されるツールが上記3個だけと確認し、権限表示を確認した上で作成・インストールする。SQL実行・管理者権限の追加は不要。

トンネル・認証はこの作業環境から実行していない。カスタム追加画面が表示できることだけでは、トンネルも利用可能とは断言しない。利用できなければ、本番接続を急がず、認証付きサーバー方式等を別途検討する。

## Workで1回だけ往復する

新しいWorkチャットで`栄養連携テスト`プラグインを選び、以下を送る。

```text
栄養連携テストのプラグインを使って、架空データだけで接続確認してください。

1. get_demo_mealを呼ぶ。
2. 取得したidをrequestId、revisionをrevisionとして、nutrients:nullでsave_demo_draftを呼ぶ。
3. get_demo_draftを呼んで読み返す。
4. statusがawaiting_confirmationなら「架空データの読み取り・下書き保存・再読込が成功」と報告する。

必ず実際のツール呼出しで確認してください。ツールが使えない場合は成功とせず、使えなかった操作を報告してください。
栄養値を推測しないでください。本番アプリ、Supabase、実際の食事、体重、秘密ファイルは操作しないでください。
```

保存操作の確認が出た場合は、その1回のダミー下書き保存の対象を確認する。包括的な権限を付与する必要はない。

同じPCで `http://127.0.0.1:8790/` を開いて更新し、`draft.status`が`awaiting_confirmation`になったかを確認する。ChatGPTの文章だけでなくサーバーの保存状態も確認する。プロセス再起動時にnullへ戻るのは仕様。

成功後、同じプラグインと指示を選択した定期タスクで再試験する。手動チャットの成功と、定期タスクからの接続成功は別。朝昼夜の本運用は、スマホからの送信、本人認証、JSON検証、修正中の古い回答拒否、重複防止、確認後確定、停止時の再処理が揃ってから行う。

## 次段階

この接続確認後に、本人用の栄養計算キューと下書きの保存先をSupabaseへ追加し、スマホと同期する。Workには必要な食材・量・状態だけを渡し、結果の下書きだけを書かせる。アプリの既存ログインと、Work用連携の本人認証を区別して設計する。今回の認証なし・固定ダミーサーバーを実データ用へ転用しない。
