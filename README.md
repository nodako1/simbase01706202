# Sim Base

**100人のミニチュア世界実験室**を実行し、9:16のショート動画を自動生成するMVPです。

ブラウザ上での手動実行に加えて、`main`ブランチへpushするとGitHub Actionsが自動でMP4を生成します。

## 主な機能

- 2D世界に最大300人の住民を自動配置
- 住民が食料を探索・摂取し、空腹になると死亡
- 最大8チームの色分けと生存人数集計
- 「沈む島」特殊ルール
- シード値による再現可能なシミュレーション
- 9:16（1080×1920）の動画生成
- ブラウザからのWebM録画
- GitHub ActionsからのMP4自動生成
- 実験条件をJSONで変更可能

## GitHub Actionsで動画を自動生成する

`video.config.json`の条件を編集して`main`へpushすると、次の処理が自動実行されます。

1. Node.js依存関係をインストール
2. TypeScriptとViteのビルドを実行
3. シミュレーションをヘッドレス実行
4. PNGフレームを生成
5. FFmpegで1080×1920・30fpsのMP4へ変換
6. MP4と実験結果JSONをGitHub ActionsのArtifactへ保存

生成された動画は、GitHubの`Actions`タブから対象の実行結果を開き、ページ下部の`Artifacts`にある`sim-base-video-実行番号`をダウンロードしてください。

動画Artifactの保存期間は14日です。

### 動画条件の変更

[`video.config.json`](video.config.json)を編集します。

```json
{
  "scenario": {
    "title": "100人を沈む島に放ったらどうなる？",
    "population": 100,
    "teams": 4,
    "foodCount": 80,
    "simulationTicks": 1200,
    "specialRule": "sinking_island",
    "seed": 20260711
  },
  "video": {
    "durationSeconds": 30,
    "introSeconds": 2,
    "resultSeconds": 3,
    "sourceFps": 15,
    "outputFps": 30,
    "renderWidth": 540,
    "renderHeight": 960,
    "finalWidth": 1080,
    "finalHeight": 1920,
    "fileName": "sim-base.mp4"
  }
}
```

`sourceFps`と`renderWidth`を低めにすることで、GitHub Actions上での生成負荷を抑えています。完成するMP4は`finalWidth`と`finalHeight`へ高品質に拡大されます。

### 手動でActionsを実行する

GitHubの`Actions`タブで`Build and Generate Video`を選択し、`Run workflow`から手動実行できます。

## ローカルでMP4を生成する

Node.js 20以上とFFmpegが必要です。

```bash
npm install
npm run generate:video
```

生成物は次の場所に保存されます。

```text
output/sim-base.mp4
output/simulation-summary.json
```

## ブラウザ版の起動

```bash
npm install
npm run dev
```

表示されたローカルURLをChromeまたはEdgeで開いてください。

## 本番ビルド

```bash
npm run build
npm run preview
```

## ブラウザ版の操作

1. 左側で実験条件を設定します。
2. `RESET`で設定を反映します。
3. `START`でシミュレーションを開始します。
4. 動画化する場合は`録画開始`を押します。
5. `録画停止・保存`を押すとWebMが保存されます。

## MVP仕様

- 勝利条件：制限tick終了時に最も多く生存しているチーム
- 終了条件：制限tick到達、全滅、または勝利条件に応じた1チーム残存
- 住民AI：空腹時は視界内の最寄り食料へ移動、それ以外はランダム移動
- 沈む島：時間経過で安全圏が縮小し、圏外では空腹消費が増加

## 今後の拡張候補

- 複数シナリオの一括動画生成
- 戦闘・協力・性格・能力値
- 建築と拠点形成
- 災害・怪物・夜間イベント
- 音声・効果音・BGMの自動合成
- YouTube Shortsへの自動投稿
