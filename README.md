# Sampler

MPC2000 へのオマージュを込めた、ブラウザで動くシンプルなサンプラーアプリです。

## 実装済みの基本機能

1. **サンプリング**
   - マイク録音（MediaRecorder）
   - 音声ファイル取り込み（`audio/*`）
2. **再生**
   - 9つのパッドにサンプルを割り当て
   - パッドクリック／キーボード 1〜9 で再生
   - パッド音源の消去（Clear Pad / Delete / Backspace）
3. **エフェクト**
   - PitchShifter（ピッチのみ変更・テンポ維持のグラニュラー処理）
   - TempoShifter（ピッチ維持でテンポのみ変更）
   - Reverb（Convolver）
   - Delay（Delay + Feedback）
4. **カット編集（波形表示）**
   - 波形を見ながら Start/End スライダーで任意区間を直感的に指定
   - 選択区間はハイライト表示され、`Apply Trim` でその範囲をトリミング

## 使い方

1. `index.html` をブラウザで開く
2. `● Record` ボタンを押して録音開始（同じボタンが `■ Stop` に切り替わるので再押下で終了）、または `Load Audio` で音声を読み込み
3. パッドをクリック（またはキーボード 1〜9）して再生
4. Pitch / Reverb / Delay を調整
5. 波形と Start / End を確認し `Apply Trim` で音源をトリミング
6. パッドの音を消したい場合は `Clear Pad`（または Delete / Backspace）を実行

## 注意

- 初回録音時はマイク権限が必要です。
- ピッチ変更はリアルタイムの簡易実装で、厳密なフォルマント保持は行っていません。

## デプロイ時の404対策

Vercel などの静的ホスティングで直接URLアクセスした際の `404: NOT_FOUND` を防ぐため、`vercel.json` で全ルートを `index.html` にリライトしています。
