"""
5) PEST TRAP / SENSOR INPUTS (simple simulation, no server)
Simulates IoT pest-trap counts + soil sensor readings and prints alerts.
Run: python 5_pest_traps_sensor.py
"""

import random
import time

PEST_COUNT_THRESHOLD = 20
SOIL_MOISTURE_LOW = 20


def read_pest_trap():
    return random.randint(0, 35)


def read_soil_sensor():
    return {
        "soil_moisture_percent": random.randint(10, 60),
        "soil_temperature_C": round(random.uniform(20, 35), 1),
    }


def get_sensor_data():
    pest_count = read_pest_trap()
    soil = read_soil_sensor()

    alerts = []
    if pest_count > PEST_COUNT_THRESHOLD:
        alerts.append("Pest count above threshold - inspect field")
    if soil["soil_moisture_percent"] < SOIL_MOISTURE_LOW:
        alerts.append("Low soil moisture - irrigation may be needed")

    return {
        "pest_trap_count": pest_count,
        "soil_data": soil,
        "alerts": alerts if alerts else ["Normal - no action needed"],
    }


if __name__ == "__main__":
    # simulate 5 readings, one every 2 seconds (like live sensor feed)
    for i in range(5):
        data = get_sensor_data()
        print(f"Reading {i+1}: {data}")
        time.sleep(2)