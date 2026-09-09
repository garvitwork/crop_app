from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import shutil
from importlib import import_module

img_mod = import_module("1_image_classification")
weather_mod = import_module("2_weather_api")
expert_mod = import_module("4_expert_validation")
sensor_mod = import_module("5_pest_traps_sensor")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/analyze")
async def analyze(file: UploadFile, district: str = Form("Pune"), crop: str = Form("Tomato")):
    path = f"temp_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    prediction = img_mod.predict(path)
    weather = weather_mod.compute_risk(weather_mod.get_weather(district))
    advisory = expert_mod.get_expert_advisory(
        crop=crop, predicted_disease=prediction["class"],
        confidence=prediction["confidence"], weather_risk=weather["pest_disease_risk"],
        district=district)
    sensor = sensor_mod.get_sensor_data()

    return {"prediction": prediction, "weather": weather, "advisory": advisory, "sensor": sensor}