# Sim Base

**100人のミニチュア世界実験室**を実行し、9:16のショート動画を自動生成するシステムです。

ブラウザ上での手動実行に加えて、`main`ブランチへpushするとGitHub Actionsが自動でMP4を生成します。

## 主な機能

- 2D世界に最大300人の住民を自動配置
- 住民が食料を探索・摂取し、空腹になると死亡
- 最大8チームの色分けと生存人数集計
- 「沈む島」特殊ルール
- シード値による再現可能なシミュレーション
- 9:16（1080×1920）のMP4自動生成
- シナリオ条件から動画タイトルを自動生成
- 自動タイトルを動画内表示・MP4メタデータ・ファイル名へ反映
- GitHub ActionsのArtifactには完成動画1本だけを保存

## GitHub Actionsで動画を自動生成する

`video.config.json`の条件を編集して`main`へpushすると、次の処理が自動実行されます。

1. Node.js依存関係をインストール
2. TypeScriptとViteのビルドを実行
3. 人数・食料量・特殊ルール・チーム数から動画タイトルを決定
4. シミュレーションをヘッドレス実行
5. PNGフレームを生成
6. FFmpegで1080×1920・30fpsのMP4へ変換
7. 自動生成タイトルをファイル名にした完成MP4だけをArtifactへ保存

生成された動画は、GitHubの`Actions`タブから対象の実行結果を開き、ページ下部の`Artifacts`にある`sim-base-video-実行番号`をダウンロードしてください。

動画Artifactの保存期間は14日です。

## 動画条件の変更

[`video.config.json`](video.config.json)を編集します。タイトルとファイル名の指定は不要です。

```json
{
  "scenario": {
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
    "finalHeight": 1920
  }
}
```

タイトルは、数字・異常条件・結果への疑問を組み合わせたテンプレートから自動生成されます。

例：

```text
100人を沈み続ける島に放置した結果….mp4
100人に食料20個だけ与えた結果….mp4
4チーム100人、最後まで生き残るのはどこ？.mp4
```

`sourceFps`と`renderWidth`を低めにすることで、GitHub Actions上での生成負荷を抑えています。完成するMP4は`finalWidth`と`finalHeight`へ高品質に拡大されます。

## 手動でActionsを実行する

GitHubの`Actions`タブで`Build and Generate Video`を選択し、`Run workflow`から手動実行できます。

## ローカルでMP4を生成する

Node.js 20以上とFFmpegが必要です。

```bash
npm install
npm run generate:video
```

生成物は`output`ディレクトリ内の完成MP4だけです。

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

## 現在のシミュレーション仕様

- 勝利条件：制限tick終了時に最も多く生存しているチーム
- 終了条件：制限tick到達、全滅、または勝利条件に応じた1チーム残存
- 住民AI：空腹時は視界内の最寄り食料へ移動、それ以外はランダム移動
- 沈む島：時間経過で安全圏が縮小し、圏外では空腹消費が増加

## 完成度向上ロードマップ

1. **見やすさ**：住民の輪郭・移動軌跡・危険表示・イベント字幕を強化
2. **ドラマ性**：個体差、戦闘、協力、裏切り、英雄個体を追加
3. **編集演出**：重要事件への自動ズーム、速度変化、リプレイを追加
4. **音響**：BGM、効果音、イベント音、結果発表音を自動合成
5. **企画量産**：災害、怪物、中央食料、強者1人などのルールをプラグイン化
6. **品質選別**：複数回シミュレーションし、展開が面白い試行だけを動画化
7. **運用最適化**：タイトル候補生成、投稿データ分析、勝ちパターンへの自動寄せ
