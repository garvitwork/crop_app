from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
from importlib import import_module
from PIL import Image, UnidentifiedImageError

img_mod = import_module("1_image_classification")
weather_mod = import_module("2_weather_api")
geo_mod = import_module("3_geo_hotspot")
expert_mod = import_module("4_expert_validation")
sensor_mod = import_module("5_pest_traps_sensor")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MIN_CONFIDENCE = 0.35  # below this, treat the image as not a valid crop/leaf photo


@app.get("/health")
async def health():
    return {"status": "awake"}


@app.get("/hotspots")
async def hotspots():
    return geo_mod.get_top_hotspots(8)


@app.post("/analyze")
async def analyze(file: UploadFile, district: str = Form("Pune"), crop: str = Form("Tomato")):
    path = f"temp_{file.filename}"
    try:
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # 1) reject files that aren't actually valid images
        try:
            with Image.open(path) as im:
                im.verify()
        except UnidentifiedImageError:
            return JSONResponse(status_code=422, content={"error": "This file isn't a valid image. Please upload a JPG/PNG photo."})

        prediction = img_mod.predict(path)

        # 2) reject images the model isn't confident are a crop/leaf at all
        if prediction["confidence"] < MIN_CONFIDENCE:
            return JSONResponse(status_code=422, content={
                "error": f"This doesn't look like a clear crop/leaf photo (confidence {prediction['confidence']*100:.0f}%). "
                         f"Please retake — good lighting, leaf filling the frame, no blur."
            })

        try:
            weather = weather_mod.compute_risk(weather_mod.get_weather(district))
        except Exception as e:
            return JSONResponse(status_code=502, content={"error": f"Weather service unavailable: {e}"})

        advisory = expert_mod.get_expert_advisory(
            crop=crop, predicted_disease=prediction["class"],
            confidence=prediction["confidence"], weather_risk=weather["pest_disease_risk"],
            district=district)
        sensor = sensor_mod.get_sensor_data()

        return {"prediction": prediction, "weather": weather, "advisory": advisory, "sensor": sensor}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})