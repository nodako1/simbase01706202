# Sim Base

実在データと物理法則を、9:16の体感型ショート動画へ変換する自動生成システムです。

第1弾のSpace Engineでは、太陽を出発した光が各惑星の平均公転距離を通過し、冥王星軌道へ到達するまでを30秒動画として描画します。

## 現在の動画

**光速で太陽系を進むと、どこまで行ける？**

- 光速：299,792.458 km/s
- 出発地点：太陽
- 目的地：冥王星軌道
- 物理上の移動時間：約5時間28分
- 移動距離：約59億km
- 映像：1080×1920 / 30fps / 30秒

惑星は同時刻に一直線上へ並んでいるわけではないため、動画では各天体を太陽からの平均距離順に配置した体感モデルとして表現します。距離差が非常に大きいため、映像上の縮尺には対数表現を使用します。

## Space Engineの演出

- 星が流れる光速移動表現
- 太陽からの距離と経過時間をリアルタイム表示
- 各惑星の軌道通過時に自動減速
- 惑星ごとの大きさ、色、表面、土星の環をコード描画
- 地球到達約8分19秒、木星到達約43分などを表示
- 対数距離レールで太陽系の巨大さを可視化
- 冒頭と結果画面を含む自動編集
- 動画タイトルをそのままMP4ファイル名へ反映

## 使用データ

惑星の平均距離と直径にはNASAの公開ファクトシートで案内されている丸め値を使用しています。

主要データは`scripts/space/solar-system.ts`に集約しています。

## GitHub Actionsで動画を自動生成する

`main`ブランチへpushすると、次の処理が自動実行されます。

1. Node.jsとFFmpegを準備
2. Webアプリをビルド
3. Space Engineで450枚のPNGフレームを生成
4. FFmpegで1080×1920・30fpsのMP4へ変換
5. 出力フォルダに完成MP4が1本だけ存在することを検証
6. GitHub ActionsのArtifactへ完成動画だけを保存

生成された動画はGitHubの`Actions`タブから対象の実行結果を開き、`Artifacts`の`sim-base-video-実行番号`からダウンロードできます。

保存期間は14日です。

## 動画設定

[`video.config.json`](video.config.json)を編集します。

```json
{
  "mode": "light_speed_solar_system",
  "space": {
    "title": "光速で太陽系を進むと、どこまで行ける？",
    "destination": "pluto"
  },
  "video": {
    "durationSeconds": 30,
    "introSeconds": 2.4,
    "resultSeconds": 3.2,
    "sourceFps": 15,
    "outputFps": 30,
    "renderWidth": 540,
    "renderHeight": 960,
    "finalWidth": 1080,
    "finalHeight": 1920
  }
}
```

`destination`には`mercury`、`venus`、`earth`、`mars`、`jupiter`、`saturn`、`uranus`、`neptune`、`pluto`を指定できます。

## ローカル生成

Node.js 20以上とFFmpegが必要です。

```bash
npm install
npm run generate:video
```

生成物は`output`ディレクトリ内の完成MP4だけです。

## ファイル構成

```text
scripts/
├── generate-space-video.ts       # Space Engine動画生成
├── space/
│   ├── solar-system.ts           # 天体データと単位変換
│   └── space-renderer.ts         # 宇宙・惑星・UI描画
├── generate-video-auto.ts        # 旧サバイバル動画生成入口
└── quality/                      # 旧サバイバル演出エンジン
```

旧「100人の生存競争」エンジンは削除せず、次のコマンドで生成できます。

```bash
npm run generate:video:survival
```

## 次の拡張候補

- 地球から観測可能な宇宙まで連続ズーム
- 太陽系を実際の縮尺で並べる比較動画
- 光速と宇宙船速度の比較
- 月、太陽、銀河までの通信遅延
- PLATEAUを使った渋谷3Dシミュレーション
