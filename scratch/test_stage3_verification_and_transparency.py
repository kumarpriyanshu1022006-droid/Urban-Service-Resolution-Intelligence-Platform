"""
Test Suite: Phase 3 Stage 3 - Admin Verification Console & Citizen Resolution Transparency
Tests admin approval, rejection, mandatory rejection reason, repeated-review prevention,
role restrictions, and citizen ownership transparency across pending, rework, and closed states.
"""
import os
import sys
import shutil
import sqlite3
import io
from pathlib import Path
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def build_test_image(color="blue", size=(300, 300)):
    buf = io.BytesIO()
    im = Image.new("RGB", size, color=color)
    im.save(buf, format="JPEG")
    return buf.getvalue()

def run_tests():
    test_db = "data/test_stage3_isolated.db"
    test_evidence_dir = "data/test_stage3_evidence"

    if os.path.exists(test_db):
        os.remove(test_db)
    if os.path.exists(test_evidence_dir):
        shutil.rmtree(test_evidence_dir)
    os.makedirs(test_evidence_dir, exist_ok=True)
    shutil.copy("data/operational.db", test_db)

    import api.operational_db as op_db
    import api.operational_router as op_router
    from fastapi.testclient import TestClient
    from api.main import app
    from api.auth import generate_token

    test_db_path = Path(test_db).resolve()
    test_ev_path = Path(test_evidence_dir).resolve()

    op_db.DB_PATH = test_db_path
    op_router.EVIDENCE_STORAGE_DIR = test_ev_path

    client = TestClient(app)

    print("============================================================")
    print("RUNNING PHASE 3 STAGE 3 VERIFICATION & TRANSPARENCY SUITE")
    print("============================================================")

    # 1. Authenticate personas
    # Admin (ID 1)
    admin_token = generate_token(1, "admin@civic.nyc.gov", "admin")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Staff (ID 2 - DSNY Officer)
    dsny_token = generate_token(2, "officer.kowalski@dsny.nyc.gov", "staff")
    dsny_headers = {"Authorization": f"Bearer {dsny_token}"}

    # Citizen Owner (ID 4 - Citizen Jane, owns complaints in initial DB)
    jane_token = generate_token(4, "citizen.jane@nyc.net", "citizen")
    jane_headers = {"Authorization": f"Bearer {jane_token}"}

    # Second Citizen Non-Owner (ID 10 - Citizen Bob)
    conn = sqlite3.connect(test_db)
    cur = conn.cursor()
    cur.execute("""
    INSERT INTO users (id, email, password_hash, full_name, role, department, created_at)
    VALUES (10, 'citizen.bob@nyc.net', 'hash123', 'Bob Citizen', 'citizen', NULL, '2026-10-30 10:00:00');
    """)
    conn.commit()
    conn.close()

    bob_token = generate_token(10, "citizen.bob@nyc.net", "citizen")
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    print("[PASS] Personas authenticated: Admin (1), Staff (2), Citizen Owner Jane (4), Citizen Non-Owner Bob (10).")

    # 2. Pick a complaint owned by Jane (ID 4), assign to DSNY officer #2, set In Progress
    conn = sqlite3.connect(test_db)
    cur = conn.cursor()
    cur.execute("SELECT reference_no FROM complaints WHERE citizen_id = 4 LIMIT 1;")
    target_ref = cur.fetchone()[0]
    cur.execute("""
    UPDATE complaints 
    SET assigned_department = 'DSNY', 
        assigned_staff_id = 2, 
        status = 'In Progress',
        updated_at = '2026-10-30 11:00:00'
    WHERE reference_no = ?;
    """, (target_ref,))
    conn.commit()
    conn.close()
    print(f"[PASS] Complaint {target_ref} prepared for DSNY staff #2 with status 'In Progress'.")

    # 3. Staff uploads completion evidence -> transitions to 'Resolved - Pending Verification'
    img_bytes = build_test_image("cyan")
    boundary = "----WebKitFormBoundaryStage3Test"
    upload_body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="notes"\r\n\r\n'
        "Cleared all roadway debris and swept curb clean.\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="completion_details"\r\n\r\n'
        '{"root_cause": "Spilled construction refuse", "equipment": "Sweeper Truck #12"}\r\n'
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="latitude"\r\n\r\n'
        "40.7306\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="longitude"\r\n\r\n'
        "-73.9352\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="gps_accuracy"\r\n\r\n'
        "3.5\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="field_photo1.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + img_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

    upload_res = client.post(
        f"/api/operations/complaints/{target_ref}/evidence",
        data=upload_body,
        headers={"Authorization": f"Bearer {dsny_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert upload_res.status_code == 200, f"Evidence upload failed: {upload_res.text}"
    assert upload_res.json()["status"] == "Resolved - Pending Verification"
    print(f"[PASS] Field evidence uploaded. Status updated to 'Resolved - Pending Verification'.")

    # 4. Role restrictions on Admin Verification endpoint
    # Citizen cannot verify
    res = client.post(f"/api/operations/complaints/{target_ref}/verify", json={"action": "APPROVE"}, headers=jane_headers)
    assert res.status_code == 403, f"Expected 403 for citizen verify, got {res.status_code}"

    # Staff cannot verify
    res = client.post(f"/api/operations/complaints/{target_ref}/verify", json={"action": "APPROVE"}, headers=dsny_headers)
    assert res.status_code == 403, f"Expected 403 for staff verify, got {res.status_code}"

    # Unauthenticated cannot verify
    res = client.post(f"/api/operations/complaints/{target_ref}/verify", json={"action": "APPROVE"})
    assert res.status_code == 401, f"Expected 401 for unauth verify, got {res.status_code}"
    print("[PASS] Role restrictions verified: Citizen (403), Staff (403), Unauth (401).")

    # 5. Mandatory rejection reason validation
    # Missing reason
    res = client.post(f"/api/operations/complaints/{target_ref}/verify", json={"action": "REJECT"}, headers=admin_headers)
    assert res.status_code == 400
    assert "mandatory rejection reason" in res.json()["detail"].lower()

    # Short reason (< 5 chars)
    res = client.post(f"/api/operations/complaints/{target_ref}/verify", json={"action": "REJECT", "rejection_reason": "bad"}, headers=admin_headers)
    assert res.status_code == 400
    assert "minimum 5 characters" in res.json()["detail"].lower()
    print("[PASS] Rejection validation verified: Missing or short reason cleanly rejected (400).")

    # 6. Citizen Transparency while Awaiting Verification
    # Citizen Owner Jane inspects tracking details
    res = client.get(f"/api/operations/complaints/{target_ref}", headers=jane_headers)
    assert res.status_code == 200
    jane_data = res.json()
    comp = jane_data["complaint"]
    assert comp["status"] == "Resolved - Pending Verification"
    assert comp["resolution_notes"] == "Cleared all roadway debris and swept curb clean."
    assert abs(comp["resolution_latitude"] - 40.7306) < 1e-4
    assert abs(comp["resolution_longitude"] - (-73.9352)) < 1e-4
    assert abs(comp["resolution_gps_accuracy"] - 3.5) < 1e-4
    assert len(jane_data["evidence"]) == 1
    evidence_item = jane_data["evidence"][0]
    assert evidence_item["original_filename"] == "field_photo1.jpg"
    evidence_id = evidence_item["id"]

    # Citizen Owner streams evidence photo
    stream_res = client.get(f"/api/operations/evidence/{evidence_id}/file", headers=jane_headers)
    assert stream_res.status_code == 200
    assert stream_res.headers["Content-Type"] == "image/jpeg"
    assert stream_res.headers["Cache-Control"] == "private, no-store, must-revalidate"
    assert stream_res.headers["Referrer-Policy"] == "no-referrer"
    print("[PASS] Citizen Owner transparency verified: Notes, GPS, timestamp, and secure evidence stream received.")

    # Non-owner Citizen Bob inspects Jane's complaint
    res_bob = client.get(f"/api/operations/complaints/{target_ref}", headers=bob_headers)
    assert res_bob.status_code == 200
    bob_data = res_bob.json()
    # Personal details redacted
    assert bob_data["complaint"]["citizen_name"] == "Citizen User"
    assert bob_data["complaint"]["citizen_email"] is None
    # Private evidence list empty
    assert len(bob_data["evidence"]) == 0

    # Non-owner Citizen Bob tries to stream Jane's evidence photo directly
    unauth_stream = client.get(f"/api/operations/evidence/{evidence_id}/file", headers=bob_headers)
    assert unauth_stream.status_code == 403, f"Expected 403 for non-owner streaming evidence, got {unauth_stream.status_code}"

    # Non-owner Citizen Bob tries to list evidence endpoint directly
    unauth_list = client.get(f"/api/operations/complaints/{target_ref}/evidence", headers=bob_headers)
    assert unauth_list.status_code == 403, f"Expected 403 for non-owner listing evidence, got {unauth_list.status_code}"

    # Unauthenticated guest tries to stream evidence file
    guest_stream = client.get(f"/api/operations/evidence/{evidence_id}/file")
    assert guest_stream.status_code == 401, f"Expected 401 for unauthenticated streaming, got {guest_stream.status_code}"
    print("[PASS] Privacy and ownership enforcement verified: Non-owner citizen and unauthenticated access blocked.")

    # 7. Admin Rejects Resolution for Rework
    reject_reason = "Corner catch basin still obstructed with leaves; clear basin grate and resubmit photo."
    reject_res = client.post(
        f"/api/operations/complaints/{target_ref}/verify",
        json={"action": "REJECT", "rejection_reason": reject_reason},
        headers=admin_headers
    )
    assert reject_res.status_code == 200, f"Rejection failed: {reject_res.text}"
    assert reject_res.json()["status"] == "In Progress"
    print("[PASS] Admin rejected resolution. Ticket returned to 'In Progress'.")

    # 8. Citizen Transparency for Rejected Resolution (Rework Status)
    res_rework = client.get(f"/api/operations/complaints/{target_ref}", headers=jane_headers)
    assert res_rework.status_code == 200
    rework_data = res_rework.json()
    assert rework_data["complaint"]["status"] == "In Progress"
    
    # Audit history contains public 'Resolution Rejected' event with rejection reason
    rej_event = next((h for h in rework_data["history"] if h["action"] == "Resolution Rejected"), None)
    assert rej_event is not None, "Resolution Rejected event missing from public history"
    assert reject_reason in rej_event["comment"]
    assert rej_event["is_public"] == 1
    print(f"[PASS] Citizen tracking transparency verified: Admin rework instructions public: '{rej_event['comment']}'.")

    # 9. Repeated-review prevention while In Progress
    # Admin tries to verify again while ticket is in 'In Progress'
    repeat_res = client.post(
        f"/api/operations/complaints/{target_ref}/verify",
        json={"action": "APPROVE"},
        headers=admin_headers
    )
    assert repeat_res.status_code == 400
    assert "it must be 'resolved - pending verification'" in repeat_res.json()["detail"].lower()
    print("[PASS] Repeated-review prevention verified: Cannot review ticket in 'In Progress' status (400).")

    # 10. Staff completes rework and resubmits evidence
    resubmit_body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="notes"\r\n\r\n'
        "Catch basin grate completely cleared, power washed, and free flowing.\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="rework_basin.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + build_test_image("magenta") + f"\r\n--{boundary}--\r\n".encode("utf-8")

    resubmit_res = client.post(
        f"/api/operations/complaints/{target_ref}/evidence",
        data=resubmit_body,
        headers={"Authorization": f"Bearer {dsny_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert resubmit_res.status_code == 200
    assert resubmit_res.json()["status"] == "Resolved - Pending Verification"
    print("[PASS] Staff successfully submitted reworked evidence. Status = 'Resolved - Pending Verification'.")

    # 11. Admin Approves & Closes Complaint
    admin_notes = "Inspected and confirmed fully cleared to municipal standard."
    approve_res = client.post(
        f"/api/operations/complaints/{target_ref}/verify",
        json={"action": "APPROVE", "notes": admin_notes},
        headers=admin_headers
    )
    assert approve_res.status_code == 200, f"Approval failed: {approve_res.text}"
    appr_data = approve_res.json()
    assert appr_data["status"] == "Closed"
    assert appr_data["actual_resolution_hours"] is not None
    print(f"[PASS] Admin approved resolution. Final status = 'Closed', Actual Turnaround = {appr_data['actual_resolution_hours']} hrs.")

    # 12. Citizen Transparency for Closed & Verified Resolution
    res_closed = client.get(f"/api/operations/complaints/{target_ref}", headers=jane_headers)
    assert res_closed.status_code == 200
    closed_data = res_closed.json()
    closed_comp = closed_data["complaint"]
    assert closed_comp["status"] == "Closed"
    assert closed_comp["closed_at"] is not None
    assert closed_comp["actual_resolution_hours"] is not None

    # Verify closed history entry
    closed_event = next((h for h in closed_data["history"] if h["action"] == "Verified & Closed"), None)
    assert closed_event is not None
    assert admin_notes in closed_event["comment"]
    assert closed_event["is_public"] == 1

    # Preserved evidence (2 items total)
    assert len(closed_data["evidence"]) == 2
    print("[PASS] Citizen tracking for Verified Closure verified: Status=Closed, closed_at, resolution hours, and evidence preserved.")

    # 13. Repeated-review prevention on Closed complaint
    repeat_closed = client.post(
        f"/api/operations/complaints/{target_ref}/verify",
        json={"action": "APPROVE"},
        headers=admin_headers
    )
    assert repeat_closed.status_code == 400
    assert "cannot verify complaint with status 'closed'" in repeat_closed.json()["detail"].lower()
    print("[PASS] Repeated verification of closed complaint blocked with 400.")

    # Cleanup test files
    client.close()
    op_db.DB_PATH = Path("data/operational.db").resolve()
    op_router.EVIDENCE_STORAGE_DIR = Path("data/evidence").resolve()
    if os.path.exists(test_db):
        os.remove(test_db)
    if os.path.exists(test_evidence_dir):
        shutil.rmtree(test_evidence_dir)

    print("============================================================")
    print("ALL STAGE 3 VERIFICATION & TRANSPARENCY TESTS PASSED (100%)")
    print("============================================================")

if __name__ == "__main__":
    run_tests()

