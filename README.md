# テトリスの管理人

「テトリスの管理人」は、プレイヤーがテトリスを直接操作するのではなく、世界ランカーAIへブロックを供給し、在庫・補充・管理力を管理するブラウザゲームです。

現在はβ版として、1ステージ「新人管理人研修①」を実装しています。

## 現在の主な機能

- 10×20盤面のテトリス表示
- SafeAIによる自動配置
- I / O / T / L / J / S / Z の7種類のブロック供給
- 在庫管理と5手ごとの補充便
- 管理力ゲージ、評価フィードバック、管理力消費スキル
- ステージクリア、ゲームオーバー、研修レポート
- ミストン、ミントン、アストンのキャラクターリアクション
- タイトル画面、記録保存、セーブデータ初期化
- PC、スマートフォン縦画面、スマートフォン横画面向けのレスポンシブUI

## 技術構成

- Vite
- TypeScript
- HTML / CSS
- localStorage

## 必要環境

- Node.js 20以上推奨
- npm

## セットアップ

```bash
npm install
```

## 開発サーバー

```bash
npm run dev
```

起動後、ターミナルに表示されたURLをブラウザで開きます。

通常は以下です。

```text
http://127.0.0.1:5173/
```

ポートが使用中の場合は、Viteが別のポートを自動で使用します。

## 本番ビルド

```bash
npm run build
```

ビルド成果物は `dist/` に生成されます。

## 本番ビルドの確認

```bash
npm run preview
```

## Vercelへデプロイする手順

このプロジェクトはViteの静的サイトとしてVercelへデプロイできます。

### GitHub連携でデプロイする場合

1. GitHubに新しいリポジトリを作成します。
2. このプロジェクトをGitHubへPushします。
3. Vercelで「Add New Project」からGitHubリポジトリを選択します。
4. Framework Presetは `Vite` を選択します。
5. Build Commandは以下を指定します。

```bash
npm run build
```

6. Output Directoryは以下を指定します。

```text
dist
```

7. Deployを実行します。

### Vercel CLIでデプロイする場合

```bash
npm install -g vercel
vercel login
vercel
```

本番公開する場合は以下を実行します。

```bash
vercel --prod
```

## GitHubへPushする例

リポジトリURLは自分のGitHubリポジトリに置き換えてください。

```bash
git remote add origin https://github.com/<user>/<repo>.git
git branch -M main
git add .
git commit -m "Initial beta build"
git push -u origin main
```

## Vercel向け設定

`vercel.json` でSPA用のリライトを設定しています。

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

これにより、将来ルーティングを追加した場合もVercel上で直接URLを開きやすくなります。

## GitHub Pagesで公開する場合

GitHub Pagesで公開する場合も静的サイトとして公開できます。

リポジトリ名がURLのサブパスになる場合は、`vite.config.ts` に `base` を追加してください。

例：リポジトリ名が `tetris-manager` の場合

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/tetris-manager/",
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

独自ドメインやルートドメインで公開する場合は、`base` の追加は不要です。

## 注意

- `dist/` はビルド生成物のためGit管理対象外です。
- `node_modules/` はGit管理対象外です。
- セーブデータはブラウザのlocalStorageに保存されます。
