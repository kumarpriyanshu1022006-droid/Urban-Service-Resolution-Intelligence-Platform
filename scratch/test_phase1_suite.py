"""
scratch/test_phase1_suite.py

Isolated Verification Suite for Phase 1:
- Address Normalization
- Geocoding Autocomplete Proxy
- Optional ZIP Code Handling (backward-compatible storage)
- Elimination of Fallback Coordinates (storing genuine NULLs in operational database)
- Location Source & GPS Accuracy Provenance
- ML Resolution Time Estimation Integrity

Runs against an ISOLATED database (data/test_phase1.db) to ensure zero writes
to the active operational database.
"""

import os
import sys
import sqlite3
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Create isolated test database from the verified pre-phase1 backup
TEST_DB_PATH = BASE_DIR / "data" / "test_phase1.db"
BACKUP_PATH = BASE_DIR / "data" / "operational_backup_pre_phase1_20261030_123405.db"

# Copy backup to isolated test db
if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

src = sqlite3.connect(str(BACKUP_PATH))
dst = sqlite3.connect(str(TEST_DB_PATH))
with dst:
    src.backup(dst)
src.close()
dst.close()

# Point operational_db to the test database
import api.operational_db as db
db.DB_PATH = TEST_DB_PATH
db.init_operational_db()

from fastapi.testclient import TestClient
from api.main import app
from api.location_service import normalize_address, is_within_nyc, get_borough_centroid, geocode_autocomplete

client = TestClient(app)

def run_phase1_tests():
    print("\n" + "=" * 65)
    print("STARTING PHASE 1 ISOLATED VERIFICATION SUITE")
    print(f"Isolated Test Database: {TEST_DB_PATH}")
    print("=" * 65)

    # --------------------------------------------------
    # 1. ADDRESS NORMALIZATION TESTS
    # --------------------------------------------------
    print("\n--- 1. Testing Address Normalization ---")
    test_cases = [
        ("350 5th ave., apt 4b", "350 5TH AVENUE APT 4B"),
        ("123 w. 45th street", "123 WEST 45TH STREET"),
        ("Grand Concourse & E 161st st", "GRAND CONCOURSE & EAST 161ST STREET"),
        ("71st ave & queens blvd", "71ST AVENUE & QUEENS BOULEVARD"),
        ("450 7th Ave", "450 7TH AVENUE"),
        ("100 e 14th st, suite 200", "100 EAST 14TH STREET SUITE 200"),
    ]
    for raw, expected in test_cases:
        normalized = normalize_address(raw)
        assert normalized == expected, f"Expected {expected!r}, got {normalized!r}"
        print(f"  [PASS] {raw!r} -> {normalized!r}")

    # --------------------------------------------------
    # 2. BOUNDING BOX & BOROUGH CENTROIDS
    # --------------------------------------------------
    print("\n--- 2. Testing NYC Bounds & Borough Centroids ---")
    assert is_within_nyc(40.7128, -74.0060) is True, "City Hall should be inside NYC"
    assert is_within_nyc(40.7505, -73.9934) is True, "Midtown should be inside NYC"
    assert is_within_nyc(34.0522, -118.2437) is False, "Los Angeles should be outside NYC"
    assert is_within_nyc(None, None) is False, "None coordinates should be outside NYC"
    print("  [PASS] NYC bounding box correctly accepts valid coords and rejects outside coords/None.")

    m_lat, m_lon = get_borough_centroid("MANHATTAN")
    assert 40.7 <= m_lat <= 40.85 and -74.05 <= m_lon <= -73.9, "Invalid Manhattan centroid"
    print(f"  [PASS] Borough centroid retrieved: Manhattan -> ({m_lat}, {m_lon})")

    # --------------------------------------------------
    # 3. GEOCODING AUTOCOMPLETE PROXY ENDPOINT
    # --------------------------------------------------
    print("\n--- 3. Testing Geocoding Autocomplete Proxy ---")
    res = client.get("/api/operations/geocoding/autocomplete?query=350 5th Ave&borough=MANHATTAN")
    assert res.status_code == 200, f"Autocomplete failed: {res.text}"
    sug_data = res.json().get("suggestions", [])
    print(f"  [PASS] Autocomplete returned {len(sug_data)} suggestions.")
    if sug_data:
        s0 = sug_data[0]
        print(f"         Top suggestion: {s0.get('label')} (ZIP: {s0.get('incident_zip')}, Coords: {s0.get('latitude')}, {s0.get('longitude')})")
        assert "incident_address" in s0
        assert "borough" in s0

    # Test short query validation (min_length=2)
    short_res = client.get("/api/operations/geocoding/autocomplete?query=a")
    assert short_res.status_code == 422, "Query < 2 chars should fail validation"
    print("  [PASS] Query length < 2 rejected with HTTP 422.")

    # --------------------------------------------------
    # 4. CITIZEN AUTHENTICATION
    # --------------------------------------------------
    print("\n--- 4. Authenticating Citizen Persona ---")
    login_res = client.post("/api/operations/auth/login", json={
        "email": "citizen.jane@nyc.net",
        "password": "CitizenPass123!"
    })
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("  [PASS] Citizen Jane authenticated.")

    # --------------------------------------------------
    # 5. SUBMISSION WITH GENUINE COORDINATES & ZIP
    # --------------------------------------------------
    print("\n--- 5. Submission with Genuine Coordinates & ZIP ---")
    payload1 = {
        "problem": "Dirty Conditions",
        "problem_detail": "Trash / Illegal Dumping",
        "agency": "DSNY",
        "agency_name": "Department of Sanitation",
        "borough": "MANHATTAN",
        "incident_zip": "10001",
        "incident_address": "450 7th Ave",
        "location_type": "Sidewalk",
        "description": "Overflowing commercial trash bags.",
        "latitude": 40.7505,
        "longitude": -73.9934,
        "location_source": "DEVICE_GPS",
        "gps_accuracy": 15.0
    }
    sub1 = client.post("/api/operations/complaints", json=payload1, headers=headers)
    assert sub1.status_code == 200, f"Submission failed: {sub1.text}"
    data1 = sub1.json()
    ref1 = data1["reference_no"]
    assert data1["location_source"] == "DEVICE_GPS"
    assert data1["latitude"] == 40.7505
    assert data1["longitude"] == -73.9934
    assert data1["predicted_duration_hours"] > 0
    print(f"  [PASS] Created complaint {ref1} with genuine GPS coordinates (source=DEVICE_GPS, accuracy=15m).")

    # Verify directly in SQLite test database
    tconn = sqlite3.connect(str(TEST_DB_PATH))
    tcur = tconn.cursor()
    tcur.execute("SELECT latitude, longitude, location_source, gps_accuracy, normalized_address, incident_zip FROM complaints WHERE reference_no = ?;", (ref1,))
    row1 = tcur.fetchone()
    assert row1[0] == 40.7505
    assert row1[1] == -73.9934
    assert row1[2] == "DEVICE_GPS"
    assert row1[3] == 15.0
    assert row1[4] == "450 7TH AVENUE"
    assert row1[5] == "10001"
    print("  [PASS] SQLite row verified: GPS coords, accuracy, and normalized address stored correctly.")

    # --------------------------------------------------
    # 6. SUBMISSION WITH MISSING ZIP (OPTIONAL ZIP VERIFICATION)
    # --------------------------------------------------
    print("\n--- 6. Submission with Missing ZIP Code ---")
    payload2 = {
        "problem": "Street Condition",
        "problem_detail": "Pothole Emergency",
        "agency": "DOT",
        "agency_name": "Department of Transportation",
        "borough": "QUEENS",
        "incident_zip": "",  # Empty string (optional ZIP)
        "incident_address": "71st Ave & Queens Blvd",
        "location_type": "Street",
        "description": "Pothole in middle lane.",
        "latitude": 40.7215,
        "longitude": -73.8445,
        "location_source": "GEOCODER"
    }
    sub2 = client.post("/api/operations/complaints", json=payload2, headers=headers)
    assert sub2.status_code == 200, f"Submission without ZIP failed: {sub2.text}"
    data2 = sub2.json()
    ref2 = data2["reference_no"]
    assert data2["predicted_duration_hours"] > 0

    tcur.execute("SELECT incident_zip, normalized_address FROM complaints WHERE reference_no = ?;", (ref2,))
    row2 = tcur.fetchone()
    assert row2[0] == "", "Empty ZIP should be saved as empty string, satisfying NOT NULL constraint"
    assert row2[1] == "71ST AVENUE & QUEENS BOULEVARD"
    print(f"  [PASS] Complaint {ref2} saved successfully with empty ZIP (no constraint failure).")

    # --------------------------------------------------
    # 7. SUBMISSION WITHOUT COORDINATES (ELIMINATION OF FALLBACK COORDS)
    # --------------------------------------------------
    print("\n--- 7. Submission Without Coordinates (No Fallback Invention) ---")
    payload3 = {
        "problem": "Illegal Parking",
        "problem_detail": "Blocked Hydrant",
        "agency": "NYPD",
        "agency_name": "New York City Police Department",
        "borough": "BRONX",
        "incident_address": "Grand Concourse & E 161st St",
        "location_type": "Street",
        "description": "Van blocking active hydrant.",
        "latitude": None,
        "longitude": None
    }
    sub3 = client.post("/api/operations/complaints", json=payload3, headers=headers)
    assert sub3.status_code == 200, f"Submission without coords failed: {sub3.text}"
    data3 = sub3.json()
    ref3 = data3["reference_no"]
    assert data3["latitude"] is None, "Latitude should be None in response"
    assert data3["longitude"] is None, "Longitude should be None in response"
    assert data3["location_source"] == "MANUAL"
    assert data3["predicted_duration_hours"] > 0, "ML model should succeed using borough centroid"

    tcur.execute("SELECT latitude, longitude, location_source, normalized_address FROM complaints WHERE reference_no = ?;", (ref3,))
    row3 = tcur.fetchone()
    assert row3[0] is None, "Database latitude must be strictly NULL when unverified"
    assert row3[1] is None, "Database longitude must be strictly NULL when unverified"
    assert row3[2] == "MANUAL"
    assert row3[3] == "GRAND CONCOURSE & EAST 161ST STREET"
    print(f"  [PASS] Complaint {ref3} saved with strictly NULL coordinates in SQLite (location_source=MANUAL).")
    print(f"         ML inference succeeded: ~{data3['predicted_duration_hours']:.1f} hrs predicted via Bronx centroid.")

    tconn.close()

    print("\n" + "=" * 65)
    print("ALL PHASE 1 ISOLATED VERIFICATION TESTS PASSED (100% GREEN)")
    print("=" * 65)

if __name__ == "__main__":
    try:
        run_phase1_tests()
    finally:
        # Clean up isolated test database
        if TEST_DB_PATH.exists():
            try:
                TEST_DB_PATH.unlink()
                print(f"Cleaned up isolated test database: {TEST_DB_PATH}")
            except Exception:
                pass

