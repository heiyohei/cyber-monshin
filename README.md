# cyber-monshin
病院のサイバー問診アシスタント ― その「はい」、本当に大丈夫？（Built with Claude: Japan 2026）

## 利用しているデザイン

色、文字、角丸は [@digital-go-jp/tailwind-theme-plugin](https://github.com/digital-go-jp/tailwind-theme-plugin)（MIT License、Copyright (c) 2023 デジタル庁）を使っています。画面の部品は、[デジタル庁デザインシステム](https://design.digital.go.jp/dads/)の説明を参考に、このプロジェクトで書いたものです。デジタル庁が作成、提供するものではありません。

## 環境変数

| 名前 | 内容 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude API のキー。サーバーだけで使う |
| `ACCESS_CODE` | 検証中の合言葉。本番で未設定なら API はすべて止まる |
| `SESSION_SECRET` | 履歴の署名に使う32文字以上の文字列。`openssl rand -hex 32` で作る。本番で未設定なら API はすべて止まる |

ローカルでは `.env` に書く。`ACCESS_CODE` がなければ合言葉なしで動く。
