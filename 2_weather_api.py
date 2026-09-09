"""
2) WEATHER-BASED RISK FORECAST
Uses Open-Meteo (free, no API key needed): https://open-meteo.com
Fetches weather for a Maharashtra district and computes a simple
pest/disease risk score based on temperature + humidity + rainfall.
"""

import requests

# Sample Maharashtra district coordinates
DISTRICTS = {
    "Pune": (18.5204, 73.8567),
    "Nashik": (19.9975, 73.7898),
    "Nagpur": (21.1458, 79.0882),
    "Aurangabad": (19.8762, 75.3433),
    "Kolhapur": (16.7050, 74.2433),
}

BASE_URL = "https://api.open-meteo.com/v1/forecast"


def get_weather(district="Pune"):
    lat, lon = DISTRICTS.get(district, DISTRICTS["Pune"])
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation",
        "daily": "precipitation_sum,temperature_2m_max,temperature_2m_min",
        "timezone": "Asia/Kolkata",
    }
    r = requests.get(BASE_URL, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


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
