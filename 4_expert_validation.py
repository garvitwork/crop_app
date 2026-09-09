import os
from google import genai
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)



def get_expert_advisory(crop, predicted_disease, confidence, weather_risk, district="Pune"):
    prompt = f"""
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
    response = client.models.generate_content(
        model="gemini-3.6-flash", contents=prompt
    )
    return response.text


if __name__ == "__main__":
    advisory = get_expert_advisory(
        crop="Tomato", predicted_disease="Late Blight",
        confidence=0.87, weather_risk="HIGH", district="Pune",
    )
    print("Expert Validated Advisory:\n")
    print(advisory)