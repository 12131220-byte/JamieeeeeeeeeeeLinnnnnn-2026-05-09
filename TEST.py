
import os
import jieba
import google.generativeai as genai
from bertopic import BERTopic
from dotenv import load_dotenv; load_dotenv()


 
 
import os
import jieba
import google.generativeai as genai
from bertopic import BERTopic
from dotenv import load_dotenv; load_dotenv()

# ==========================================
# 步驟 1: 設定 Gemini API 與自動模型偵測
# ==========================================
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("❌ 錯誤：找不到金鑰！請執行 set GOOGLE_API_KEY='你的金鑰'")
    exit()

genai.configure(api_key=api_key)

# 自動尋找可用的模型名稱，解決 404 問題
available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
model_name = 'models/gemini-1.5-flash' if 'models/gemini-1.5-flash' in available_models else available_models[0]
print(f"✅ 成功連線！使用模型：{model_name}")
model = genai.GenerativeModel(model_name)

# ==========================================
# 步驟 2: 準備示範數據 (你的失禁護理研究數據)
# ==========================================
docs = [
    "08:00 喝了一杯大熱美式咖啡",
    "09:15 突然有強烈尿意，差點憋不住",
    "10:30 喝了 500cc 礦泉水",
    "11:50 去洗手間排尿，尿量普通",
    "13:00 午餐喝了兩碗熱昆布湯",
    "14:05 感覺膀胱很脹，急著找廁所",
    "15:30 喝了一杯去冰無糖綠茶",
    "16:40 發生急迫性尿失禁，來不及去廁所",
    "19:00 晚餐喝了一罐啤酒",
    "20:15 尿急感明顯，趕快去廁所"
] * 3 

# 中文分詞處理 (BERTopic 處理中文必須步驟)
processed_docs = [" ".join(jieba.cut(d)) for d in docs]

# ==========================================
# 步驟 3: 使用 BERTopic 進行主題分析
# ==========================================
print("--- [1/3] 正在分析飲食與尿意模式... ---")
# 使用多語言模型以支援中文環境
topic_model = BERTopic(embedding_model="paraphrase-multilingual-MiniLM-L12-v2", verbose=False)
topics, _ = topic_model.fit_transform(processed_docs)

# 取得主題關鍵字
main_topics = topic_model.get_topic(0)[:5] 
summary_str = f"模型偵測的核心關鍵字: {', '.join([word[0] for word in main_topics])}"

# ==========================================
# 步驟 4: 將分析結果交給 Gemini 生成建議
# ==========================================
print("--- [2/3] 正在生成個人化預警建議... ---")

prompt = f"""
我是智慧尿道健康管理系統助理。
分析顯示使用者的行為特徵為：{summary_str}。
特別觀察到攝取『咖啡』與『熱湯』後約 60 分鐘會出現急尿感。

請以專業且體貼的語氣，為使用者『被內耗人』寫一段 80 字內的預警建議，
提醒他如何根據飲食調整如廁時間，以避免失禁。
"""

try:
    response = model.generate_content(prompt)
    ai_advice = response.text
except Exception as e:
    ai_advice = f"AI 生成建議時出錯：{e}"

# ==========================================
# 步驟 5: 成果展示輸出
# ==========================================
print("\n" + "="*50)
print("【AIoT 智慧尿道健康管理系統 - 分析簡報】")
print("="*50)
print(f"📊 數據量：已分析 {len(docs)} 筆行為紀錄")
print(f"🔍 主題分析：{summary_str}")
print("-" * 50)
print("💡 Gemini AI 的提醒：")
print(ai_advice)
print("="*50)