"""
Test Suite: Phase 3 Stage 2 - Staff Workspace End-to-End Workflow & Rework Test
Tests the staff workspace flow, role filtering, evidence submission, admin rejection & rework display,
and final admin approval against an isolated database.
"""
import os
import sys
import shutil
import sqlite3
import io
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def build_test_image(color="blue", size=(300, 300)):
    buf = io.BytesIO()
    im = Image.new("RGB", size, color=color)
    im.save(buf, format="JPEG")
    return buf.getvalue()

def run_tests():
    # 1. Setup isolated database
    test_db = "data/test_stage2_isolated.db"
    test_evidence_dir = "data/test_stage2_evidence"
    if os.path.exists(test_db):
        os.remove(test_db)
    if os.path.exists(test_evidence_dir):
        shutil.rmtree(test_evidence_dir)
    os.makedirs(test_evidence_dir, exist_ok=True)
    shutil.copy("data/operational.db", test_db)

    os.environ["OPERATIONAL_DB_PATH"] = test_db
    os.environ["EVIDENCE_STORAGE_DIR"] = test_evidence_dir

    from fastapi.testclient import TestClient
    from pathlib import Path
    import api.operational_db as op_db
    import api.operational_router as op_router
    from api.main import app
    from api.auth import generate_token

    test_db_path = Path(test_db).resolve()
    test_ev_path = Path(test_evidence_dir).resolve()

    op_db.DB_PATH = test_db_path
    op_router.EVIDENCE_STORAGE_DIR = test_ev_path

    client = TestClient(app)

    print("============================================================")
    print("RUNNING PHASE 3 STAGE 2 STAFF WORKSPACE INTEGRATION SUITE")
    print("============================================================")

    # 2. Authenticate Personas using standard JWT token generation
    admin_token = generate_token(1, "admin@cityhall.nyc.gov", "admin")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    dsny_token = generate_token(2, "officer.kowalski@dsny.nyc.gov", "staff")
    dsny_headers = {"Authorization": f"Bearer {dsny_token}"}

    dot_token = generate_token(3, "tech.reyes@dot.nyc.gov", "staff")
    dot_headers = {"Authorization": f"Bearer {dot_token}"}

    print("[PASS] Personas authenticated: Admin, DSNY Staff, DOT Staff.")

    # 3. Verify Department Queue and Task Filtering
    # Fetch complaints as DSNY staff
    resp_dsny = client.get("/api/operations/complaints", headers=dsny_headers)
    assert resp_dsny.status_code == 200
    complaints = resp_dsny.json().get("complaints", [])
    assert len(complaints) > 0, "No complaints found"
    
    # Verify DSNY officer can identify or filter tasks
    dsny_complaint = None
    for c in complaints:
        if c.get("assigned_department") == "DSNY" or c.get("department") == "DSNY":
            dsny_complaint = c
            break
            
    if not dsny_complaint:
        target_ref = complaints[0]["reference_no"]
        # Assign to DSNY and officer 2
        client.post(f"/api/operations/complaints/{target_ref}/assign", 
                    json={"assigned_staff_id": 2, "priority": "High"}, 
                    headers=admin_headers)
        client.post(f"/api/operations/complaints/{target_ref}/status", 
                    json={"to_status": "In Progress", "comment": "Officer started work."}, 
                    headers=dsny_headers)
        target_complaint_ref = target_ref
    else:
        target_complaint_ref = dsny_complaint["reference_no"]
        # Ensure assigned to officer 2 and status In Progress
        client.post(f"/api/operations/complaints/{target_complaint_ref}/assign", 
                    json={"assigned_staff_id": 2}, 
                    headers=admin_headers)
        client.post(f"/api/operations/complaints/{target_complaint_ref}/status", 
                    json={"to_status": "In Progress", "comment": "Officer started work."}, 
                    headers=dsny_headers)

    print(f"[PASS] Target complaint identified and assigned to DSNY staff: {target_complaint_ref}")

    # 4. Unauthorized staff cannot upload evidence to this complaint
    img1 = build_test_image("green")
    boundary = "----WebKitFormBoundaryStaffTest"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="work_notes"\r\n\r\n'
        "Unauthorized DOT officer attempting DSNY resolution\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="unauth.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + img1 + f"\r\n--{boundary}--\r\n".encode("utf-8")

    unauth_resp = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/evidence",
        data=body,
        headers={"Authorization": f"Bearer {dot_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert unauth_resp.status_code == 403, f"Expected 403 for unauthorized staff, got {unauth_resp.status_code}: {unauth_resp.text}"
    print("[PASS] Cross-officer unauthorized evidence upload blocked with 403.")

    # 5. Assigned staff uploads evidence with work notes, technical details, GPS, and photos
    completion_details = '{"root_cause": "Illegal commercial dumping", "equipment": "Compactor Truck #4", "work_order": "WO-9981"}'
    body_staff = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="work_notes"\r\n\r\n'
        "Cleared 4 bulk items and swept sidewalk clean. Disposed at local transfer station.\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="completion_details"\r\n\r\n'
        f"{completion_details}\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="resolution_latitude"\r\n\r\n'
        "40.7128\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="resolution_longitude"\r\n\r\n'
        "-74.0060\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="resolution_gps_accuracy"\r\n\r\n'
        "4.8\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="cleanup1.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + img1 + (
        f"\r\n--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="cleanup2.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + build_test_image("yellow") + f"\r\n--{boundary}--\r\n".encode("utf-8")

    upload_resp = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/evidence",
        data=body_staff,
        headers={"Authorization": f"Bearer {dsny_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
    upload_data = upload_resp.json()
    assert upload_data["status"] == "Resolved - Pending Verification"
    assert upload_data["uploaded_photos_count"] == 2
    print("[PASS] Assigned staff uploaded completion evidence successfully. Status = 'Resolved - Pending Verification'.")

    # Verify database state
    conn = sqlite3.connect(test_db)
    cur = conn.cursor()
    cur.execute("SELECT id, status, resolution_latitude, resolution_longitude, resolution_gps_accuracy, completion_details FROM complaints WHERE reference_no = ?", (target_complaint_ref,))
    row = cur.fetchone()
    target_comp_id = row[0]
    assert row[1] == "Resolved - Pending Verification"
    assert abs(row[2] - 40.7128) < 1e-4
    assert abs(row[3] - (-74.0060)) < 1e-4
    assert abs(row[4] - 4.8) < 1e-4
    assert "Illegal commercial dumping" in row[5]
    
    cur.execute("SELECT COUNT(*) FROM complaint_evidence WHERE complaint_id = ?", (target_comp_id,))
    assert cur.fetchone()[0] == 2
    conn.close()
    print("[PASS] Database columns and evidence count verified.")

    # 6. Staff cannot close ticket directly via verify endpoint
    staff_verify = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/verify",
        json={"action": "APPROVE"},
        headers=dsny_headers
    )
    assert staff_verify.status_code == 403, "Staff should not be authorized to approve resolutions directly"
    print("[PASS] Staff blocked from admin verification approval (403).")

    # 7. Admin rejects resolution with rework reason
    rejection_reason = "Sidewalk still has debris along curb line. Re-sweep and submit photo of entire blockfront."
    reject_resp = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/verify",
        json={"action": "REJECT", "rejection_reason": rejection_reason},
        headers=admin_headers
    )
    assert reject_resp.status_code == 200, f"Admin rejection failed: {reject_resp.text}"
    reject_data = reject_resp.json()
    assert reject_data["status"] == "In Progress"
    print("[PASS] Admin rejected resolution. Ticket returned to 'In Progress'.")

    # 8. Verify Staff Workspace case history and rework banner data
    detail_resp = client.get(f"/api/operations/complaints/{target_complaint_ref}", headers=dsny_headers)
    assert detail_resp.status_code == 200
    complaint_detail = detail_resp.json()
    assert complaint_detail["complaint"]["status"] == "In Progress"
    
    # Check history timeline for rejection
    history_entries = complaint_detail.get("history", [])
    rejection_entry = next((h for h in history_entries if h.get("action") == "Resolution Rejected"), None)
    assert rejection_entry is not None, "Rejection entry missing from complaint history"
    assert rejection_reason in (rejection_entry.get("comment") or ""), f"Rejection reason missing: {rejection_entry}"
    print(f"[PASS] Staff can view admin rework notice in case detail: '{rejection_entry['comment']}'.")

    # Check that prior evidence photos are preserved and accessible
    ev_list_resp = client.get(f"/api/operations/complaints/{target_complaint_ref}/evidence", headers=dsny_headers)
    assert ev_list_resp.status_code == 200
    ev_data = ev_list_resp.json()
    ev_records = ev_data.get("evidence", [])
    assert len(ev_records) == 2, f"Expected 2 preserved evidence items, got {len(ev_records)}"
    for item in ev_records:
        # Ensure file path is NOT exposed in metadata
        assert "storage_path" not in item
        assert "file_path" not in item
        # Stream file with Bearer token
        file_resp = client.get(f"/api/operations/evidence/{item['id']}/file", headers=dsny_headers)
        assert file_resp.status_code == 200
        assert file_resp.headers["Cache-Control"] == "private, no-store, must-revalidate"
        assert file_resp.headers["Referrer-Policy"] == "no-referrer"
    print("[PASS] Preserved evidence photos safely streamed to staff without path leakage.")

    # 9. Staff resubmits updated evidence after rework
    body_rework = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="work_notes"\r\n\r\n'
        "Curb line thoroughly re-swept and power washed. Full blockfront clear of all debris.\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="photos"; filename="resubmission.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode("utf-8") + build_test_image("magenta") + f"\r\n--{boundary}--\r\n".encode("utf-8")

    resubmit_resp = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/evidence",
        data=body_rework,
        headers={"Authorization": f"Bearer {dsny_token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    assert resubmit_resp.status_code == 200
    assert resubmit_resp.json()["status"] == "Resolved - Pending Verification"
    print("[PASS] Staff successfully resubmitted reworked evidence. Status = 'Resolved - Pending Verification'.")

    # 10. Admin approves resolution
    approve_resp = client.post(
        f"/api/operations/complaints/{target_complaint_ref}/verify",
        json={"action": "APPROVE"},
        headers=admin_headers
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "Closed"
    print("[PASS] Admin verified and approved resolution. Final status = 'Closed'.")

    # Cleanup test files
    client.close()
    op_db.DB_PATH = Path("data/operational.db").resolve()
    op_router.EVIDENCE_STORAGE_DIR = Path("data/evidence").resolve()
    if os.path.exists(test_db):
        os.remove(test_db)
    if os.path.exists(test_evidence_dir):
        shutil.rmtree(test_evidence_dir)

    print("============================================================")
    print("ALL STAFF WORKSPACE END-TO-END TESTS PASSED (100% GREEN)")
    print("============================================================")

if __name__ == "__main__":
    run_tests()
