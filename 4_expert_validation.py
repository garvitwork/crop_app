import os
import requests
from google import genai
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = (os.environ.get("GEMINI_API_KEY") or "").strip()
GROQ_API_KEY = (os.environ.get("GROQ_API_KEY") or "").strip()

client = genai.Client(api_key=GEMINI_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

PROMPT_TEMPLATE = """
You are an agricultural extension expert helping farmers in Maharashtra, India.

Crop: {crop}
AI-predicted issue: {predicted_disease} (confidence: {confidence:.2f})
Current weather-based pest/disease risk: {weather_risk}
District: {district}

1. Validate if this diagnosis seems reasonable given the crop and risk level.
2. Give a short, simple management recommendation (safe pesticide/cultural
   practice, dosage caution).
3. Mention if the farmer should refer to a local Krishi Vigyan Kendra / lab.
Respond in English, then give a short summary in Marathi.
Keep the whole answer under 150 words.
"""


def _try_gemini(prompt):
    response = client.models.generate_content(model="gemini-3.6-flash", contents=prompt)
    return response.text


def _try_groq(prompt):
    if not groq_client:
        raise Exception("GROQ_API_KEY is not set in environment")
    completion = groq_client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
    )
    return completion.choices[0].message.content


def get_expert_advisory(crop, predicted_disease, confidence, weather_risk, district="Pune"):
    prompt = PROMPT_TEMPLATE.format(
        crop=crop, predicted_disease=predicted_disease,
        confidence=confidence, weather_risk=weather_risk, district=district,
    )
    try:
        return _try_gemini(prompt)
    except Exception as e:
        print(f"Gemini failed ({e}), falling back to Groq...")
        try:
            return _try_groq(prompt)
        except Exception as e2:
            raise Exception(f"Both Gemini and Groq failed. Gemini: {e} | Groq: {e2}")


if __name__ == "__main__":
    advisory = get_expert_advisory(
        crop="Tomato", predicted_disease="Late Blight",
        confidence=0.87, weather_risk="HIGH", district="Pune",
    )
    print("Expert Validated Advisory:\n")
    print(advisory)