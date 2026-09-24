from fastapi import FastAPI, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil
import time
from datetime import datetime, timedelta
from collections import defaultdict
from importlib import import_module
from PIL import Image, UnidentifiedImageError
import mlflow
import dagshub
from dotenv import load_dotenv

load_dotenv()

img_mod = import_module("1_image_classification")
weather_mod = import_module("2_weather_api")
geo_mod = import_module("3_geo_hotspot")
expert_mod = import_module("4_expert_validation")
sensor_mod = import_module("5_pest_traps_sensor")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- DagsHub / MLflow tracking for every live /analyze request ---
import os
DAGSHUB_REPO_OWNER = os.environ.get("DAGSHUB_REPO_OWNER", "garvitwork")
DAGSHUB_REPO_NAME = os.environ.get("DAGSHUB_REPO_NAME", "crop_app")
DAGSHUB_TOKEN = os.environ.get("DAGSHUB_TOKEN", "")
if DAGSHUB_TOKEN:
    os.environ["MLFLOW_TRACKING_USERNAME"] = DAGSHUB_TOKEN
    os.environ["MLFLOW_TRACKING_PASSWORD"] = DAGSHUB_TOKEN
TRACKING_ENABLED_FLAG = {"initialized": False, "enabled": False}


def _ensure_tracking():
    """Lazy: connects to DagsHub/MLflow only on first real request, not at server
    boot — keeps startup fast and light so Render's port scan doesn't time out."""
    if TRACKING_ENABLED_FLAG["initialized"]:
        return TRACKING_ENABLED_FLAG["enabled"]
    try:
        dagshub.init(repo_owner=DAGSHUB_REPO_OWNER, repo_name=DAGSHUB_REPO_NAME, mlflow=True)
        mlflow.set_experiment("cropguard_inference")
        TRACKING_ENABLED_FLAG["enabled"] = True
    except Exception as e:
        print(f"DagsHub tracking disabled (init failed): {e}")
        TRACKING_ENABLED_FLAG["enabled"] = False
    TRACKING_ENABLED_FLAG["initialized"] = True
    return TRACKING_ENABLED_FLAG["enabled"]


def log_analysis(status, crop, district, reason=None, prediction=None, weather=None,
                  advisory_provider=None, latency=None, gate_label=None):
    """Logs one /analyze request to MLflow — accepted or rejected — so every real
    scan is traceable on DagsHub, not just training runs."""
    if not _ensure_tracking():
        return
    try:
        with mlflow.start_run(run_name=f"scan_{datetime.utcnow().isoformat()}"):
            mlflow.log_param("crop_selected", crop)
            mlflow.log_param("district", district)
            mlflow.log_param("status", status)  # accepted / rejected
            if reason:
                mlflow.log_param("reject_reason", reason)
            if gate_label:
                mlflow.log_param("plant_gate_label", gate_label)
            if prediction:
                mlflow.log_param("predicted_class", prediction["class"])
                mlflow.log_metric("confidence", prediction["confidence"])
            if weather:
                mlflow.log_param("weather_risk", weather["pest_disease_risk"])
                mlflow.log_metric("temperature_C", weather["temperature_C"])
                mlflow.log_metric("humidity_percent", weather["humidity_percent"])
            if advisory_provider:
                mlflow.log_param("advisory_provider", advisory_provider)
            if latency is not None:
                mlflow.log_metric("latency_seconds", latency)
    except Exception as e:
        print(f"MLflow logging failed (non-fatal): {e}")


MIN_CONFIDENCE = 0.45  # below this, reject as not a valid supported-crop leaf photo
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
    start = time.time()
    try:
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # 1) reject files that aren't actually valid images
        try:
            with Image.open(path) as im:
                im.verify()
        except UnidentifiedImageError:
            log_analysis("rejected", crop, district, reason="invalid_image_file", latency=time.time() - start)
            return JSONResponse(status_code=422, content={"error": "This file isn't a valid image. Please upload a JPG/PNG photo."})

        prediction = img_mod.predict(path)

        # (plant-sanity gate removed — the trained disease model's own confidence,
        # checked below, is more reliable for these specific crop leaves than a
        # generic ImageNet gate, which was misreading close-up leaves as textures.)

        # 3) reject images the model isn't confident are a genuine, supported crop leaf
        if prediction["confidence"] < MIN_CONFIDENCE:
            log_analysis("rejected", crop, district, reason="low_confidence", prediction=prediction,
                         latency=time.time() - start)
            return JSONResponse(status_code=422, content={
                "error": f"This doesn't look like a valid Tomato, Potato, or Pepper leaf photo (confidence {prediction['confidence']*100:.0f}%). "
                         f"Please upload a clear, well-lit photo of one of these three crops."
            })

        # 4) reject crops the model wasn't trained on (e.g. banana, mango) even if it forced a confident guess
        detected_crop = _crop_prefix(prediction["class"])
        if detected_crop not in SUPPORTED_CROPS:
            log_analysis("rejected", crop, district, reason="unsupported_crop", prediction=prediction,
                         latency=time.time() - start)
            return JSONResponse(status_code=422, content={
                "error": f"This app only supports Tomato, Potato, and Pepper crops right now. "
                         f"The photo doesn't match any of these — please upload a leaf from one of those three."
            })

        try:
            weather = weather_mod.compute_risk(weather_mod.get_weather(district))
        except Exception as e:
            log_analysis("rejected", crop, district, reason="weather_unavailable", prediction=prediction, latency=time.time() - start)
            return JSONResponse(status_code=502, content={"error": f"Weather service unavailable: {e}"})

        advisory, provider = expert_mod.get_expert_advisory(
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

        log_analysis("accepted", crop, district, prediction=prediction, weather=weather,
                     advisory_provider=provider, latency=time.time() - start)

        return {"prediction": prediction, "weather": weather, "advisory": advisory, "sensor": sensor}

    except Exception as e:
        log_analysis("error", crop, district, reason=str(e), latency=time.time() - start)
        return JSONResponse(status_code=500, content={"error": str(e)})