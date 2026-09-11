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

Respond using EXACTLY this structure, with each heading on its own line
followed by a short paragraph (no markdown, no asterisks, no numbering):

Diagnosis Validation:
<Is this diagnosis reasonable given the crop and risk level? 2-3 sentences.>

Management Recommendation:
<Simple, actionable treatment — safe pesticide/cultural practice, dosage caution. 2-3 sentences.>

Local Support:
<Whether the farmer should visit a local Krishi Vigyan Kendra or lab, and why. 1-2 sentences.>

मराठी सारांश (Marathi Summary):
<Short summary of all the above, in Marathi only.>

Keep the whole answer under 150 words. Do not add any other headings or sections.
"""


def _try_gemini(prompt):
    response = client.models.generate_content(model="gemini-3.6-flash", contents=prompt)
    return response.text


def _try_groq(prompt):
    if not groq_client:
        raise Exception("GROQ_API_KEY is not set in environment")
    completion = groq_client.chat.completions.create(
        model="openai/gpt-oss-20b",
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
        return _try_groq(prompt)
    except Exception as e:
        print(f"Groq failed ({e}), falling back to Gemini...")
        try:
            return _try_gemini(prompt)
        except Exception as e2:
            raise Exception(f"Both Groq and Gemini failed. Groq: {e} | Gemini: {e2}")


if __name__ == "__main__":
    advisory = get_expert_advisory(
        crop="Tomato", predicted_disease="Late Blight",
        confidence=0.87, weather_risk="HIGH", district="Pune",
    )
    print("Expert Validated Advisory:\n")
    print(advisory)