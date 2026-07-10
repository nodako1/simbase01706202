# Video Pipeline

`main`ブランチへのpushを契機に、GitHub Actionsが次の処理を実行します。

1. Webアプリをビルド
2. `video.config.json`を読み込み
3. 設定tick到達・全滅・勝利条件成立のいずれかまでシミュレーションを実行
4. 9:16のPNGフレームを生成
5. FFmpegで1080×1920・30fpsのMP4へ変換
6. `sim-base.mp4`と`simulation-summary.json`をArtifactへ保存

`simulation-summary.json`の`result.tick`、`survivors`、`winnerTeam`、`events`から、シミュレーションが正常な終了条件まで進行したことを確認できます。
