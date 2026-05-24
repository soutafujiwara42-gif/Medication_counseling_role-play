# 服薬指導ロープレ練習エージェント

薬剤師向けの服薬指導ロールプレイ練習ツールです。  
Claude AI が患者役を演じ、音声・テキスト両対応で実践的なトレーニングができます。

## 機能

- **処方薬登録**: 薬価基準収載品目リスト（13,154件）から品名を部分一致検索して登録
- **患者の性格選択**: 「話好き」「無口」「代理」から選択
- **音声入力/出力**: ブラウザの Web Speech API（日本語）
- **アニメーションアバター**: 待機/聞いている/話している/考え中の4状態
- **接続中モデル表示**: ヘッダーに使用 Claude モデルを常時表示

## セットアップ

### 1. 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 2. 薬剤データの準備

```bash
python prepare_data.py
```

> Excel ファイル（`tp20250319-01_01〜03.xlsx`）から `data/drugs.csv` を生成します。  
> Render にデプロイする前に必ず実行してください（CSV はリポジトリに含めます）。

### 3. 環境変数の設定

```bash
# .env ファイルを作成
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. ローカル起動

```bash
uvicorn main:app --reload --port 8000
```

ブラウザで `http://localhost:8000` を開く。

## Render へのデプロイ

1. このリポジトリを GitHub に push
2. Render の Dashboard → **New Web Service** → GitHub リポジトリを選択
3. 環境変数 `ANTHROPIC_API_KEY` を設定
4. 自動的に `render.yaml` の設定でデプロイされます

## 使い方

1. **処方薬を登録**: 左パネルの検索欄に薬名を入力 → 候補をクリックで追加
2. **患者の性格を選択**: 「話好き」「無口」「代理」タブをクリック
3. **服薬指導を開始**: テキスト入力か🎤ボタン（音声）で薬剤師として話しかける
4. AI が選択した性格でリアルな患者の返答を生成し、音声でも応答

## ファイル構成

```
├── main.py              # FastAPI バックエンド
├── prepare_data.py      # 薬剤データ CSV 生成スクリプト
├── requirements.txt
├── render.yaml          # Render デプロイ設定
├── data/
│   └── drugs.csv        # 薬剤マスタ（prepare_data.py で生成）
└── static/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── app.js        # メインアプリロジック
        ├── avatar.js     # Canvas アバターアニメーション
        └── voice.js      # 音声入出力（Web Speech API）
```

## 注意事項

- 音声認識・合成は **Google Chrome** での使用を推奨します
- `ANTHROPIC_API_KEY` は `.env` ファイルに保存し、Git にはコミットしないでください
- Excel ファイル（`*.xlsx`）は `.gitignore` により除外されています
