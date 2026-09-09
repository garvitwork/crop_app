"""
3) GEOSPATIAL HOTSPOT MAPPING
Free / no API key needed. Uses 'folium' to plot pest/disease report
hotspots on a Maharashtra map as a heatmap.
Output: hotspot_map.html (open in browser)
"""

import folium
from folium.plugins import HeatMap
import random

# Sample field reports (lat, lon, severity 1-5) around Maharashtra
# In a real system these would come from a database of farmer reports.
SAMPLE_REPORTS = [
    (18.5204, 73.8567, 4),  # Pune
    (19.9975, 73.7898, 3),  # Nashik
    (21.1458, 79.0882, 5),  # Nagpur
    (19.8762, 75.3433, 2),  # Aurangabad
    (16.7050, 74.2433, 4),  # Kolhapur
    (19.2183, 72.9781, 3),  # Thane
    (20.9320, 77.7523, 5),  # Amravati
]


def generate_random_reports(n=15):
    """Simulate more report points scattered across Maharashtra bounds."""
    reports = []
    for _ in range(n):
        lat = random.uniform(16.0, 21.5)
        lon = random.uniform(73.0, 80.0)
        severity = random.randint(1, 5)
        reports.append((lat, lon, severity))
    return SAMPLE_REPORTS + reports


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
