from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
from datetime import datetime, timedelta
from collections import defaultdict
from importlib import import_module
from PIL import Image, UnidentifiedImageError

img_mod = import_module("1_image_classification")
weather_mod = import_module("2_weather_api")
geo_mod = import_module("3_geo_hotspot")
expert_mod = import_module("4_expert_validation")
sensor_mod = import_module("5_pest_traps_sensor")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MIN_CONFIDENCE = 0.40  # below this, treat the image as not a valid crop/leaf photo
SUPPORTED_CROPS = {"Tomato", "Potato", "Pepper"}  # the only crops this model was trained on


def _crop_prefix(class_name):
    parts = [p for p in class_name.replace("__", "_").split("_") if p]
    return parts[0] if parts else class_name

SCAN_LOG = []          # in-memory log of real farmer submissions, most recent first
MAX_LOG = 50

CLUSTER_WINDOW_HOURS = 6   # submissions within this window count toward a cluster
CLUSTER_MIN_COUNT = 3      # this many matching reports in the window = active cluster

RISK_HISTORY = defaultdict(list)  # district -> list of (timestamp, risk_str), most recent last
RISK_SCORE = {"LOW": 0, "MODERATE": 1, "HIGH": 2}


@app.get("/health")
async def health():
    return {"status": "awake"}


@app.get("/districts-weather")
async def districts_weather():
    out = []
    now = datetime.utcnow()
    for d in weather_mod.DISTRICTS.keys():
        try:
            w = weather_mod.compute_risk(weather_mod.get_weather(d))
            risk = w["pest_disease_risk"]

            hist = RISK_HISTORY[d]
            hist.append((now, risk))
            del hist[:-10]  # keep last 10 readings per district

            trend = "steady"
            if len(hist) >= 2:
                prev_score = RISK_SCORE.get(hist[-2][1], 1)
                cur_score = RISK_SCORE.get(risk, 1)
                if cur_score > prev_score:
                    trend = "rising"
                elif cur_score < prev_score:
                    trend = "falling"

            out.append({"district": d, "trend": trend, **w})
        except Exception:
            out.append({"district": d, "pest_disease_risk": "N/A", "trend": "steady", "temperature_C": None, "humidity_percent": None})
    return out


@app.get("/hotspots")
async def hotspots():
    return geo_mod.get_top_hotspots(8)


@app.get("/recent-scans")
async def recent_scans():
    return SCAN_LOG


@app.get("/clusters")
async def clusters():
    """Detect outbreak clusters: 3+ matching (district, disease) reports within a rolling time window."""
    now = datetime.utcnow()
    cutoff = now - timedelta(hours=CLUSTER_WINDOW_HOURS)
    groups = defaultdict(list)
    for s in SCAN_LOG:
        try:
            ts = datetime.fromisoformat(s["timestamp"])
        except Exception:
            continue
        if ts < cutoff:
            continue
        groups[(s["district"], s["predicted_class"])].append(s)

    active = []
    for (district, disease), reports in groups.items():
        if len(reports) >= CLUSTER_MIN_COUNT:
            active.append({
                "district": district,
                "disease": disease.replace("_", " "),
                "report_count": len(reports),
                "avg_confidence": sum(r["confidence"] for r in reports) / len(reports),
                "first_seen": min(r["timestamp"] for r in reports),
                "last_seen": max(r["timestamp"] for r in reports),
            })
    active.sort(key=lambda c: c["report_count"], reverse=True)
    return active


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

        # 2) independent sanity gate: is this even plausibly a plant/leaf photo?
        # Catches screenshots, documents, and unrelated objects that the specialized
        # disease model would otherwise be forced to (mis)classify with false confidence.
        is_plant, gate_label, gate_conf = img_mod.is_probably_plant(path)
        if not is_plant:
            return JSONResponse(status_code=422, content={
                "error": f"This doesn't look like a plant or leaf photo — it looks more like '{gate_label.replace('_', ' ')}'. "
                         f"Please upload a clear photo of a crop leaf."
            })

        prediction = img_mod.predict(path)

        # 3) only reject near-random noise now — the plant-gate above already handles
        # "is this even a leaf photo", so we no longer hard-block genuine leaf photos
        # just because the disease model itself is moderately uncertain.
        if prediction["confidence"] < 0.25:
            return JSONResponse(status_code=422, content={
                "error": f"The model can't confidently identify anything in this photo (confidence {prediction['confidence']*100:.0f}%). "
                         f"Please retake — good lighting, leaf filling the frame, no blur."
            })
        prediction["low_confidence"] = prediction["confidence"] < 0.55

        # 4) reject crops the model wasn't trained on (e.g. banana, mango) even if it forced a confident guess
        detected_crop = _crop_prefix(prediction["class"])
        if detected_crop not in SUPPORTED_CROPS:
            return JSONResponse(status_code=422, content={
                "error": f"This app only supports Tomato, Potato, and Pepper crops right now. "
                         f"The photo doesn't match any of these — please upload a leaf from one of those three."
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

        # log this real submission for the officials dashboard + cluster detection
        SCAN_LOG.insert(0, {
            "crop": crop,
            "district": district,
            "predicted_class": prediction["class"],
            "confidence": prediction["confidence"],
            "risk": weather["pest_disease_risk"],
            "timestamp": datetime.utcnow().isoformat(),
        })
        del SCAN_LOG[MAX_LOG:]

        return {"prediction": prediction, "weather": weather, "advisory": advisory, "sensor": sensor}

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})