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


def get_weather(district="Pune"):
    now = time.time()
    if district in _cache:
        ts, data = _cache[district]
        if now - ts < _CACHE_TTL:
            return data

    lat, lon = DISTRICTS.get(district, DISTRICTS["Pune"])
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Kolkata",
    }

    last_err = None
    for attempt in range(4):
        try:
            r = requests.get(
                BASE_URL, params=params, timeout=10,
                headers={"User-Agent": "CropGuard/1.0"},
            )
            if r.status_code == 429:
                last_err = requests.exceptions.HTTPError("429 rate limited")
                time.sleep(2 ** attempt)  # 1s, 2s, 4s, 8s
                continue
            r.raise_for_status()
            data = r.json()
            _cache[district] = (now, data)
            return data
        except requests.exceptions.RequestException as e:
            last_err = e
            time.sleep(2 ** attempt)

    raise last_err


def compute_risk(weather_json):
    current = weather_json["current"]
    temp = current["temperature_2m"]
    humidity = current["relative_humidity_2m"]
    rain = current["precipitation"]

    score = 0
    if 20 <= temp <= 30:
        score += 1
    if humidity >= 70:
        score += 1
    if rain > 0:
        score += 1

    if score >= 2:
        risk = "HIGH"
    elif score == 1:
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