# 日別メニューへの更新

## 保存済みWeek0の扱い

データベース名と既存のテーブルは維持し、version 2で日別メニューの保存先だけを追加しました。測定値から完了状態を再判定するため、古い完了フラグだけを理由に再測定を要求しません。有効な測定は継続利用し、未測定・不正な値の種目だけを省略します。実際のユーザーの記録は開いていません。

同じ端末・ブラウザー・公開URLで利用してください。別のURLや別のブラウザーにはIndexedDBの記録が共有されません。「筋トレ記録のバックアップ」から先にJSONを保存できます。対象はWeek0・セッション・セット・日別メニューで、栄養・体組成は含みません。復元は競合時に全体を取り消し、既存履歴を削除しません。

## 毎日の使い方

1. 「今日のメニュー」で使える時間、疲労感、強い筋肉痛、痛みを入力する。
2. 種目、重量、回数、セット数、余力の目標、休憩時間を確認して開始する。
3. 最初の重い種目は軽い重量で動きを確認し、準備セットとして記録する。
4. 本番は実際の重量・回数・RIRを保存する。ダンベルは片手分、プレート式はWeek0と同じ数え方で入力する。
5. 間違えた場合は種目を選び直し、今回の記録の「修正」を使う。セッション終了後の修正は対応していない。
6. 器具が空いていなければ測定済みの代替種目へ交換する。記録後は交換せずスキップする。
7. 「完了して保存」で次回の負荷調整に反映する。途中終了でも実施した記録は残る。

開始済みのメニューと休憩の終了時刻は端末に保存し、再読込後も復帰します。本番ビルドは初回のオンライン読込後、画面と公開画像をキャッシュします。開発サーバーではこのキャッシュを使いません。端末の容量不足・ブラウザーのデータ消去・プライベートモードに対する保存保証はありません。

## 提案のルール

- 上半身A → 下半身 → 上半身Bの実施履歴を起点に、測定済み種目と直近の刺激から部位を選ぶ。手動選択も可能。
- 同じ役割の候補は1種目だけ選ぶ。全Week0種目を一日に並べない。
- 週間の直接・間接セットを加算し、既存の優先部位、週間上限、時間を考慮する。短い日は主運動を確保し、肩・二頭筋などの優先部位へ時間を配分する。
- 未測定、利用不可、禁止種目、強い筋肉痛や直近の負荷がある種目は省略する。痛みを選ぶと筋トレメニューを提示しない。
- 初回はWeek0重量を基本とし、余力が少なかった場合は軽くする。以後は完了した種目の最も弱いセットを基準に、十分な余力で上限回数に到達した場合だけ1段階増やす。粗い重量刻みは無理に増やさない。
- 疲れ気味の日は重量とセット数を減らしRIR 3を目標にする。RIRは「あと何回できそうか」の自己申告で、精密な回復測定ではない。

固定ルールによる提案であり、生理学的な最適解を保証する仕組みではありません。機種固有の座席・軸・重量表示は器具の表示やスタッフの案内を優先してください。

## トレーナーと画像

37種目すべての説明を、準備・動作・戻し方・よくある失敗の4段階に書き直しました。一般的なフォーム、呼吸、痛みへの対応は[Mayo Clinicの筋トレの基本](https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/weight-training/art-20045842)を参照しています。この資料が37種目それぞれの機種設定を検証しているという意味ではありません。

人体画像は組み込みimagegenで生成した人工の解剖模型です。[画像](../public/muscle-anatomy.png)を`BodyAnatomy`に組み込み、主働筋・補助筋の色を重ねています。前面・背面を拡大できます。細かな筋頭と深層筋の区別はラベルで補足する概略表示です。臀部はショーツに隠れるため位置表示になります。

生成プロンプト（画像のみを生成し、記録や個人情報は送っていません）:

> Create a polished realistic fitness educational illustration for a muscle training app: two full-length adult anatomical teaching mannequins side by side, front view on left, back view on right. These are clearly artificial medical classroom models, rendered in matte muted terracotta with detailed external skeletal muscle fiber patterns and ivory tendon accents. Both wear opaque charcoal athletic shorts covering hips, pelvis, gluteal region and upper third of thighs. No exposed private body parts. Upright neutral pose, hands slightly away from torso, natural proportions, matching scale, full feet visible. Clear chest, shoulder, arm, abdominal, back, thigh and calf muscle modeling. Not a real person or photograph; clean non-graphic 3D product illustration of artificial models, no blood or injuries. Solid pale ivory background #f5f2eb. Wide 3:2 composition: front mannequin centered at 25% width, rear mannequin at 75%; heads at 4% height and feet at 96%. Soft studio lighting, premium textbook aesthetic. No text, no labels, no arrows, no watermark.

## 同期と検証の限界

クラウドが未設定でも端末保存を継続します。送信待ちを永続化し、失敗時は保持して「再送」できます。Week0のクラウド読込は明示操作だけで、新しい端末記録や未送信記録を古いクラウド値で上書きしません。クラウドから全セッションを復元する機能は追加していません。別端末への移行にはバックアップを使用してください。

ユーザーの認証情報・実データは使っておらず、Supabaseの列定義、RLS、bigintのID受入、実際の通信成功は未検証です。送信待ちが0件でもクラウドに全履歴が存在することの保証ではありません。

自動テスト34件と、生成したサービスワーカーの4件を実行し、型チェックと検証用ビルドを確認しました。ブラウザーが利用できないため、`tests/ui.html`の実IndexedDB移行テストと画面・スマートフォン操作は未実行です。この隔離テストは`HypertrophyNavigatorTestDB`だけを使い、ダミーWeek0で旧version 1からの更新、保存、再開、修正、バックアップの取り消しを確認します。

公開先への更新は実施していません。外部通信の制限を解除せず、ソースと確認手順をローカルに残しています。`build:safe`の出力はクラウド設定を含まない検証専用なので、そのまま既存クラウド運用の公開物に使わないでください。

公開後の確認は同じ公開URLで、バックアップ保存 → Week0の測定数確認 → メニュー開始 → 準備と本番セット → 修正 → 再読込で再開 → 完了 → 次回提案、の順です。オフライン起動と、オンライン復帰後の送信待ち解消も端末で確認してください。

## ベンチプレスと自重種目の追加調整

ハンギングレッグレイズは自重で、Week0でも本番でも重量入力は不要です。旧記録に重量があっても提案重量は0とし、既存の記録自体は自動で書き換えません。

上半身Bはバーベルベンチプレスから提案します。未測定の場合は、ユーザーが申告した50kg（バーとプレートの合計）・10回・3セットを開始基準にします。この基準は測定済みWeek0として保存せず「申告された開始基準」と表示します。保存済みの有効な測定値があればそちらを優先します。実績が残った後は通常の負荷調整を適用します。時間・週間負荷・疲労によってセット数を減らす場合があり、筋肉痛・直近の刺激・痛みがある場合は省略します。Week0で正式に保存する際は実際のRIRを入力してください。
