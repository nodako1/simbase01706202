# Video Pipeline

`main`ブランチへのpushを契機に、GitHub Actionsが次の処理を実行します。

1. Webアプリをビルド
2. `video.config.json`を読み込み
3. シミュレーションを最後のtickまで実行
4. 9:16のPNGフレームを生成
5. FFmpegで1080×1920・30fpsのMP4へ変換
6. `sim-base.mp4`と`simulation-summary.json`をArtifactへ保存

`simulation-summary.json`の`result.tick`が設定した`simulationTicks`へ到達していることを、動画生成処理の動作確認に使用できます。
