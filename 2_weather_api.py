"""
2) WEATHER-BASED RISK FORECAST
Uses Open-Meteo (free, no API key needed): https://open-meteo.com
Fetches weather for a Maharashtra district and computes a simple
pest/disease risk score based on temperature + humidity + rainfall.
"""

import requests
import time

DISTRICTS = {
    "Pune": (18.5204, 73.8567),
    "Nashik": (19.9975, 73.7898),
    "Nagpur": (21.1458, 79.0882),
    "Aurangabad": (19.8762, 75.3433),
    "Kolhapur": (16.7050, 74.2433),
}

BASE_URL = "https://api.open-meteo.com/v1/forecast"

_cache = {}       # district -> (timestamp, weather_json)
_CACHE_TTL = 600   # seconds — real data, just avoids hammering the API


def _fetch_open_meteo(district):
    lat, lon = DISTRICTS.get(district, DISTRICTS["Pune"])
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Kolkata",
    }
    last_err = None
    for attempt in range(2):
        try:
            r = requests.get(BASE_URL, params=params, timeout=8, headers={"User-Agent": "CropGuard/1.0"})
            if r.status_code == 429:
                last_err = requests.exceptions.HTTPError("429 rate limited")
                time.sleep(1.5)
                continue
            r.raise_for_status()
            return r.json()
        except requests.exceptions.RequestException as e:
            last_err = e
            time.sleep(1)
    raise last_err


def _fetch_wttr(district):
    # live fallback, no key needed, different provider/IP path than Open-Meteo
    r = requests.get(f"https://wttr.in/{district}?format=j1", timeout=8, headers={"User-Agent": "curl"})
    r.raise_for_status()
    cur = r.json()["current_condition"][0]
    return {
        "current": {
            "temperature_2m": float(cur["temp_C"]),
            "relative_humidity_2m": float(cur["humidity"]),
            "precipitation": float(cur.get("precipMM", 0)),
        }
    }


def get_weather(district="Pune"):
    now = time.time()
    if district in _cache:
        ts, data = _cache[district]
        if now - ts < _CACHE_TTL:
            return data

    try:
        data = _fetch_open_meteo(district)
    except Exception:
        data = _fetch_wttr(district)  # real live data, alternate source

    _cache[district] = (now, data)
    return data


def compute_risk(weather_json):
    current = weather_json["current"]
    temp = current["temperature_2m"]
    humidity = current["relative_humidity_2m"]
    rain = current["precipitation"]

    # Tighter, more selective bands — old thresholds (20-30C, humidity>=70,
    # rain>0) were so wide that almost any real reading hit 2/3 and scored
    # HIGH permanently. Now each factor needs a genuinely elevated reading,
    # and HIGH requires all three at once.
    score = 0
    if 24 <= temp <= 32:
        score += 1
    if humidity >= 80:
        score += 1
    if rain > 2:
        score += 1

    if score >= 3:
        risk = "HIGH"
    elif score == 2:
        risk = "MODERATE"
    else:
        risk = "LOW"

    return {
        "temperature_C": temp,
        "humidity_percent": humidity,
        "rainfall_mm": rain,
        "pest_disease_risk": risk,
    }


if __name__ == "__main__":
    district = "Pune"
    data = get_weather(district)
    result = compute_risk(data)
    print(f"Weather-based risk for {district}, Maharashtra:")
    print(result)