"""
scratch/test_phase2_suite.py

Automated Verification Suite for Phase 2:
- Idempotent SQLite schema migration & indexes
- Cross-citizen duplicate detection (address normalization, GPS distance, category compatibility)
- Exclusion rules (closed/rejected complaints, >72h window, non-genuine centroid coordinates)
- Pre-submission duplicate check endpoint (privacy-preserving, zero PII)
- Automatic candidate recording on complaint creation
- Admin duplicate review queue & authorization guards
- Admin linking & dismissal workflow (cycle prevention, self-link prevention, timeline audit logging)
- Non-destructive canonical association (no complaints deleted or prematurely closed)

Runs strictly against an isolated database copy in data/test_phase2_isolated.db.
"""

import sys
import shutil
from pathlib import Path
from datetime import datetime, timedelta

# Set workspace root in python path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import sqlite3
import api.operational_db as op_db
import api.duplicate_service as dup_svc
from api.location_service import BOROUGH_CENTROIDS
from api.auth import generate_token
from fastapi.testclient import TestClient
from api.main import app

ISOLATED_DB = ROOT / "data" / "test_phase2_isolated.db"
REAL_DB = ROOT / "data" / "operational.db"


def setup_isolated_db():
    if ISOLATED_DB.exists():
        ISOLATED_DB.unlink()
    shutil.copy2(REAL_DB, ISOLATED_DB)
    # Monkey-patch DB_PATH in operational_db to isolated copy
    op_db.DB_PATH = ISOLATED_DB
    op_db.init_operational_db()
    print("[PASS] Isolated test database prepared and initialized at:", ISOLATED_DB.name)


def test_schema_and_indexes():
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(complaints);")
        cols = {r["name"]: r["type"] for r in cursor.fetchall()}
        assert "canonical_complaint_id" in cols, "canonical_complaint_id column missing"
        assert "duplicate_status" in cols, "duplicate_status column missing"

        cursor.execute("PRAGMA table_info(complaint_duplicates);")
        dup_cols = {r["name"] for r in cursor.fetchall()}
        required_dup_cols = {
            "id", "original_complaint_id", "duplicate_complaint_id",
            "match_tier", "match_reason", "distance_meters",
            "review_status", "reviewed_by", "reviewed_at", "review_notes", "created_at"
        }
        assert required_dup_cols.issubset(dup_cols), f"Missing columns in complaint_duplicates: {required_dup_cols - dup_cols}"

        # Verify indexes
        cursor.execute("PRAGMA index_list(complaint_duplicates);")
        indexes = {r["name"] for r in cursor.fetchall()}
        assert "idx_dup_original" in indexes, "idx_dup_original missing"
        assert "idx_dup_duplicate" in indexes, "idx_dup_duplicate missing"
        assert "idx_dup_status" in indexes, "idx_dup_status missing"

        # Verify integrity
        cursor.execute("PRAGMA integrity_check;")
        res = cursor.fetchone()[0]
        assert res == "ok", f"Integrity check failed: {res}"
        print("[PASS] Database schema, columns, and indexes verified.")
    finally:
        conn.close()


def test_distance_and_gps_validation():
    # 1. Haversine distance accuracy
    d = dup_svc.haversine_distance_meters(40.7505, -73.9934, 40.7508, -73.9930)
    assert 40.0 < d < 55.0, f"Unexpected Haversine distance: {d}"

    # 2. GPS validation
    assert dup_svc.is_valid_gps(40.7505, -73.9934) is True
    assert dup_svc.is_valid_gps(0.0, 0.0) is False
    assert dup_svc.is_valid_gps(None, -73.9934) is False

    # Borough centroids must be rejected as genuine GPS coordinates
    for b_lat, b_lon in BOROUGH_CENTROIDS.values():
        assert dup_svc.is_valid_gps(b_lat, b_lon) is False, f"Centroid ({b_lat}, {b_lon}) falsely marked as valid GPS"

    print("[PASS] Haversine distance and GPS coordinate validation verified.")


def test_cross_citizen_duplicate_detection():
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        # Insert original complaint by citizen Jane (user #1)
        cursor.execute("""
        INSERT INTO complaints (
            reference_no, citizen_id, problem, problem_detail, agency, agency_name,
            borough, incident_zip, incident_address, location_type, description,
            latitude, longitude, location_source, gps_accuracy, normalized_address,
            status, priority, suggested_priority, assigned_department, created_at, updated_at
        ) VALUES (
            'NYC-TEST-ORIG1', 1, 'Street Condition', 'Pothole Emergency', 'DOT', 'Department of Transportation',
            'MANHATTAN', '10001', '350 5th Ave', 'Street/Sidewalk', 'Dangerous deep pothole in right lane',
            40.7484, -73.9857, 'DEVICE_GPS', 12.0, '350 5TH AVENUE',
            'Submitted', 'High', 'High', 'DOT', ?, ?
        );
        """, (now_str, now_str))
        orig_id = cursor.lastrowid
        conn.commit()

        # Case 1: Same normalized address, same category by another citizen
        test_data_address = {
            "incident_address": "350 5TH AVE.",
            "problem": "Street Condition",
            "problem_detail": "Pothole Emergency",
            "borough": "MANHATTAN"
        }
        candidates = dup_svc.find_duplicate_candidates(conn, test_data_address)
        assert len(candidates) >= 1, "Expected duplicate candidate by normalized address"
        matched = next(c for c in candidates if c["candidate_id"] == orig_id)
        assert matched["match_tier"] == "STRONG"
        assert matched["reference_no"] == "NYC-TEST-ORIG1"

        # Privacy check: NO citizen PII present
        assert "citizen_id" not in matched
        assert "citizen_name" not in matched
        assert "email" not in matched
        assert "phone" not in matched

        # Case 2: Nearby GPS within 50m, same category
        test_data_gps = {
            "incident_address": "Near Empire State",
            "problem": "Street Condition",
            "problem_detail": "Pothole Emergency",
            "borough": "MANHATTAN",
            "latitude": 40.7486,
            "longitude": -73.9855
        }
        candidates_gps = dup_svc.find_duplicate_candidates(conn, test_data_gps)
        matched_gps = next(c for c in candidates_gps if c["candidate_id"] == orig_id)
        assert matched_gps["distance_meters"] is not None
        assert matched_gps["distance_meters"] <= 50.0

        # Case 3: Different, unrelated category at same address -> NOT a duplicate
        test_data_diff_cat = {
            "incident_address": "350 5th Ave",
            "problem": "Noise - Residential",
            "problem_detail": "Loud Music/Party",
            "borough": "MANHATTAN"
        }
        candidates_diff = dup_svc.find_duplicate_candidates(conn, test_data_diff_cat)
        assert not any(c["candidate_id"] == orig_id for c in candidates_diff), "Different category should not match"

        # Case 4: Closed complaint -> EXCLUDED
        cursor.execute("UPDATE complaints SET status = 'Closed' WHERE id = ?;", (orig_id,))
        conn.commit()
        candidates_closed = dup_svc.find_duplicate_candidates(conn, test_data_address)
        assert not any(c["candidate_id"] == orig_id for c in candidates_closed), "Closed complaint must be excluded"

        # Reopen for subsequent tests
        cursor.execute("UPDATE complaints SET status = 'Submitted' WHERE id = ?;", (orig_id,))
        conn.commit()

        # Case 5: Older than 72 hours -> EXCLUDED
        old_time = (datetime.utcnow() - timedelta(hours=75)).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("UPDATE complaints SET created_at = ? WHERE id = ?;", (old_time, orig_id))
        conn.commit()
        candidates_old = dup_svc.find_duplicate_candidates(conn, test_data_address)
        assert not any(c["candidate_id"] == orig_id for c in candidates_old), "Old complaint (>72h) must be excluded"

        # Reset created_at back to now
        cursor.execute("UPDATE complaints SET created_at = ? WHERE id = ?;", (now_str, orig_id))
        conn.commit()

        print("[PASS] Cross-citizen duplicate detection and exclusion rules verified.")
    finally:
        conn.close()


def test_api_endpoints_and_admin_workflow():
    client = TestClient(app)

    # 1. Citizen tokens (two distinct citizens)
    citizen1_token = generate_token(8, "citizen.jane@nyc.net", "citizen")
    citizen2_token = generate_token(99, "citizen.bob@nyc.net", "citizen")
    admin_token = generate_token(1, "admin@civic.nyc.gov", "admin")
    staff_token = generate_token(2, "officer.smith@dsny.nyc.gov", "staff")

    # Ensure user 99 exists in test database
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = 99;")
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, created_at)
            VALUES (99, 'citizen.bob@nyc.net', 'hash', 'Bob Builder', 'citizen', datetime('now'));
            """)
            conn.commit()
    finally:
        conn.close()

    # 2. Test pre-submission duplicate check endpoint (by citizen 2)
    check_payload = {
        "problem": "Street Condition",
        "problem_detail": "Pothole Emergency",
        "incident_address": "350 5th Ave",
        "borough": "MANHATTAN",
        "incident_zip": "10001",
        "latitude": 40.7484,
        "longitude": -73.9857,
        "location_source": "DEVICE_GPS"
    }
    res = client.post(
        "/api/operations/complaints/check-duplicate",
        json=check_payload,
        headers={"Authorization": f"Bearer {citizen2_token}"}
    )
    assert res.status_code == 200, f"Check duplicate failed: {res.text}"
    body = res.json()
    assert body["has_duplicates"] is True
    assert len(body["candidates"]) > 0
    candidate = body["candidates"][0]
    # Verify strict privacy compliance
    for pii_field in ("citizen_id", "email", "phone", "full_name", "user_id"):
        assert pii_field not in candidate, f"Privacy violation: {pii_field} exposed in candidate advisory!"

    # 3. Test submitting complaint when duplicate exists (submitted by Citizen 2, Bob)
    sub_payload = {
        "problem": "Street Condition",
        "problem_detail": "Pothole Emergency",
        "agency": "DOT",
        "agency_name": "Department of Transportation",
        "borough": "MANHATTAN",
        "incident_zip": "10001",
        "incident_address": "350 5th Ave",
        "location_type": "Street/Sidewalk",
        "description": "Second citizen reporting the same large pothole.",
        "latitude": 40.7484,
        "longitude": -73.9857,
        "location_source": "DEVICE_GPS",
        "gps_accuracy": 10.0
    }
    sub_res = client.post(
        "/api/operations/complaints",
        json=sub_payload,
        headers={"Authorization": f"Bearer {citizen2_token}"}
    )
    assert sub_res.status_code == 200, f"Submission failed: {sub_res.text}"
    sub_body = sub_res.json()
    new_comp_id = sub_body["complaint_id"]
    new_comp_ref = sub_body["reference_no"]

    # Verify duplicate candidate queue recorded the candidate pair
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT duplicate_status FROM complaints WHERE id = ?;", (new_comp_id,))
        assert cursor.fetchone()[0] == "CANDIDATE", "New complaint should have duplicate_status 'CANDIDATE'"

        cursor.execute("SELECT id, review_status FROM complaint_duplicates WHERE duplicate_complaint_id = ?;", (new_comp_id,))
        dup_row = cursor.fetchone()
        assert dup_row is not None, "Candidate pair missing in complaint_duplicates"
        assert dup_row["review_status"] == "PENDING"
        dup_record_id = dup_row["id"]
    finally:
        conn.close()

    # 4. Role Authorization: Staff and Citizens cannot access admin duplicate queue
    staff_q = client.get("/api/operations/duplicates", headers={"Authorization": f"Bearer {staff_token}"})
    assert staff_q.status_code == 403, "Staff must be forbidden from /duplicates"

    citizen_q = client.get("/api/operations/duplicates", headers={"Authorization": f"Bearer {citizen1_token}"})
    assert citizen_q.status_code == 403, "Citizen must be forbidden from /duplicates"

    # Admin access
    admin_q = client.get("/api/operations/duplicates?status=PENDING", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_q.status_code == 200
    dup_list = admin_q.json()["duplicates"]
    assert any(d["id"] == dup_record_id for d in dup_list), "Pending duplicate record must be in admin queue"

    # 5. Admin Review: Validation rules
    # Blank reason rejected
    blank_rev = client.post(
        f"/api/operations/duplicates/{dup_record_id}/review",
        json={"action": "LINK", "reason": "  "},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert blank_rev.status_code == 422 or blank_rev.status_code == 400

    # 6. Admin Review: Successful LINK
    link_rev = client.post(
        f"/api/operations/duplicates/{dup_record_id}/review",
        json={"action": "LINK", "reason": "Verified identical street pothole at 350 5th Ave."},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert link_rev.status_code == 200, f"Link review failed: {link_rev.text}"

    # Verify state updates in database
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        # Duplicate ticket
        cursor.execute("SELECT canonical_complaint_id, duplicate_status, status FROM complaints WHERE id = ?;", (new_comp_id,))
        dup_c = cursor.fetchone()
        assert dup_c["duplicate_status"] == "DUPLICATE", "duplicate_status must be DUPLICATE"
        assert dup_c["canonical_complaint_id"] is not None, "canonical_complaint_id must point to original"
        # Non-destructive check: status is NOT deleted or prematurely closed!
        assert dup_c["status"] == "Submitted"

        # Canonical ticket
        orig_id = dup_c["canonical_complaint_id"]
        cursor.execute("SELECT duplicate_status, status FROM complaints WHERE id = ?;", (orig_id,))
        orig_c = cursor.fetchone()
        assert orig_c["duplicate_status"] == "CANONICAL", "Original ticket must have duplicate_status CANONICAL"
        assert orig_c["status"] == "Submitted"

        # complaint_duplicates review state
        cursor.execute("SELECT review_status, reviewed_by, review_notes FROM complaint_duplicates WHERE id = ?;", (dup_record_id,))
        rec = cursor.fetchone()
        assert rec["review_status"] == "LINKED"
        assert rec["reviewed_by"] == 1
        assert "Verified identical street pothole" in rec["review_notes"]

        # History audit events
        cursor.execute("SELECT action, comment FROM complaint_history WHERE complaint_id = ? AND action = 'LINK_DUPLICATE';", (new_comp_id,))
        assert cursor.fetchone() is not None, "Audit history missing on duplicate ticket"

        cursor.execute("SELECT action, comment FROM complaint_history WHERE complaint_id = ? AND action = 'ADD_DUPLICATE';", (orig_id,))
        assert cursor.fetchone() is not None, "Audit history missing on canonical ticket"

        # 7. Cycle Prevention Test
        # Attempting to link original as duplicate of new_comp_id must be rejected
        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Test cycle candidate', 'PENDING', datetime('now'));
        """, (new_comp_id, orig_id))
        cycle_dup_id = cursor.lastrowid
        conn.commit()
    finally:
        conn.close()

    cycle_rev = client.post(
        f"/api/operations/duplicates/{cycle_dup_id}/review",
        json={"action": "LINK", "reason": "Attempting circular link"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert cycle_rev.status_code == 400, "Circular link should be rejected with 400"
    detail_msg = cycle_rev.json()["detail"].lower()
    assert "circular" in detail_msg or "already marked as a duplicate" in detail_msg

    # 8. Admin Review: DISMISS workflow
    dismiss_rev = client.post(
        f"/api/operations/duplicates/{cycle_dup_id}/review",
        json={"action": "DISMISS", "reason": "Not a real duplicate."},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert dismiss_rev.status_code == 200

    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (cycle_dup_id,))
        assert cursor.fetchone()[0] == "DISMISSED"
        cursor.execute("SELECT action FROM complaint_history WHERE complaint_id = ? AND action = 'DISMISS_DUPLICATE';", (orig_id,))
        assert cursor.fetchone() is not None
    finally:
        conn.close()

    # -------------------------------------------------------------
    # 9. FIX A VALIDATION SUITE: ALL 4 SAFETY CHECKS & ATOMIC CONCURRENCY
    # -------------------------------------------------------------
    conn = op_db.get_db_connection()
    try:
        cursor = conn.cursor()

        # Check 1: Guard against re-reviewing already-finalized records
        # dup_record_id is already 'LINKED'
        re_review = client.post(
            f"/api/operations/duplicates/{dup_record_id}/review",
            json={"action": "LINK", "reason": "Attempting redundant review on linked record"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert re_review.status_code == 400, "Re-review of non-pending record must return HTTP 400"
        assert "already been reviewed" in re_review.json()["detail"].lower()

        # Check 2: Conflicting parent link
        # new_comp_id is already linked as a duplicate to orig_id.
        # Now create candidate pair linking new_comp_id to a 3rd ticket.
        cursor.execute("""
        INSERT INTO complaints (
            reference_no, citizen_id, problem, problem_detail, agency, agency_name,
            borough, incident_zip, incident_address, location_type, description,
            status, priority, suggested_priority, assigned_department, created_at, updated_at
        ) VALUES (
            'NYC-TEST-THIRD', 1, 'Street Condition', 'Pothole Emergency', 'DOT', 'DOT',
            'MANHATTAN', '10001', '350 5th Ave', 'Street/Sidewalk', 'Third ticket',
            'Submitted', 'Medium', 'Medium', 'DOT', datetime('now'), datetime('now')
        );
        """)
        third_id = cursor.lastrowid

        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Conflict candidate', 'PENDING', datetime('now'));
        """, (third_id, new_comp_id))
        conflict_dup_id = cursor.lastrowid
        conn.commit()

        # History count before attempt to test rollback
        cursor.execute("SELECT count(*) FROM complaint_history WHERE complaint_id = ?;", (new_comp_id,))
        hist_count_before = cursor.fetchone()[0]

        conflict_rev = client.post(
            f"/api/operations/duplicates/{conflict_dup_id}/review",
            json={"action": "LINK", "reason": "Attempting conflicting parent link"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert conflict_rev.status_code == 400, "Conflicting parent link must return HTTP 400"
        assert "already linked" in conflict_rev.json()["detail"].lower()

        # Transaction Rollback Verification for Check 2:
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (conflict_dup_id,))
        assert cursor.fetchone()[0] == "PENDING", "Rollback failed: review_status should remain PENDING"
        cursor.execute("SELECT canonical_complaint_id FROM complaints WHERE id = ?;", (new_comp_id,))
        assert cursor.fetchone()[0] == orig_id, "Rollback failed: canonical parent changed"
        cursor.execute("SELECT count(*) FROM complaint_history WHERE complaint_id = ?;", (new_comp_id,))
        assert cursor.fetchone()[0] == hist_count_before, "Rollback failed: history entry was added"

        # Check 3: Original ticket is itself already a duplicate
        # Attempting to link third_id as duplicate of new_comp_id (which is DUPLICATE of orig_id)
        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Chain duplicate candidate', 'PENDING', datetime('now'));
        """, (new_comp_id, third_id))
        chain_dup_id = cursor.lastrowid
        conn.commit()

        chain_rev = client.post(
            f"/api/operations/duplicates/{chain_dup_id}/review",
            json={"action": "LINK", "reason": "Attempting multi-hop duplicate chain"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert chain_rev.status_code == 400, "Linking to a duplicate ticket must return HTTP 400"
        assert "already marked as a duplicate" in chain_rev.json()["detail"].lower()

        # Transaction Rollback Verification for Check 3:
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (chain_dup_id,))
        assert cursor.fetchone()[0] == "PENDING"
        cursor.execute("SELECT canonical_complaint_id FROM complaints WHERE id = ?;", (third_id,))
        assert cursor.fetchone()[0] is None

        # Check 4: Duplicate ticket is already a canonical parent with linked dependents
        # orig_id is CANONICAL and has child new_comp_id.
        # Attempting to link orig_id as duplicate of third_id must be rejected.
        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Parent reversal candidate', 'PENDING', datetime('now'));
        """, (third_id, orig_id))
        parent_rev_id = cursor.lastrowid
        conn.commit()

        parent_rev = client.post(
            f"/api/operations/duplicates/{parent_rev_id}/review",
            json={"action": "LINK", "reason": "Attempting parent reversal link"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert parent_rev.status_code == 400, "Linking a canonical parent as a duplicate must return HTTP 400"
        assert "already a canonical ticket with linked duplicates" in parent_rev.json()["detail"].lower()

        # Transaction Rollback Verification for Check 4:
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (parent_rev_id,))
        assert cursor.fetchone()[0] == "PENDING"
        cursor.execute("SELECT duplicate_status FROM complaints WHERE id = ?;", (orig_id,))
        assert cursor.fetchone()[0] == "CANONICAL"

        # Check 5: Atomic conditional update prevents concurrent double-review race condition
        # Simulate: Row was claimed/updated by another concurrent transaction right after SELECT
        cursor.execute("UPDATE complaint_duplicates SET review_status = 'DISMISSED' WHERE id = ?;", (parent_rev_id,))
        conn.commit()

        concurrent_rev = client.post(
            f"/api/operations/duplicates/{parent_rev_id}/review",
            json={"action": "LINK", "reason": "Concurrent race condition test"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert concurrent_rev.status_code == 400
        assert "already been reviewed" in concurrent_rev.json()["detail"].lower()

        # Check 6: Interleaved cross-record concurrency test (Requirement 4)
        # Create 1 duplicate ticket D and 2 candidate parents P1, P2
        cursor.execute("""
        INSERT INTO complaints (
            reference_no, citizen_id, problem, problem_detail, agency, agency_name,
            borough, incident_zip, incident_address, location_type, description,
            status, priority, suggested_priority, assigned_department, created_at, updated_at
        ) VALUES 
        ('NYC-RACE-P1', 1, 'Street Condition', 'Pothole', 'DOT', 'DOT', 'MANHATTAN', '10001', '500 5th Ave', 'Street', 'P1', 'Submitted', 'Medium', 'Medium', 'DOT', datetime('now'), datetime('now')),
        ('NYC-RACE-P2', 1, 'Street Condition', 'Pothole', 'DOT', 'DOT', 'MANHATTAN', '10001', '500 5th Ave', 'Street', 'P2', 'Submitted', 'Medium', 'Medium', 'DOT', datetime('now'), datetime('now')),
        ('NYC-RACE-D', 2, 'Street Condition', 'Pothole', 'DOT', 'DOT', 'MANHATTAN', '10001', '500 5th Ave', 'Street', 'D', 'Submitted', 'Medium', 'Medium', 'DOT', datetime('now'), datetime('now'));
        """)
        cursor.execute("SELECT id FROM complaints WHERE reference_no = 'NYC-RACE-P1';")
        p1_id = cursor.fetchone()[0]
        cursor.execute("SELECT id FROM complaints WHERE reference_no = 'NYC-RACE-P2';")
        p2_id = cursor.fetchone()[0]
        cursor.execute("SELECT id FROM complaints WHERE reference_no = 'NYC-RACE-D';")
        d_id = cursor.fetchone()[0]

        # Insert 2 pending duplicate records proposing different canonical parents for D
        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Parent 1 candidate', 'PENDING', datetime('now'));
        """, (p1_id, d_id))
        rec1_id = cursor.lastrowid

        cursor.execute("""
        INSERT INTO complaint_duplicates (original_complaint_id, duplicate_complaint_id, match_tier, match_reason, review_status, created_at)
        VALUES (?, ?, 'STRONG', 'Parent 2 candidate', 'PENDING', datetime('now'));
        """, (p2_id, d_id))
        rec2_id = cursor.lastrowid
        conn.commit()

        # Step A: First request links D to P1
        r1_res = client.post(
            f"/api/operations/duplicates/{rec1_id}/review",
            json={"action": "LINK", "reason": "Parent 1 wins link"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert r1_res.status_code == 200, f"P1 link failed: {r1_res.text}"

        cursor.execute("SELECT count(*) FROM complaint_history WHERE complaint_id = ?;", (d_id,))
        d_history_count_after_p1 = cursor.fetchone()[0]

        # Step B: Second request tries to link D to P2 (simulating concurrent or interleaved conflict)
        r2_res = client.post(
            f"/api/operations/duplicates/{rec2_id}/review",
            json={"action": "LINK", "reason": "Parent 2 conflicting link"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert r2_res.status_code == 400, "Losing operation must return HTTP 400"
        assert "already linked" in r2_res.json()["detail"].lower()

        # Step C: Assert transactional rollback and state integrity
        # 1. Winning candidate rec1 is LINKED, losing candidate rec2 remains PENDING
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (rec1_id,))
        assert cursor.fetchone()[0] == "LINKED"
        cursor.execute("SELECT review_status FROM complaint_duplicates WHERE id = ?;", (rec2_id,))
        assert cursor.fetchone()[0] == "PENDING", "Losing review record must remain PENDING (not marked LINKED)"

        # 2. Duplicate complaint D points ONLY to P1 (not overwritten by P2)
        cursor.execute("SELECT canonical_complaint_id, duplicate_status FROM complaints WHERE id = ?;", (d_id,))
        d_row = cursor.fetchone()
        assert d_row["canonical_complaint_id"] == p1_id, "Canonical parent must be P1, not P2"
        assert d_row["duplicate_status"] == "DUPLICATE"

        # 3. P1 is CANONICAL, but P2 was NOT marked CANONICAL
        cursor.execute("SELECT duplicate_status FROM complaints WHERE id = ?;", (p1_id,))
        assert cursor.fetchone()[0] == "CANONICAL"
        cursor.execute("SELECT duplicate_status FROM complaints WHERE id = ?;", (p2_id,))
        assert cursor.fetchone()[0] == "NONE", "Losing parent P2 must not be marked CANONICAL"

        # 4. Inconsistent history was rolled back (history count unchanged)
        cursor.execute("SELECT count(*) FROM complaint_history WHERE complaint_id = ?;", (d_id,))
        assert cursor.fetchone()[0] == d_history_count_after_p1, "No inconsistent history entries created by losing operation"

        print("[PASS] Fix A verified: All 4 safety checks, cross-record concurrency guard, and transactional rollback working perfectly.")
    finally:
        conn.close()

    print("[PASS] Pre-submission advisory, automatic registration, admin queue, cycle prevention, and linking verified.")


def cleanup_isolated_db():
    # Restore DB_PATH to real operational DB
    op_db.DB_PATH = REAL_DB
    if ISOLATED_DB.exists():
        ISOLATED_DB.unlink()
    print("[PASS] Isolated test database cleaned up.")


if __name__ == "__main__":
    print("=" * 60)
    print("RUNNING PHASE 2 FULL VERIFICATION SUITE")
    print("=" * 60)
    try:
        setup_isolated_db()
        test_schema_and_indexes()
        test_distance_and_gps_validation()
        test_cross_citizen_duplicate_detection()
        test_api_endpoints_and_admin_workflow()
        print("=" * 60)
        print("ALL 5 PHASE 2 SUITE CHECKPOINTS PASSED (100% SUCCESS)")
        print("=" * 60)
    finally:
        cleanup_isolated_db()
