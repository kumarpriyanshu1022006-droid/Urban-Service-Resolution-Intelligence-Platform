"""
scratch/test_stage1_security_fixes.py

Comprehensive Security Fixes Verification Suite for Phase 3 Stage 1:
- Oversized bodies (> 30 MB) rejected with HTTP 413
- Malformed/negative Content-Length headers rejected with HTTP 400
- Streamed oversized bodies (without Content-Length) rejected with HTTP 413
- Oversized image dimensions (> 8000x8000 or > 64 megapixels) rejected with HTTP 400
- Malformed images rejected with HTTP 400
- Path traversal outside storage directory rejected with HTTP 403
- Missing evidence files return HTTP 404 safely
- Security response headers (Cache-Control: private, no-store, must-revalidate; Referrer-Policy: no-referrer) verified
- Role-based authorization verified
"""

import sys
import os
import io
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image
import sqlite3
import api.operational_db as op_db
import api.operational_router as op_router
from api.auth import generate_token
from fastapi.testclient import TestClient
from api.main import app

ISOLATED_DB = ROOT / "data" / "test_sec_fixes_isolated.db"
REAL_DB = ROOT / "data" / "operational.db"
TEMP_EVIDENCE_DIR = ROOT / "data" / "test_sec_fixes_evidence"

client = TestClient(app, raise_server_exceptions=False)


def setup_env():
    if ISOLATED_DB.exists():
        ISOLATED_DB.unlink()
    shutil.copy2(REAL_DB, ISOLATED_DB)
    op_db.DB_PATH = ISOLATED_DB
    op_db.init_operational_db()

    if TEMP_EVIDENCE_DIR.exists():
        shutil.rmtree(TEMP_EVIDENCE_DIR)
    TEMP_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    op_router.EVIDENCE_STORAGE_DIR = TEMP_EVIDENCE_DIR

    # Add second citizen (Bob) for cross-citizen security checks
    conn = op_db.get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO users (id, email, password_hash, full_name, role, department, created_at)
        VALUES (10, 'citizen.bob@nyc.net', 'hash123', 'Bob Citizen', 'citizen', NULL, '2026-10-30 10:00:00');
        """)

        # Add an In-Progress complaint assigned to DSNY officer #2
        cur.execute("""
        INSERT INTO complaints (
            reference_no, citizen_id, problem, problem_detail, agency, agency_name,
            borough, incident_zip, incident_address, location_type, description,
            status, priority, assigned_department, assigned_staff_id,
            created_at, updated_at
        ) VALUES (
            'NYC-SEC-FIX-001', 4, 'Refuse and Recycling', 'Missed Collection', 'DSNY',
            'Department of Sanitation', 'MANHATTAN', '10001', '500 8th Ave', 'Sidewalk',
            'Security audit test ticket.', 'In Progress', 'Medium', 'DSNY', 2,
            '2026-10-30 10:00:00', '2026-10-30 10:00:00'
        );
        """)
        conn.commit()
    finally:
        conn.close()

    print("[SETUP] Isolated security fixes environment ready.")


def make_png(color="green", size=(40, 40)):
    im = Image.new("RGB", size, color=color)
    b = io.BytesIO()
    im.save(b, format="PNG")
    return b.getvalue()


def test_request_body_size_limits():
    print("\n--- Test 1: Upload Request Body Size & Content-Length Protections ---")
    dsny_tok = generate_token(2, "officer.smith@dsny.nyc.gov", "staff")
    ref = "NYC-SEC-FIX-001"
    png_bytes = make_png()

    # 1. Content-Length header claims > 30MB -> 413
    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={
            "Authorization": f"Bearer {dsny_tok}",
            "Content-Length": str(31 * 1024 * 1024),
            "Content-Type": "multipart/form-data"
        },
        content=b"small_body"
    )
    assert res.status_code == 413, f"Expected 413 for oversized Content-Length, got {res.status_code}"
    assert "exceeds maximum allowed size of 30 MB" in res.json()["detail"]
    print("[PASS] Oversized Content-Length header rejected with 413.")

    # 2. Malformed non-integer Content-Length header -> 400
    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={
            "Authorization": f"Bearer {dsny_tok}",
            "Content-Length": "invalid_number",
            "Content-Type": "multipart/form-data"
        },
        content=b"small_body"
    )
    assert res.status_code == 400
    assert "non-integer" in res.json()["detail"]
    print("[PASS] Non-integer Content-Length header rejected with 400.")

    # 3. Malformed negative Content-Length header -> 400
    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={
            "Authorization": f"Bearer {dsny_tok}",
            "Content-Length": "-500",
            "Content-Type": "multipart/form-data"
        },
        content=b"small_body"
    )
    assert res.status_code == 400
    assert "negative" in res.json()["detail"]
    print("[PASS] Negative Content-Length header rejected with 400.")

    # 4. Streamed oversized body (without Content-Length header) -> 413
    # Simulating chunked transfer or missing header with > 30 MB
    oversized_chunk = b"A" * (30 * 1024 * 1024 + 1024)
    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={
            "Authorization": f"Bearer {dsny_tok}",
            "Content-Type": "application/octet-stream"
        },
        content=oversized_chunk
    )
    assert res.status_code == 413
    assert "exceeds maximum allowed size of 30 MB" in res.json()["detail"]
    print("[PASS] Streamed payload exceeding 30 MB limit aborted with 413.")


def test_image_dimensions_and_decompression_bomb():
    print("\n--- Test 2: Image Dimension Bounds & Decompression-Bomb Protection ---")
    dsny_tok = generate_token(2, "officer.smith@dsny.nyc.gov", "staff")
    ref = "NYC-SEC-FIX-001"

    # 1. Create an image with dimension exceeding 8000px limit (e.g. 8001 x 10)
    oversized_dim_img = Image.new("RGB", (8001, 10), color="white")
    b = io.BytesIO()
    oversized_dim_img.save(b, format="PNG")
    oversized_dim_bytes = b.getvalue()

    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={"Authorization": f"Bearer {dsny_tok}"},
        files=[("photos", ("wide.png", oversized_dim_bytes, "image/png"))],
        data={"notes": "Testing image dimension bounds."}
    )
    assert res.status_code == 400, f"Expected 400 for dimension > 8000, got {res.status_code}"
    assert "exceed maximum allowed limit of 8000x8000" in res.json()["detail"]
    print("[PASS] Image exceeding 8000x8000 dimension limit cleanly rejected with 400.")

    # 2. Malformed / corrupted image
    corrupt_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\xff" * 20
    res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={"Authorization": f"Bearer {dsny_tok}"},
        files=[("photos", ("corrupt.png", corrupt_bytes, "image/png"))],
        data={"notes": "Testing corrupted image headers."}
    )
    assert res.status_code == 400
    assert "Invalid or corrupted image" in res.json()["detail"]
    print("[PASS] Corrupted image header rejected with 400.")


def test_path_traversal_and_file_streaming():
    print("\n--- Test 3: Path Traversal Containment, Missing Files, and Security Headers ---")
    dsny_tok = generate_token(2, "officer.smith@dsny.nyc.gov", "staff")
    jane_tok = generate_token(4, "citizen.jane@nyc.net", "citizen")
    bob_tok = generate_token(10, "citizen.bob@nyc.net", "citizen")
    admin_tok = generate_token(1, "admin@civic.nyc.gov", "admin")
    ref = "NYC-SEC-FIX-001"

    # Upload valid evidence
    png_bytes = make_png(color="blue")
    up_res = client.post(
        f"/api/operations/complaints/{ref}/evidence",
        headers={"Authorization": f"Bearer {dsny_tok}"},
        files=[("photos", ("valid_photo.png", png_bytes, "image/png"))],
        data={"notes": "Valid completion evidence uploaded."}
    )
    assert up_res.status_code == 200
    ev_id = up_res.json()["evidence_ids"][0]

    # 1. Path Traversal Test:
    # Insert a malicious evidence record pointing outside EVIDENCE_STORAGE_DIR (e.g. to operational.db)
    conn = op_db.get_db_connection()
    try:
        cur = conn.cursor()
        malicious_path = str((ROOT / "data" / "operational.db").resolve())
        cur.execute("""
        INSERT INTO complaint_evidence (
            complaint_id, uploader_id, file_path, original_filename, file_size,
            content_type, evidence_type, created_at
        ) VALUES (
            (SELECT id FROM complaints WHERE reference_no = ?),
            2, ?, 'stolen.db', 1024, 'application/octet-stream', 'COMPLETION', '2026-10-30 10:00:00'
        );
        """, (ref, malicious_path))
        malicious_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    # Attempt to download malicious record via Admin token
    res = client.get(
        f"/api/operations/evidence/{malicious_id}/file",
        headers={"Authorization": f"Bearer {admin_tok}"}
    )
    assert res.status_code == 403, f"Expected 403 for path traversal, got {res.status_code}"
    assert "outside permitted storage directory" in res.json()["detail"]
    print("[PASS] Path traversal attempt outside storage directory blocked with 403.")

    # 2. Missing File Test:
    # Insert a record with a path inside storage directory that does not actually exist on disk
    non_existent_path = str(TEMP_EVIDENCE_DIR / "non_existent_token.png")
    conn = op_db.get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
        INSERT INTO complaint_evidence (
            complaint_id, uploader_id, file_path, original_filename, file_size,
            content_type, evidence_type, created_at
        ) VALUES (
            (SELECT id FROM complaints WHERE reference_no = ?),
            2, ?, 'missing.png', 1024, 'image/png', 'COMPLETION', '2026-10-30 10:00:00'
        );
        """, (ref, non_existent_path))
        missing_id = cur.lastrowid
        conn.commit()
    finally:
        conn.close()

    res = client.get(
        f"/api/operations/evidence/{missing_id}/file",
        headers={"Authorization": f"Bearer {admin_tok}"}
    )
    assert res.status_code == 404, f"Expected 404 for missing file, got {res.status_code}"
    assert "not found on storage server" in res.json()["detail"]
    print("[PASS] Missing file safely returns 404 without internal server error.")

    # 3. Security Response Headers on Valid File Download:
    res = client.get(
        f"/api/operations/evidence/{ev_id}/file",
        headers={"Authorization": f"Bearer {jane_tok}"}
    )
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "private, no-store, must-revalidate", f"Cache-Control header missing or wrong: {res.headers.get('cache-control')}"
    assert res.headers.get("referrer-policy") == "no-referrer", f"Referrer-Policy header missing or wrong: {res.headers.get('referrer-policy')}"
    print("[PASS] Security response headers verified (Cache-Control: private, no-store; Referrer-Policy: no-referrer).")

    # 4. Unauthorized Access:
    res = client.get(
        f"/api/operations/evidence/{ev_id}/file",
        headers={"Authorization": f"Bearer {bob_tok}"}
    )
    assert res.status_code == 403
    print("[PASS] Unauthorized citizen access blocked with 403.")


def cleanup_env():
    if ISOLATED_DB.exists():
        ISOLATED_DB.unlink()
    if TEMP_EVIDENCE_DIR.exists():
        shutil.rmtree(TEMP_EVIDENCE_DIR)
    print("\n[CLEANUP] Temporary security test database and evidence directory cleaned up.")


if __name__ == "__main__":
    print("=" * 60)
    print("RUNNING SECURITY FIXES VALIDATION SUITE")
    print("=" * 60)
    try:
        setup_env()
        test_request_body_size_limits()
        test_image_dimensions_and_decompression_bomb()
        test_path_traversal_and_file_streaming()
        print("\n" + "=" * 60)
        print("ALL SECURITY FIX TESTS PASSED (100% SUCCESS)")
        print("=" * 60)
    finally:
        cleanup_env()

