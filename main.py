import os
import io
import base64
import logging
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import anthropic
import edge_tts
import pandas as pd
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="服薬指導ロープレエージェント", version="1.0.0")

MODEL_ID = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


def load_drugs() -> pd.DataFrame:
    csv_path = Path("data/drugs.csv")
    if not csv_path.exists():
        logger.warning("data/drugs.csv が見つかりません。prepare_data.py を実行してください。")
        return pd.DataFrame(columns=["code", "ingredient", "dosage", "name", "price"])
    df = pd.read_csv(csv_path, encoding="utf-8-sig", dtype=str)
    df["name"] = df["name"].fillna("")
    logger.info(f"薬剤データ: {len(df)} 件読み込み完了")
    return df


drug_df = load_drugs()


# ── API: ヘルスチェック ──────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_ID, "drugs_loaded": len(drug_df)}


@app.get("/api/model")
def get_model():
    return {"model": MODEL_ID, "provider": "Anthropic (Claude)"}


# ── API: 薬剤検索 ────────────────────────────────────────────────────────────

@app.get("/api/drugs/search")
def search_drugs(q: str = Query(..., min_length=1)):
    q = q.strip()
    if drug_df.empty or not q:
        return {"results": [], "total": 0}

    mask = drug_df["name"].str.contains(q, na=False, case=False)
    matched = drug_df[mask].head(20)

    results = [
        {
            "name": row["name"],
            "code": row.get("code", ""),
            "ingredient": row.get("ingredient", ""),
            "dosage": row.get("dosage", ""),
            "price": row.get("price", ""),
        }
        for _, row in matched.iterrows()
    ]
    return {"results": results, "total": len(matched)}


# ── 患者性格プロンプト ─────────────────────────────────────────────────────────

PERSONALITY_PROMPTS = {
    "talkative": """あなたは話好きで社交的な患者（50代・女性）を自然にロールプレイしてください。薬局に処方箋を持参した患者です。

【性格と口調】
- 明るくて話が好き。薬剤師との会話を楽しんでいる
- 丁寧語ベースだが親しみやすい。「〜ですよね」「〜なんですよ」など共感を求める
- 質問に答えながら、関連した体験談や日常話を自然に加える
- 「そういえば…」「話は変わるんですけど…」と脱線することがある
- 薬の副作用や飲み方をよく気にして、積極的に質問する

【返答スタイル】
- 60〜150文字程度の自然な口語
- 質問や懸念を1〜2個含めることがある
""",
    "quiet": """あなたは無口で内向的な患者（40代・男性）を自然にロールプレイしてください。薬局に処方箋を持参した患者です。

【性格と口調】
- 物静かで、話すのが苦手
- 質問されたことにだけ短く答える。自分からは話を広げない
- 少し緊張していて、視線が泳ぐような雰囲気
- 答えに詰まることもある。「…はい」「特に…ないです」など
- 必要なことが聞けないまま帰ろうとしてしまうことがある

【返答スタイル】
- 10〜50文字の短い返答
- 一言で終わることも多い
""",
    "proxy": """あなたは患者本人ではなく、高齢の母親（80代）の代理として薬局に来た子供（50代・娘）をロールプレイしてください。

【性格と口調】
- 礼儀正しくて丁寧だが、母の状態を正確には把握していない
- 「母が」「母は」と代理であることを都度明示する
- 「たぶん…だと思うんですが」「確かではないんですが」と不確かな情報をそのまま伝える
- 本人から頼まれた質問をメモ（頭の中）から思い出しながら聞く
- 「本人が直接聞いた方がいいですよね…でも来られなくて」と申し訳なさそう

【返答スタイル】
- 40〜120文字の丁寧な口語
- 不確かな情報は必ず「〜だと思うんですが」と付ける
""",
}


# ── API: チャット ────────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str


class PatientBackground(BaseModel):
    age: str = ""
    gender: str = ""
    chief_complaint: str = ""
    medical_history: str = ""
    allergies: str = ""
    notes: str = ""


class ChatRequest(BaseModel):
    message: str
    prescription: List[str] = []
    personality: str = "talkative"
    history: List[Message] = []
    patient_background: PatientBackground = PatientBackground()


@app.post("/api/chat")
async def chat(req: ChatRequest):
    personality_prompt = PERSONALITY_PROMPTS.get(req.personality, PERSONALITY_PROMPTS["talkative"])

    if req.prescription:
        presc_lines = "\n".join(f"  ・{d}" for d in req.prescription)
        presc_section = f"\n\n【今回の処方薬】\n{presc_lines}"
    else:
        presc_section = "\n\n【今回の処方薬】\n  （未登録）"

    bg = req.patient_background
    bg_parts = []
    if bg.age:             bg_parts.append(f"  年齢: {bg.age}")
    if bg.gender:          bg_parts.append(f"  性別: {bg.gender}")
    if bg.chief_complaint: bg_parts.append(f"  主訴: {bg.chief_complaint}")
    if bg.medical_history: bg_parts.append(f"  既往歴: {bg.medical_history}")
    if bg.allergies:       bg_parts.append(f"  アレルギー: {bg.allergies}")
    if bg.notes:           bg_parts.append(f"  備考: {bg.notes}")
    bg_section = ("\n\n【患者背景】\n" + "\n".join(bg_parts)) if bg_parts else ""

    system_prompt = (
        f"{personality_prompt}"
        f"{presc_section}"
        f"{bg_section}\n\n"
        "【共通ルール】\n"
        "- 完全に患者として振る舞い、AIであることを絶対に明かさない\n"
        "- 患者背景・処方薬の情報を自然に会話に盛り込む\n"
        "- 自然な日本語口語で、リアルな患者らしい反応をする\n"
        "- 処方薬に関連した自然な懸念・質問・体験談を織り交ぜる\n"
        "- 絵文字・記号・箇条書きは使わない\n"
        "- 返答は必ず会話文のみ（説明文・ト書き不要）\n"
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    try:
        response = client.messages.create(
            model=MODEL_ID,
            max_tokens=512,
            system=system_prompt,
            messages=messages,
        )
        reply = response.content[0].text

        # Generate TTS audio with edge-tts (server-side, works on iOS Safari)
        audio_b64: Optional[str] = None
        try:
            communicate = edge_tts.Communicate(reply, "ja-JP-NanamiNeural")
            buf = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            if buf.tell() > 0:
                audio_b64 = base64.b64encode(buf.getvalue()).decode()
        except Exception as tts_err:
            logger.warning(f"edge-tts エラー（音声なしで続行）: {tts_err}")

        return {
            "reply": reply,
            "audio": audio_b64,
            "model": MODEL_ID,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }
    except Exception as e:
        logger.error(f"Claude API エラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── 静的ファイル（最後に設定） ────────────────────────────────────────────────

app.mount("/", StaticFiles(directory="static", html=True), name="static")
