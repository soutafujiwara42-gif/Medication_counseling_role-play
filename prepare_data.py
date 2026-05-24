"""
薬価基準収載品目リストのExcelファイルから品目データを抽出してCSVに保存するスクリプト。
Renderデプロイ前にローカルで一度実行してください。
"""
import pandas as pd
from pathlib import Path
import sys

EXCEL_DIR = Path(r"C:\Users\souta\OneDrive\デスクトップ\調剤負担金SIM\マスタデータ\薬価基準収載品目リスト")
OUTPUT_CSV = Path("data/drugs.csv")

def main():
    OUTPUT_CSV.parent.mkdir(exist_ok=True)

    dfs = []
    for i in range(1, 4):
        xlsx_path = EXCEL_DIR / f"tp20250319-01_0{i}.xlsx"
        if not xlsx_path.exists():
            print(f"[WARNING] ファイルが見つかりません: {xlsx_path}")
            continue
        print(f"読み込み中: {xlsx_path.name} ...", end=" ", flush=True)
        df = pd.read_excel(xlsx_path, header=0, engine="openpyxl")
        print(f"{len(df)} 行")
        dfs.append(df)

    if not dfs:
        print("[ERROR] Excelファイルが1件も読み込めませんでした。")
        sys.exit(1)

    combined = pd.concat(dfs, ignore_index=True)

    # 必要な列のみ抽出
    # col1=コード, col2=成分名, col3=規格, col7=品名, col12=薬価
    extracted = combined.iloc[:, [1, 2, 3, 7, 12]].copy()
    extracted.columns = ["code", "ingredient", "dosage", "name", "price"]

    # 品名が空の行を除外
    extracted = extracted[extracted["name"].notna() & (extracted["name"].astype(str).str.strip() != "")]
    extracted = extracted.reset_index(drop=True)

    extracted.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"\n完了: {len(extracted)} 件 → {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
