"""
scratch/test_operations_suite.py

Comprehensive End-to-End Test Suite for Operational Complaint Management:
1. Citizen Registration / Login
2. Complaint Submission & Automatic LightGBM Prediction Association
3. Admin Assignment & Priority Adjustment
4. Staff Workspace Queue & Status Transitions (In Progress, On Hold, Resolve)
5. Admin Verification & Closure
6. Citizen Live Tracking & Feedback Submission
7. Role-Based Access Guards & Security Tests
8. Live Operational Analytics Reconciliation
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from api.main import app
import api.operational_db as db

client = TestClient(app)

def test_full_operational_lifecycle():
    print("\n" + "=" * 60)
    print("STARTING COMPLETE OPERATIONAL LIFECYCLE TEST SUITE")
    print("=" * 60)

    # --------------------------------------------------
    # 1. AUTHENTICATION TESTS
    # --------------------------------------------------
    print("\n--- 1. Testing Authentication & Seed Accounts ---")
    
    # Citizen Jane
    res = client.post("/api/operations/auth/login", json={
        "email": "citizen.jane@nyc.net",
        "password": "CitizenPass123!"
    })
    assert res.status_code == 200, f"Citizen login failed: {res.text}"
    citizen_token = res.json()["token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}
    print("  [PASS] Citizen Jane authenticated successfully.")

    # Admin Marcus Vance
    res = client.post("/api/operations/auth/login", json={
        "email": "admin@civic.nyc.gov",
        "password": "AdminPass123!"
    })
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  [PASS] Admin Marcus Vance authenticated successfully.")

    # Staff Officer Sarah Smith (DSNY)
    res = client.post("/api/operations/auth/login", json={
        "email": "officer.smith@dsny.nyc.gov",
        "password": "StaffPass123!"
    })
    assert res.status_code == 200, f"Staff login failed: {res.text}"
    smith_token = res.json()["token"]
    smith_headers = {"Authorization": f"Bearer {smith_token}"}
    smith_id = res.json()["user"]["id"]
    print(f"  [PASS] Officer Sarah Smith authenticated successfully (ID: {smith_id}).")

    # --------------------------------------------------
    # 2. CITIZEN COMPLAINT SUBMISSION & AI PREDICTION
    # --------------------------------------------------
    print("\n--- 2. Testing Complaint Submission & AI Prediction ---")
    submission_payload = {
        "problem": "Dirty Conditions",
        "problem_detail": "Trash / Illegal Dumping",
        "agency": "DSNY",
        "agency_name": "Department of Sanitation",
        "borough": "MANHATTAN",
        "incident_zip": "10001",
        "incident_address": "500 8th Ave",
        "location_type": "Sidewalk",
        "description": "Piles of uncollected commercial cardboard boxes blocking pedestrian walkway.",
        "latitude": 40.7525,
        "longitude": -73.9928,
        "community_board": "05 MANHATTAN",
        "council_district": 3,
        "police_precinct": "14"
    }
    
    sub_res = client.post("/api/operations/complaints", json=submission_payload, headers=citizen_headers)
    assert sub_res.status_code == 200, f"Submission failed: {sub_res.text}"
    sub_data = sub_res.json()
    ref_no = sub_data["reference_no"]
    assert ref_no.startswith("NYC-"), f"Invalid ref format: {ref_no}"
    assert sub_data["predicted_duration_hours"] > 0, "Predicted duration must be positive"
    print(f"  [PASS] Complaint registered: Ref={ref_no}")
    print(f"         AI Predicted Duration: {sub_data['predicted_duration_hours']:.1f} hrs ({sub_data['predicted_duration_days']:.3f} days)")
    print(f"         Model Version: {sub_data['model_version']}")

    # --------------------------------------------------
    # 3. VERIFY CITIZEN "MY COMPLAINTS"
    # --------------------------------------------------
    print("\n--- 3. Testing Citizen 'My Complaints' Queue ---")
    my_res = client.get("/api/operations/complaints", headers=citizen_headers)
    assert my_res.status_code == 200
    my_complaints = my_res.json()["complaints"]
    created_case = next((c for c in my_complaints if c["reference_no"] == ref_no), None)
    assert created_case is not None, f"Submitted complaint {ref_no} not found in citizen queue"
    assert created_case["status"] == "Submitted"
    print(f"  [PASS] Complaint {ref_no} visible in Citizen Jane's queue with status 'Submitted'.")

    # --------------------------------------------------
    # 4. ADMIN OVERSIGHT & ASSIGNMENT
    # --------------------------------------------------
    print("\n--- 4. Testing Admin Assignment to Staff ---")
    assign_payload = {
        "department": "DSNY",
        "staff_id": smith_id,
        "priority": "High",
        "notes": "Assigned to DSNY Midtown Rapid Enforcement Team."
    }
    assign_res = client.post(f"/api/operations/complaints/{ref_no}/assign", json=assign_payload, headers=admin_headers)
    assert assign_res.status_code == 200, f"Assignment failed: {assign_res.text}"

    # Verify status changed to Assigned
    det_res = client.get(f"/api/operations/complaints/{ref_no}", headers=admin_headers)
    assert det_res.status_code == 200
    det_data = det_res.json()["complaint"]
    assert det_data["status"] == "Assigned"
    assert det_data["priority"] == "High"
    assert det_data["assigned_staff_name"] == "Officer Sarah Smith"
    print(f"  [PASS] Complaint {ref_no} assigned to Officer Sarah Smith (DSNY). Status='Assigned', Priority='High'.")

    # --------------------------------------------------
    # 5. STAFF WORKSPACE & PROGRESS TRANSITIONS
    # --------------------------------------------------
    print("\n--- 5. Testing Staff Workspace & State Transitions ---")
    
    # 5a. Staff acknowledges and starts work (In Progress)
    prog_res = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "In Progress",
        "comment": "Truck #301 en route to 500 8th Ave."
    }, headers=smith_headers)
    assert prog_res.status_code == 200, f"Start work failed: {prog_res.text}"
    print(f"  [PASS] Officer Smith updated status -> 'In Progress'.")

    # 5b. Staff encounters a blocker and puts ticket on hold
    hold_res = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "On Hold",
        "hold_reason": "Loading dock gate locked; building super contacted to grant access.",
        "hold_until": "2026-10-20 14:00:00",
        "comment": "Temporary hold awaiting site access."
    }, headers=smith_headers)
    assert hold_res.status_code == 200, f"Put on hold failed: {hold_res.text}"
    print(f"  [PASS] Officer Smith placed complaint on hold with blocker reason.")

    # 5c. Blocker cleared -> back to In Progress
    resume_res = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "In Progress",
        "comment": "Gate unlocked, site cleared for heavy equipment."
    }, headers=smith_headers)
    assert resume_res.status_code == 200
    print(f"  [PASS] Blocker cleared; status returned -> 'In Progress'.")

    # 5d. Staff reports work completion -> Resolved - Pending Verification
    resolve_res = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "Resolved - Pending Verification",
        "resolution_notes": "All commercial debris removed, sidewalk washed and swept clean.",
        "comment": "Sanitation sweep complete. Awaiting admin closure."
    }, headers=smith_headers)
    assert resolve_res.status_code == 200, f"Resolve failed: {resolve_res.text}"
    print(f"  [PASS] Officer Smith reported completion -> 'Resolved - Pending Verification'.")

    # --------------------------------------------------
    # 6. ADMIN VERIFICATION & CLOSURE
    # --------------------------------------------------
    print("\n--- 6. Testing Admin Verification & Case Closure ---")
    close_res = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "Closed",
        "comment": "Admin reviewed sweep photographic report. Resolution verified."
    }, headers=admin_headers)
    assert close_res.status_code == 200, f"Close failed: {close_res.text}"

    # Verify closure fields
    closed_det = client.get(f"/api/operations/complaints/{ref_no}", headers=admin_headers).json()["complaint"]
    assert closed_det["status"] == "Closed"
    assert closed_det["closed_at"] is not None
    assert closed_det["actual_resolution_hours"] is not None
    print(f"  [PASS] Admin verified & closed complaint {ref_no}. Actual turnaround: {closed_det['actual_resolution_hours']} hrs.")

    # --------------------------------------------------
    # 7. CITIZEN FEEDBACK & TIMELINE
    # --------------------------------------------------
    print("\n--- 7. Testing Citizen Tracking & Feedback ---")
    
    # Check timeline events
    citizen_det = client.get(f"/api/operations/complaints/{ref_no}", headers=citizen_headers).json()
    timeline = citizen_det["history"]
    actions = [h["action"] for h in timeline]
    assert "Submitted" in actions
    assert "Assigned" in actions
    assert len(timeline) >= 4
    print(f"  [PASS] Citizen Jane sees complete chronological public timeline ({len(timeline)} events).")

    # Submit feedback
    fb_res = client.post(f"/api/operations/complaints/{ref_no}/feedback", json={
        "rating": 5,
        "feedback_text": "Remarkable response time! The sidewalk is immaculate."
    }, headers=citizen_headers)
    assert fb_res.status_code == 200, f"Feedback failed: {fb_res.text}"
    print("  [PASS] Citizen Jane submitted 5-star feedback rating.")

    # --------------------------------------------------
    # 8. ROLE-BASED ACCESS CONTROL GUARDS
    # --------------------------------------------------
    print("\n--- 8. Testing Role-Based Security Restrictions ---")
    
    # Citizen trying to assign a complaint (Forbidden)
    unauth_assign = client.post(f"/api/operations/complaints/{ref_no}/assign", json={
        "department": "DSNY"
    }, headers=citizen_headers)
    assert unauth_assign.status_code == 403
    print("  [PASS] Citizen correctly blocked from performing Admin assignment (HTTP 403).")

    # Citizen trying to change operational status (Forbidden)
    unauth_status = client.post(f"/api/operations/complaints/{ref_no}/status", json={
        "to_status": "Closed"
    }, headers=citizen_headers)
    assert unauth_status.status_code == 403
    print("  [PASS] Citizen correctly blocked from modifying operational status (HTTP 403).")

    # --------------------------------------------------
    # 9. OPERATIONAL ANALYTICS RECONCILIATION
    # --------------------------------------------------
    print("\n--- 9. Testing Live Operational Analytics Reconciliation ---")
    analytics_res = client.get("/api/operations/analytics/overview", headers=admin_headers)
    assert analytics_res.status_code == 200
    adata = analytics_res.json()
    assert adata["total_complaints"] >= 5
    assert adata["closed_count"] >= 2  # Seed complaint + newly closed
    assert len(adata["department_stats"]) >= 1
    print(f"  [PASS] Operational analytics reconciled:")
    print(f"         Total Complaints: {adata['total_complaints']}")
    print(f"         Closed: {adata['closed_count']}")
    print(f"         Active: {adata['total_active']}")
    print(f"         Departments Monitored: {[d['department'] for d in adata['department_stats']]}")

    print("\n" + "=" * 60)
    print("ALL OPERATIONAL LIFECYCLE TESTS PASSED (100% GREEN)")
    print("=" * 60)

if __name__ == "__main__":
    test_full_operational_lifecycle()
