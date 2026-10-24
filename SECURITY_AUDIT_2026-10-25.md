# セキュリティ確認（2026-10-25、日本時間）

## 確認結果

- GitHub公開リポジトリ `Gitorix/tetris--manager` と公開サイトを確認。
- 現在の作業ファイル、取得した全ブランチから到達できる過去のファイル、公開用ビルドで、検査対象形式のAPIキー・秘密鍵・個人メールアドレスの検出なし。
- `npm audit` の既知脆弱性は全深刻度で0件。Vite 8.3.5を使用。
- GitHubの未解決Secret scanning / Dependabot / CodeQL警告は各0件。
- Secret scanningとPush protectionは有効。Dependabot通知・脆弱性自動修正も有効化。
- GitHubプロフィールAPIの公開メール欄は空。ブラウザのアカウント設定で「メール非公開」「メール露出Push拒否」がともに有効であることも確認。
- このゲームにはメール入力・ログイン・外部API送信・利用者DBがなく、設定・進捗はブラウザに保存される。

## 今回の追加対策

- 作業ファイルに加えてGitの過去のファイルと公開用ビルドも継続検査。
- 個人メール、秘密情報を含むファイル名、追加のキー形式・認証情報の直接代入を検出。検出値はログに出さない。
- ステージ済みの内容とコミット時のnoreply設定を検査するローカルフック。
- 漏えいの再発・過去ファイル削除による見逃しを再現する回帰テスト7件。
- 本番HTMLのCSPを `connect-src 'none'` に制限。
- ローカル本番ビルドのタイトル・現場選択・ゲーム開始・停止・再開を確認。ブラウザの警告・エラーなし。

## 履歴置換完了・旧コミットの保存データは残存

過去43件のコミットの作成者・コミッターに残っていたGmailアドレスを、
ユーザー承認後、GitHub noreplyへ置換した。アドレス自体はこの文書に記載しない。
主ブランチとDependabotの6ブランチ、計7ブランチへ条件付きatomic pushで反映。
確認中のDependabot更新も保持し、全ブランチのファイルツリーが同一と検証した。
置換時点の到達可能な51コミットを検査し、個人メールの作成者・コミッター情報は0件。
GitHubの12件のPR参照（head/merge）も取得し、到達する57コミットで個人メール0件を確認。
現在のGit設定とGitHubアカウントのメール保護設定も有効。

履歴書き換えによって51件のコミットIDが変わり、Dependabotの6件の署名は除去された。
以降の履歴検査はコミットメタデータも対象にし、個人メールの再導入を拒否する。
旧コミットIDを指定した公開APIでは、個人メールのメタデータがまだ取得できることを確認した。
通常のブランチ・PR参照の置換だけではGitHub側の旧オブジェクトを消せない。
GitHub Supportへの削除相談文をローカルに準備した。外部送信は未実施。
GitHubのポリシー上、メール情報だけの削除相談が受理される保証はない。
過去のコピー・フォークから完全に消せるとは保証できない。
他の手元コピーがあれば、古い履歴をPushせず、新しくcloneして使用する。
メールアドレスが公開されていた事実だけで、メールアカウントへの不正アクセスを意味するものではない。

## 確認の限界

検査対象はこのリポジトリ、取得可能な履歴、公開成果物、GitHub警告。
別リポジトリ、削除済みの到達不能オブジェクト、第三者の複製、メール事業者のログは対象外。
パターン検査で任意の秘密情報の不存在は証明できない。
APIキーが見つかった場合は提供元で失効・再発行する。コードから削除するだけでは不十分。

## 公式情報

- https://docs.github.com/en/code-security/tutorials/remediate-leaked-secrets/remediating-a-leaked-secret
- https://docs.github.com/en/account-and-profile/concepts/email-addresses
- https://docs.github.com/en/account-and-profile/how-tos/email-preferences/blocking-command-line-pushes-that-expose-your-personal-email-address
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://vite.dev/releases
