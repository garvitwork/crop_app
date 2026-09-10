"""
3) GEOSPATIAL HOTSPOT MAPPING
Free / no API key needed. Uses 'folium' to plot pest/disease report
hotspots on a Maharashtra map as a heatmap.
Output: hotspot_map.html (open in browser)
"""

import folium
from folium.plugins import HeatMap
import random
import math

# Sample field reports (lat, lon, severity 1-5) around Maharashtra
SAMPLE_REPORTS = [
    (18.5204, 73.8567, 4),  # Pune
    (19.9975, 73.7898, 3),  # Nashik
    (21.1458, 79.0882, 5),  # Nagpur
    (19.8762, 75.3433, 2),  # Aurangabad
    (16.7050, 74.2433, 4),  # Kolhapur
    (19.2183, 72.9781, 3),  # Thane
    (20.9320, 77.7523, 5),  # Amravati
]

# Named districts used to label the nearest report point
NAMED_DISTRICTS = {
    "Pune": (18.5204, 73.8567),
    "Nashik": (19.9975, 73.7898),
    "Nagpur": (21.1458, 79.0882),
    "Aurangabad": (19.8762, 75.3433),
    "Kolhapur": (16.7050, 74.2433),
    "Thane": (19.2183, 72.9781),
    "Amravati": (20.9320, 77.7523),
    "Solapur": (17.6599, 75.9064),
    "Nanded": (19.1383, 77.3210),
    "Satara": (17.6805, 74.0183),
}

RISK_LABELS = ["Low activity", "Water stress", "Pest pressure", "Fungal risk", "Leaf disease", "Severe outbreak"]


def generate_random_reports(n=15):
    """Simulate more report points scattered across Maharashtra bounds."""
    reports = []
    for _ in range(n):
        lat = random.uniform(16.0, 21.5)
        lon = random.uniform(73.0, 80.0)
        severity = random.randint(1, 5)
        reports.append((lat, lon, severity))
    return SAMPLE_REPORTS + reports


def _nearest_district(lat, lon):
    best, best_d = None, float("inf")
    for name, (dlat, dlon) in NAMED_DISTRICTS.items():
        d = math.hypot(lat - dlat, lon - dlon)
        if d < best_d:
            best, best_d = name, d
    return best


def get_top_hotspots(n=5):
    """Aggregate report severity by nearest named district, return top n."""
    reports = generate_random_reports()
    scores = {}
    for lat, lon, sev in reports:
        name = _nearest_district(lat, lon)
        scores[name] = max(scores.get(name, 0), sev)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:n]
    result = []
    for name, sev in ranked:
        result.append({
            "region": name,
            "risk": RISK_LABELS[min(sev, 5)],
            "pct": round(sev / 5 * 100),
        })
    return result


def build_map(reports):
    m = folium.Map(location=[19.5, 76.0], zoom_start=6.5, tiles="OpenStreetMap")

    heat_data = [[lat, lon, sev] for lat, lon, sev in reports]
    HeatMap(heat_data, radius=25).add_to(m)

    for lat, lon, sev in reports:
        folium.CircleMarker(
            location=[lat, lon],
            radius=4,
            popup=f"Severity: {sev}",
            color="red" if sev >= 4 else "orange",
            fill=True,
        ).add_to(m)

    return m


if __name__ == "__main__":
    reports = generate_random_reports()
    m = build_map(reports)
    m.save("hotspot_map.html")
    print("Hotspot map saved to hotspot_map.html - open it in your browser.")
    print("Top hotspots:", get_top_hotspots())