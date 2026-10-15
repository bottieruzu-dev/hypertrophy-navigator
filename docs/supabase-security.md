# 筋トレテーブルの公開アクセスへの応急対応

Security Advisorの画像で、`sets`、`body_metrics`、`exercises`、`muscle_credits`、`baselines`、`sessions`、`nutrition_logs`のRLS未設定が確認された。これらは本アプリが使うテーブル名と一致する。機密列の警告がある`sets`の具体的な列名は画像から分からない。データ流出の有無は未確認。

## 今すぐ行う対応

操作するSupabaseプロジェクトは、警告が表示されているものをユーザー自身が確認する。エージェントは秘密ファイル・実データを読んでおらず、クラウドへ接続・SQL実行していない。

1. 急ぎでRESTからのアクセスを全体的に止める必要がある場合は、DashboardのData API integrationで`Enable Data API`をOFFにする。同じプロジェクトを使う他のアプリもRESTのクラウド読書が停止する。[公式手順](https://supabase.com/docs/guides/api/securing-your-api#disable-the-data-api)
2. SQL Editorで[lockdown-training-tables.sql](../supabase/security/lockdown-training-tables.sql)の全文を実行する。対象は画像にある7テーブルだけ。RLSを有効化し、通常クライアントのテーブル権限を取り消し、既存の全件許可ポリシーや列単位の権限があっても行操作を拒否する制限ポリシーを付ける。
3. [verify-training-lockdown.sql](../supabase/security/verify-training-lockdown.sql)を実行する。実データを読むものではなく、設定のメタデータだけを確認する。
4. 7行すべてで`rls_enabled`、`restrictive_lockdown`、`applies_to_public`がtrue、`read_condition`と`write_condition`がfalse、`anon_table_select`と`authenticated_table_select`がfalseになっていることを確認する。NULLや異なる結果がある場合は、再開せず設定を調べる。
5. Security Advisorを更新し、残った警告も確認する。スクリーンショットを共有する場合はテーブルの内容やキーを含めない。

SQLは既存の行を読まず、更新・削除しない。対象テーブルが存在しない場合はトランザクション全体を取り消す。既存ポリシーは本対応専用の名前のものを除いて削除しない。反復実行可能。

これは通常APIクライアントの7テーブルに対する応急遮断であり、プロジェクト全体の安全性を保証する監査ではない。`service_role`や特権所有者はRLSを迂回できる。所有者権限のビューや`SECURITY DEFINER`関数などによる別経路も確認が必要。Data APIの停止は別製品・直接DB接続・特権キーの流出まで解決するものではない。必要に応じてログの保存と不審な読書・変更の調査を行う。キーの交換だけでRLS未設定を解決したことにはならない。

## 本人だけの同期を復旧する手順

ユーザーが共有した列・主キー構造では、7テーブルに所有者列や外部キーは存在しなかった。既存の主キーを保持し、本アプリを**管理者が指定した1人専用**として復旧する。家計簿など同じプロジェクトの別テーブル・別Auth利用者には権限を追加しない。複数人対応に流用しない。

1. Supabase Dashboard → Authentication → Usersで、自分用のメールアドレス・パスワードのAuthユーザーを作る。管理画面のログインとは別。メール確認済みのユーザーを使う。パスワードやキーをエージェントに共有しない。
2. そのAuthユーザーのUUIDをユーザー自身が控える。対象5個人テーブルの既存記録がすべて自分のものと確認する。他人の記録があれば次のSQLは実行しない。
3. [restore-owner-sync.sql](../supabase/security/restore-owner-sync.sql)全文をSQL Editorに貼る。`owner_id`のゼロUUIDを自分のAuthユーザーUUIDへ、`legacy_rows_are_mine`を確認後に`true`へ変更して全文実行する。実UUID入りのSQLはGitに保存しない。RLSを無効化する操作は不要。失敗した場合はトランザクションが取り消され、応急遮断が残る。
4. [verify-owner-sync.sql](../supabase/security/verify-owner-sync.sql)全文を実行する。7行すべてでRLS・restrictive_owner_guard・owner_access_policyがtrue、emergency_lockdown_remaining・anon_selectがfalse。authenticated_selectはtrue。5個人テーブルはowner_columnとauthenticated_insert/update/deleteもtrue。exercises/muscle_creditsはowner_columnとinsert/update/deleteがfalse。関数はsecurity_definer=true、search_pathが空、anon_execute=false、authenticated_execute=true。exactly_one_registered_owner=true。セット関連付けのconvalidated=falseは既存の孤立行を消さず保つための意図した設定で、新規書込には制約が働く。
5. [test-owner-isolation.sql](../supabase/security/test-owner-isolation.sql)でダミーデータのSELECT/INSERT/UPDATE/DELETEを確認する。全文を一括実行し、最後のROLLBACKまで実行する。本人の個人記録は操作可能、カタログは読取のみ、別利用者と匿名は操作不可が期待結果。失敗したら`ROLLBACK;`を実行し、応急のlockdown-training-tables.sqlを再実行して結果を確認する。解決するまで同期を再開しない。実データやAuth UUIDは結果に出さない。
6. Security Advisorを更新して残る警告を確認する。上記テーブルのRLSだけで、ビューや別のSECURITY DEFINER関数、特権キー経路の安全性まで保証しない。Data APIを全体停止した場合は、設定と検証後にユーザー自身が有効へ戻す。同じプロジェクトの別アプリへの影響も確認する。
7. このコードを通常の公開設定でビルド・公開する。フロントエンドのキーはpublishableまたは旧anonキーのみ。service_role/secretキーは使用禁止。この作業では設定・秘密ファイルは読んでいない。`scripts/build-safe.mjs`はクラウド設定を空にするローカル検証用なので、その成果物をクラウド対応の公開版として使わない。
8. アプリ上部「クラウド設定」でログインし、端末内の記録が自分のものというチェックを入れて「この端末の所有者を登録」。その後「クラウドのWeek0を読込」または「端末の履歴を送信」を使う。Week0のやり直しは不要。

SQLは個人テーブルにuser_idを追加し既存行へ指定所有者を設定する。行や既存主キーは削除しない。すでに別所有者へ割当済みなら中止する。種目・筋肉クレジットは本人も読取専用。既存の他の許可ポリシーがあっても、追加するrestrictiveポリシーで本人限定を強制する。関数は所有者として実行するが、固定した空のsearch_pathを使い、現在の利用者が許可済みかという真偽値だけを返す。

コードはgetUserでサーバー確認し、所有者限定RPCのtrueと端末のアカウント・接続先の一致を確認してから各データ操作を行う。未適用・未ログイン・未登録・ネットワーク障害時は個人テーブルへの操作を行わず、端末記録と送信待ちを残す。別アカウントへの切替時に端末の記録を自動割当しない。日時calibrated_atは既存int8列に合わせミリ秒の整数で送る。

筋トレとWeek0は保存時に送信を試み、失敗時は「再送」で送れる。体組成・旧栄養ログの送信は「端末の履歴を送信」で行う。この操作は同じ主キーのクラウド値を端末値で更新するため、端末とクラウドのバックアップを確保して使う。複数端末の競合解決やクラウド筋トレ履歴の一括復元は未対応。手動で追加した食事・食材辞書・栄養プロフィール設定は端末保存と栄養バックアップを使う。追加実装のWork経由の依頼・下書き・確定食事の同期は、別の[栄養Work連携の適用手順](nutrition-work.md)を参照する。

## 今後の拡張で必要な対応

- Supabase Authによるログインと、端末・クラウドの利用者の対応を整備する。
- 個人記録に所有者を設定し、SELECT/INSERT/UPDATE/DELETEの各操作を本人だけに制限する。別のログイン利用者全員にアクセスを許可しない。
- 既存の行を誰のものか確認して移行する。最初にログインした人へ全行を自動付与しない。
- baseline/date等の既存一意キーとupsertの競合指定を利用者ごとに見直す。セッションとセットの所有者が一致する制約も必要。
- 種目と筋肉クレジットは共有カタログとして個人記録と分ける。必要なら読取だけを許可し、一般利用者からの更新を許可しない。
- ビュー、関数、権限、機密列の露出も確認する。公開コードやブラウザーへ特権キーを入れない。
- ダミーデータで未ログイン、所有者、別利用者の許可・拒否を各操作について検証する。
- 複数利用者に拡張する場合は、所有者別の複合主キーとupsert指定・関連付けへ移行する。現在の単一所有者登録をそのまま複数人へ解放しない。

根拠：[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[列単位のアクセス制限](https://supabase.com/docs/guides/database/postgres/column-level-security)。

## 検証の区別

ローカルの54テストは成功（筋トレ34、栄養16、接続ポリシー4）。型チェックも成功。クラウドSQLとダミー分離テストは準備・レビューまでで、Postgres上の実行や実際の公開アクセスの拒否は未確認。接続用のブラウザーも利用できず、UI操作・ログイン・公開版の確認は未実施。既存の応急遮断についてはユーザーのスクリーンショットでRLSと拒否ポリシー、anon SELECTの停止を確認した。同期の復旧完了や全警告の解消はまだ断言しない。
