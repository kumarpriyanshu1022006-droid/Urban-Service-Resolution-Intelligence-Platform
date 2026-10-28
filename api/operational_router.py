"""
api/operational_router.py

FastAPI Router for Operational Complaint Lifecycle Management.
Handles:
- User authentication & role management (Citizen, Staff, Admin)
- Complaint creation with automatic LightGBM resolution-time prediction
- Role-based complaint queues (Citizen My Complaints, Staff Workspace, Admin Oversight)
- Validated state-machine transitions and immutable audit histories
- Progress notes, hold blockers, resolution evidence, and citizen feedback
- Operational analytics and SLA risk detection
"""

import secrets
from datetime import datetime
from typing import Optional, List, Dict, Any, Union

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

import api.operational_db as db
from api.auth import (
    generate_token,
    verify_token,
    get_current_user,
    get_optional_current_user,
    require_role
)

router = APIRouter()

# Pluggable ML predictor reference (injected from api.main)
_predictor_fn = None

def set_predictor(fn):
    global _predictor_fn
    _predictor_fn = fn


# --------------------------------------------------
# TRANSPARENT RULE-BASED MUNICIPAL TRIAGE RECOMMENDATION
# --------------------------------------------------

def compute_suggested_priority(problem: str, problem_detail: str, description: str, predicted_hours: float) -> tuple[str, str]:
    """
    Transparent Rule-Based Municipal Triage Priority Recommendation Engine.
    Explicitly decoupled from the LightGBM turnaround duration pipeline.
    Returns: (suggested_priority: str, triage_reason: str)
    """
    combined_text = f"{problem} {problem_detail} {description}".lower()

    # Rule 1: Imminent Public Safety or Severe Infrastructure Emergencies
    emergency_patterns = [
        "gas leak", "active gas", "cave-in", "cave in", "manhole open", "missing manhole cover",
        "structural collapse", "building collapse", "live wire", "downed power line",
        "water main break", "electrical sparking", "toxic spill", "immediate danger", "immediate hazard",
        "severe flooding", "submerged roadway"
    ]
    if any(p in combined_text for p in emergency_patterns) or (problem == "Street Condition" and "pothole emergency" in combined_text):
        return (
            "Emergency",
            "Rule-Based Triage: Imminent public safety hazard or catastrophic structural risk detected."
        )

    # Rule 2: High Operational Urgency (Blocked Emergency Access, Active Flooding, Fire Hydrants)
    high_patterns = [
        "blocked hydrant", "fire hydrant", "blocked crosswalk", "double parked",
        "no water", "low water pressure", "raw sewage", "sewage backup",
        "dumpster overflow", "overflowing commercial", "dead animal", "traffic light out",
        "flooding", "flood", "standing water", "catch basin", "storm drain", "blocked drain"
    ]
    if any(p in combined_text for p in high_patterns) or (problem in ("Illegal Parking", "Water Maintenance") and "hydrant" in combined_text):
        return (
            "High",
            "Rule-Based Triage: Critical municipal access obstruction or sanitation/health impediment identified."
        )

    # Rule 3: Routine / Low Urgency (Cosmetic, Non-Hazardous Noise)
    low_patterns = [
        "noise - residential", "loud music", "party", "barking dog",
        "commercial overnight parking", "litter basket full", "graffiti"
    ]
    if any(p in combined_text for p in low_patterns) and not any(p in combined_text for p in ["danger", "hazard", "blocked", "emergency"]):
        return (
            "Low",
            "Rule-Based Triage: Routine quality-of-life report with zero immediate safety risk."
        )

    # Default Rule: Standard Medium Priority
    return (
        "Medium",
        "Rule-Based Triage: Standard municipal service request adhering to standard operational velocity."
    )


# --------------------------------------------------
# PYDANTIC REQUEST / RESPONSE SCHEMAS
# --------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None

class ComplaintCreateRequest(BaseModel):
    problem: str
    problem_detail: Optional[str] = "General"
    agency: Optional[str] = "DSNY"
    agency_name: Optional[str] = "Department of Sanitation"
    borough: str
    incident_zip: str
    incident_address: str
    location_type: Optional[str] = "Street/Sidewalk"
    description: str
    latitude: Optional[float] = 40.7128
    longitude: Optional[float] = -74.0060
    evidence_url: Optional[str] = None
    # Model optional overrides if available
    community_board: Optional[str] = "01 MANHATTAN"
    council_district: Optional[int] = 1
    police_precinct: Optional[str] = "1"
    city: Optional[str] = "NEW YORK"

class AssignRequest(BaseModel):
    department: str
    staff_id: Optional[Union[int, str]] = None
    priority: Optional[str] = "Medium"
    priority_reason: Optional[str] = None
    notes: Optional[str] = None

class PriorityUpdateRequest(BaseModel):
    priority: str
    reason: str = Field(..., min_length=3, description="Mandatory justification reason for priority override or escalation")

class StatusUpdateRequest(BaseModel):
    to_status: str
    comment: Optional[str] = None
    hold_reason: Optional[str] = None
    hold_until: Optional[str] = None
    resolution_notes: Optional[str] = None
    resolution_evidence_url: Optional[str] = None
    is_public: Optional[bool] = True

class NoteCreateRequest(BaseModel):
    comment: str
    is_public: Optional[bool] = True

class FeedbackCreateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback_text: Optional[str] = None


# --------------------------------------------------
# 1. AUTHENTICATION ENDPOINTS
# --------------------------------------------------

@router.post("/auth/login")
def login(request: LoginRequest):
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, password_hash, full_name, role, department, phone FROM users WHERE email = ?;",
            (request.email.strip().lower(),)
        )
        user_row = cursor.fetchone()
        if not user_row or not db.verify_password(request.password, user_row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        
        token = generate_token(user_row["id"], user_row["email"], user_row["role"])
        return {
            "token": token,
            "user": {
                "id": user_row["id"],
                "email": user_row["email"],
                "full_name": user_row["full_name"],
                "role": user_row["role"],
                "department": user_row["department"],
                "phone": user_row["phone"]
            }
        }
    finally:
        conn.close()


@router.post("/auth/register")
def register(request: RegisterRequest):
    email = request.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address.")
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?;", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="An account with this email already exists.")

        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        hashed_pw = db.hash_password(request.password)
        cursor.execute("""
        INSERT INTO users (email, password_hash, full_name, role, phone, created_at)
        VALUES (?, ?, ?, 'citizen', ?, ?);
        """, (email, hashed_pw, request.full_name.strip(), request.phone, now_str))
        conn.commit()
        user_id = cursor.lastrowid

        token = generate_token(user_id, email, "citizen")
        return {
            "token": token,
            "user": {
                "id": user_id,
                "email": email,
                "full_name": request.full_name.strip(),
                "role": "citizen",
                "department": None,
                "phone": request.phone
            }
        }
    finally:
        conn.close()


@router.get("/auth/me")
def get_current_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": current_user}


@router.get("/departments")
def get_configured_departments():
    """Return all configured municipal departments with live active staff counts and open workload."""
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT u.department, count(DISTINCT u.id) as staff_count
        FROM users u
        WHERE u.role = 'staff'
        GROUP BY u.department;
        """)
        staff_counts = {r["department"]: r["staff_count"] for r in cursor.fetchall()}

        cursor.execute("""
        SELECT assigned_department, count(*) as open_ticket_count
        FROM complaints
        WHERE status IN ('Submitted', 'Assigned', 'In Progress', 'On Hold')
        GROUP BY assigned_department;
        """)
        ticket_counts = {r["assigned_department"]: r["open_ticket_count"] for r in cursor.fetchall()}

        dept_list = []
        for d in db.CONFIGURED_DEPARTMENTS:
            dept_list.append({
                **d,
                "staff_count": staff_counts.get(d["code"], 0),
                "open_tickets": ticket_counts.get(d["code"], 0)
            })
        return {"departments": dept_list}
    finally:
        conn.close()


@router.get("/staff-list")
def get_staff_list(
    department: Optional[str] = Query(None, description="Filter staff by municipal department code"),
    current_user: Dict[str, Any] = Depends(require_role(["admin", "staff"]))
):
    """Retrieve list of staff members with their departments and active ticket load, optionally filtered by department."""
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        where_clauses = ["u.role IN ('staff', 'admin')"]
        params = []
        if department and department != "ALL":
            where_clauses.append("u.department = ?")
            params.append(department)

        where_sql = "WHERE " + " AND ".join(where_clauses)

        cursor.execute(f"""
        SELECT u.id, u.full_name, u.email, u.department, u.role, u.phone,
               count(c.id) as active_ticket_count
        FROM users u
        LEFT JOIN complaints c ON c.assigned_staff_id = u.id AND c.status IN ('Assigned', 'In Progress', 'On Hold')
        {where_sql}
        GROUP BY u.id
        ORDER BY u.department, u.full_name;
        """, params)
        rows = [dict(r) for r in cursor.fetchall()]
        return {"staff": rows}
    finally:
        conn.close()


# --------------------------------------------------
# 2. COMPLAINT SUBMISSION (CITIZEN -> AI -> PERSISTENCE)
# --------------------------------------------------

@router.post("/complaints")
def submit_new_complaint(
    request: ComplaintCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Citizen submits a new complaint:
    1. Validates required attributes
    2. Runs LightGBM prediction model for resolution estimation
    3. Generates unique reference code (NYC-2026-XXXXX)
    4. Persists complaint and prediction association in operational database
    5. Records initial timeline event and sends confirmation notification
    """
    now = datetime.utcnow()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # Generate unique 5-char random hex reference
    ref_token = secrets.token_hex(3).upper()[:5]
    reference_no = f"NYC-{now.year}-{ref_token}"

    # Prepare model input schema
    model_payload = {
        "Problem (formerly Complaint Type)": request.problem,
        "Problem Detail (formerly Descriptor)": request.problem_detail or "General",
        "Agency": request.agency or "DSNY",
        "Agency Name": request.agency_name or "Department of Sanitation",
        "Borough": request.borough.upper(),
        "Location Type": request.location_type or "Street/Sidewalk",
        "Incident Zip": request.incident_zip,
        "City": request.city or ("NEW YORK" if request.borough.upper() == "MANHATTAN" else request.borough.upper()),
        "Community Board": request.community_board or "01 MANHATTAN",
        "Council District": request.council_district or 1,
        "Police Precinct": request.police_precinct or "1",
        "Open Data Channel Type": "ONLINE",
        "Latitude": float(request.latitude or 40.7128),
        "Longitude": float(request.longitude or -74.0060),
        "Created Date": now_str
    }

    # Execute LightGBM model prediction if predictor is available
    pred_days = 1.0
    pred_hours = 24.0
    model_version = "LightGBM_L2"

    if _predictor_fn:
        try:
            pred_result = _predictor_fn(model_payload)
            pred_days = float(pred_result.get("predicted_resolution_days", 1.0))
            pred_hours = float(pred_result.get("predicted_resolution_hours", 24.0))
            model_version = pred_result.get("model", "LightGBM_L2")
        except Exception as e:
            # Fall back to heuristic average while logging
            print(f"[OperationalRouter] Predictor warning: {e}. Defaulting to initial heuristic.")

    # Compute transparent rule-based municipal triage recommendation
    suggested_priority, triage_reason = compute_suggested_priority(
        request.problem,
        request.problem_detail or "General",
        request.description,
        pred_hours
    )

    # Check for idempotent duplicate submission retry within 60 seconds
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT id, reference_no, predicted_duration_days, predicted_duration_hours,
               prediction_model_version, suggested_priority, priority
        FROM complaints
        WHERE citizen_id = ?
          AND problem = ?
          AND incident_address = ?
          AND incident_zip = ?
          AND created_at >= datetime(?, '-60 seconds');
        """, (current_user["id"], request.problem, request.incident_address, request.incident_zip, now_str))
        existing_sub = cursor.fetchone()
        if existing_sub:
            return {
                "success": True,
                "reference_no": existing_sub["reference_no"],
                "complaint_id": existing_sub["id"],
                "predicted_duration_days": existing_sub["predicted_duration_days"],
                "predicted_duration_hours": existing_sub["predicted_duration_hours"],
                "model_version": existing_sub["prediction_model_version"],
                "suggested_priority": existing_sub["suggested_priority"],
                "priority": existing_sub["priority"],
                "triage_reason": "Idempotent submission recovery (duplicate retry within 60s detected).",
                "message": "Complaint already registered. Returned existing operational tracking reference."
            }

        with conn:
            cursor.execute("""
            INSERT INTO complaints (
                reference_no, citizen_id, problem, problem_detail, agency, agency_name,
                borough, incident_zip, incident_address, location_type, description,
                evidence_url, latitude, longitude, status, suggested_priority, priority,
                priority_override_reason, assigned_department,
                predicted_duration_days, predicted_duration_hours, prediction_model_version,
                prediction_timestamp, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?);
            """, (
                reference_no,
                current_user["id"],
                request.problem,
                request.problem_detail or "General",
                request.agency or "DSNY",
                request.agency_name or "Department of Sanitation",
                request.borough.upper(),
                request.incident_zip,
                request.incident_address,
                request.location_type or "Street/Sidewalk",
                request.description,
                request.evidence_url,
                request.latitude,
                request.longitude,
                suggested_priority,
                suggested_priority,
                request.agency or "DSNY",
                pred_days,
                pred_hours,
                model_version,
                now_str,
                now_str,
                now_str
            ))
            complaint_id = cursor.lastrowid

            # Initial audit history event
            history_comment = f"Complaint registered via citizen portal. ML turnaround estimate: {pred_hours:.1f} hrs. Triage recommendation: {suggested_priority} ({triage_reason})."
            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
            """, (
                complaint_id,
                current_user["id"],
                current_user["full_name"],
                current_user["role"],
                "Submitted",
                "Submitted",
                "Submitted",
                history_comment,
                now_str
            ))

            # Send notification to citizen
            cursor.execute("""
            INSERT INTO notifications (user_id, complaint_id, title, message, created_at)
            VALUES (?, ?, ?, ?, ?);
            """, (
                current_user["id"],
                complaint_id,
                f"Complaint {reference_no} Received",
                f"Your request has been logged. Expected resolution estimate: ~{pred_hours:.1f} hours ({suggested_priority} priority).",
                now_str
            ))

        return {
            "success": True,
            "reference_no": reference_no,
            "complaint_id": complaint_id,
            "predicted_duration_days": pred_days,
            "predicted_duration_hours": pred_hours,
            "model_version": model_version,
            "suggested_priority": suggested_priority,
            "priority": suggested_priority,
            "triage_reason": triage_reason,
            "message": "Complaint successfully registered with operational tracking."
        }
    finally:
        conn.close()


# --------------------------------------------------
# 3. COMPLAINTS QUEUE & DETAIL (ROLE-BASED)
# --------------------------------------------------

@router.get("/complaints")
def list_operational_complaints(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieve operational complaints according to role:
    - Citizen: views own complaints
    - Staff: views complaints assigned to them or their department
    - Admin: views all platform complaints
    """
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        where_clauses = []
        params = []

        # Role-based scoping
        if current_user["role"] == "citizen":
            where_clauses.append("c.citizen_id = ?")
            params.append(current_user["id"])
        elif current_user["role"] == "staff":
            user_dept = current_user.get("department") or ""
            where_clauses.append("(c.assigned_staff_id = ? OR c.assigned_department = ?)")
            params.extend([current_user["id"], user_dept])

        # Filters
        if status and status != "ALL":
            where_clauses.append("c.status = ?")
            params.append(status)
        if priority and priority != "ALL":
            where_clauses.append("c.priority = ?")
            params.append(priority)
        if department and department != "ALL":
            where_clauses.append("c.assigned_department = ?")
            params.append(department)
        if search and search.strip():
            term = f"%{search.strip()}%"
            where_clauses.append("(c.reference_no LIKE ? OR c.problem LIKE ? OR c.incident_address LIKE ? OR c.incident_zip LIKE ?)")
            params.extend([term, term, term, term])

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # Count total
        count_query = f"SELECT count(*) FROM complaints c {where_sql};"
        cursor.execute(count_query, params)
        total_records = cursor.fetchone()[0]

        # Query records
        data_query = f"""
        SELECT c.*, 
               u.full_name as citizen_name,
               u.email as citizen_email,
               s.full_name as assigned_staff_name
        FROM complaints c
        LEFT JOIN users u ON c.citizen_id = u.id
        LEFT JOIN users s ON c.assigned_staff_id = s.id
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?;
        """
        cursor.execute(data_query, params + [limit, offset])
        rows = [dict(r) for r in cursor.fetchall()]

        return {
            "total": total_records,
            "limit": limit,
            "offset": offset,
            "complaints": rows
        }
    finally:
        conn.close()


@router.get("/complaints/{reference_no}")
def get_complaint_detail(
    reference_no: str,
    current_user: Optional[Dict[str, Any]] = Depends(get_optional_current_user)
):
    """
    Retrieve single complaint details and audit timeline.
    Citizens only see public timeline events (is_public = 1).
    Staff and Admin see all events including internal operational notes.
    """
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.*,
               u.full_name as citizen_name,
               u.email as citizen_email,
               u.phone as citizen_phone,
               s.full_name as assigned_staff_name,
               s.email as assigned_staff_email
        FROM complaints c
        LEFT JOIN users u ON c.citizen_id = u.id
        LEFT JOIN users s ON c.assigned_staff_id = s.id
        WHERE c.reference_no = ?;
        """, (reference_no,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Complaint '{reference_no}' not found.")

        complaint = dict(row)

        # Access check for citizens
        if current_user and current_user["role"] == "citizen" and complaint["citizen_id"] != current_user["id"]:
            # Redact personal information if queried by another citizen
            complaint["citizen_name"] = "Citizen User"
            complaint["citizen_email"] = None
            complaint["citizen_phone"] = None

        # Fetch history events
        is_staff_or_admin = current_user and current_user["role"] in ("staff", "admin")
        if is_staff_or_admin:
            cursor.execute("""
            SELECT id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            FROM complaint_history
            WHERE complaint_id = ?
            ORDER BY created_at ASC;
            """, (complaint["id"],))
        else:
            cursor.execute("""
            SELECT id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            FROM complaint_history
            WHERE complaint_id = ? AND is_public = 1
            ORDER BY created_at ASC;
            """, (complaint["id"],))

        history = [dict(h) for h in cursor.fetchall()]

        # Fetch feedback if available
        cursor.execute("SELECT rating, feedback_text, created_at FROM complaint_feedback WHERE complaint_id = ?;", (complaint["id"],))
        fb = cursor.fetchone()
        feedback = dict(fb) if fb else None

        return {
            "complaint": complaint,
            "history": history,
            "feedback": feedback
        }
    finally:
        conn.close()


# --------------------------------------------------
# 4. WORKFLOW TRANSITIONS (ASSIGN, STATUS, HOLD, RESOLVE)
# --------------------------------------------------

@router.post("/complaints/{reference_no}/assign")
def assign_complaint(
    reference_no: str,
    request: AssignRequest,
    current_user: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """Admin assigns or reassigns complaint to department and eligible officer with strict compatibility validation."""
    valid_dept_codes = [d["code"] for d in db.CONFIGURED_DEPARTMENTS]
    if request.department not in valid_dept_codes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid department '{request.department}'. Must be one of configured departments: {valid_dept_codes}."
        )

    conn = db.get_db_connection()
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, status, priority, suggested_priority, assigned_staff_id, citizen_id FROM complaints WHERE reference_no = ?;", (reference_no,))
            comp = cursor.fetchone()
            if not comp:
                raise HTTPException(status_code=404, detail="Complaint not found.")

            complaint_id = comp["id"]
            old_status = comp["status"]
            new_status = "Assigned" if old_status in ("Submitted", "Under Review") else old_status

            clean_staff_id = None
            if request.staff_id is not None and str(request.staff_id).strip() != "":
                try:
                    val = int(request.staff_id)
                    if val > 0:
                        clean_staff_id = val
                except (ValueError, TypeError):
                    clean_staff_id = None

            staff_name = "Department Dispatch Queue (Unassigned Officer)"
            if clean_staff_id:
                cursor.execute("SELECT id, full_name, email, department, role FROM users WHERE id = ?;", (clean_staff_id,))
                st = cursor.fetchone()
                if not st:
                    raise HTTPException(status_code=400, detail=f"Staff user ID {clean_staff_id} does not exist.")
                if st["role"] not in ("staff", "admin"):
                    raise HTTPException(status_code=400, detail=f"User '{st['full_name']}' is not an authorized staff member.")
                # Verify officer belongs to the selected department
                if st["role"] == "staff" and st["department"] != request.department:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Department Mismatch: Officer '{st['full_name']}' belongs to '{st['department']}', and cannot be assigned to '{request.department}' tickets."
                    )
                staff_name = st["full_name"]

            # Check if priority is being adjusted
            new_priority = request.priority or comp["priority"]
            priority_override = None
            if new_priority != comp["priority"]:
                priority_override = request.priority_reason or f"Priority adjusted to {new_priority} during dispatch assignment."

            cursor.execute("""
            UPDATE complaints
            SET assigned_department = ?,
                assigned_staff_id = ?,
                priority = ?,
                priority_override_reason = coalesce(?, priority_override_reason),
                status = ?,
                updated_at = ?
            WHERE id = ?;
            """, (request.department, clean_staff_id, new_priority, priority_override, new_status, now_str, complaint_id))

            # Record audit history
            comment = f"Assigned to {request.department} ({staff_name}). Operational Priority: {new_priority}."
            if request.notes:
                comment += f" Instructions: {request.notes}"
            if priority_override:
                comment += f" [Priority Override: {priority_override}]"

            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Assigned', ?, 1, ?);
            """, (complaint_id, current_user["id"], current_user["full_name"], current_user["role"], old_status, new_status, comment, now_str))

            # Send notification to assigned staff
            if clean_staff_id:
                cursor.execute("""
                INSERT INTO notifications (user_id, complaint_id, title, message, created_at)
                VALUES (?, ?, ?, ?, ?);
                """, (
                    clean_staff_id,
                    complaint_id,
                    f"New Assignment: {reference_no}",
                    f"You have been assigned complaint {reference_no} ({request.department}) at {new_priority} priority.",
                    now_str
                ))

        return {"success": True, "message": f"Complaint {reference_no} successfully assigned to {request.department} ({staff_name})."}
    finally:
        conn.close()


@router.post("/complaints/{reference_no}/priority")
def update_priority(
    reference_no: str,
    request: PriorityUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["admin"]))
):
    """Admin updates operational priority with mandatory audit justification."""
    if request.priority not in ("Low", "Medium", "High", "Emergency"):
        raise HTTPException(status_code=400, detail="Invalid priority level.")
    if not request.reason or not request.reason.strip():
        raise HTTPException(status_code=400, detail="A mandatory justification reason is required when adjusting or overriding operational priority.")

    conn = db.get_db_connection()
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, priority, suggested_priority, status, assigned_staff_id, assigned_department FROM complaints WHERE reference_no = ?;", (reference_no,))
            comp = cursor.fetchone()
            if not comp:
                raise HTTPException(status_code=404, detail="Complaint not found.")

            complaint_id = comp["id"]
            old_priority = comp["priority"]
            clean_reason = request.reason.strip()

            cursor.execute("""
            UPDATE complaints
            SET priority = ?,
                priority_override_reason = ?,
                updated_at = ?
            WHERE id = ?;
            """, (request.priority, clean_reason, now_str, complaint_id))

            # Log audit
            is_emergency = request.priority == "Emergency"
            action_label = "Priority Escalated (Emergency)" if is_emergency else "Priority Adjusted"
            comment = f"Operational priority changed from {old_priority} to {request.priority}. Justification: {clean_reason}."

            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
            """, (complaint_id, current_user["id"], current_user["full_name"], current_user["role"], comp["status"], comp["status"], action_label, comment, now_str))

            # Notify assigned staff member of urgent priority change
            if comp["assigned_staff_id"]:
                cursor.execute("""
                INSERT INTO notifications (user_id, complaint_id, title, message, created_at)
                VALUES (?, ?, ?, ?, ?);
                """, (
                    comp["assigned_staff_id"],
                    complaint_id,
                    f"Priority Update: {reference_no} ({request.priority})",
                    f"Priority for complaint {reference_no} has been updated to {request.priority}. Reason: {clean_reason}",
                    now_str
                ))

        return {
            "success": True,
            "reference_no": reference_no,
            "old_priority": old_priority,
            "new_priority": request.priority,
            "reason": clean_reason,
            "message": f"Priority updated to {request.priority}."
        }
    finally:
        conn.close()


@router.post("/complaints/{reference_no}/status")
def update_complaint_status(
    reference_no: str,
    request: StatusUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Validated status-transition state machine.
    Enforces role permissions and captures blockers, completion notes, and elapsed turnaround.
    """
    conn = db.get_db_connection()
    try:
        now = datetime.utcnow()
        now_str = now.strftime("%Y-%m-%d %H:%M:%S")

        with conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id, status, created_at, citizen_id, assigned_staff_id, assigned_department 
            FROM complaints WHERE reference_no = ?;
            """, (reference_no,))
            comp = cursor.fetchone()
            if not comp:
                raise HTTPException(status_code=404, detail="Complaint not found.")

            complaint_id = comp["id"]
            old_status = comp["status"]
            to_status = request.to_status
            user_role = current_user["role"]

            # Role guard logic
            if user_role == "citizen":
                raise HTTPException(status_code=403, detail="Citizens cannot directly change operational status.")

            new_assigned_staff_id = comp["assigned_staff_id"]
            action_name = "Status Changed"

            if user_role == "staff":
                # Guard 1: Department match
                if comp["assigned_department"] != current_user.get("department"):
                    raise HTTPException(
                        status_code=403,
                        detail=f"Department Mismatch: This complaint belongs to '{comp['assigned_department']}'. You are registered under '{current_user.get('department')}'."
                    )

                # Guard 2: Officer ownership
                if comp["assigned_staff_id"] is not None and comp["assigned_staff_id"] != current_user["id"]:
                    raise HTTPException(
                        status_code=403,
                        detail="This complaint is assigned to another officer. Only the assigned officer or an administrator may update this ticket."
                    )

                # Guard 3: Permitted transitions
                if comp["assigned_staff_id"] is None:
                    # Unassigned department queue ticket
                    if to_status != "In Progress" or old_status not in ("Submitted", "Under Review", "Assigned"):
                        raise HTTPException(
                            status_code=400,
                            detail="Department queue complaints must be claimed by starting work ('In Progress') before other transitions."
                        )
                    # Automatically claim the complaint for this officer!
                    new_assigned_staff_id = current_user["id"]
                    action_name = "Work Started (Claimed from Department Queue)"
                else:
                    # Assigned to this officer
                    allowed_staff_moves = {
                        "Assigned": ["In Progress"],
                        "In Progress": ["On Hold", "Resolved - Pending Verification"],
                        "On Hold": ["In Progress"]
                    }
                    if to_status not in allowed_staff_moves.get(old_status, []):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Staff cannot transition status from '{old_status}' to '{to_status}'."
                        )
                    if old_status == "On Hold" and to_status == "In Progress":
                        action_name = "Work Resumed"
                    elif to_status == "On Hold":
                        action_name = "Placed On Hold"
                    elif to_status == "Resolved - Pending Verification":
                        action_name = "Work Completed"
                    elif to_status == "In Progress":
                        action_name = "Work Started"

            if user_role == "admin":
                # Admin can verify, close, reject, or reopen
                allowed_admin_moves = {
                    "Submitted": ["Under Review", "Assigned", "Rejected"],
                    "Under Review": ["Assigned", "Rejected"],
                    "Assigned": ["In Progress", "Rejected"],
                    "In Progress": ["On Hold", "Resolved - Pending Verification", "Closed"],
                    "On Hold": ["In Progress", "Closed"],
                    "Resolved - Pending Verification": ["Closed", "In Progress"],
                    "Closed": ["In Progress"],
                    "Rejected": ["Under Review"]
                }
                if to_status not in allowed_admin_moves.get(old_status, []):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid transition from '{old_status}' to '{to_status}'."
                    )
                if to_status == "Closed":
                    action_name = "Verified & Closed"
                elif old_status == "Closed" and to_status == "In Progress":
                    action_name = "Case Reopened"

            # Specific requirements by target status
            hold_reason = None
            hold_until = None
            resolution_notes = None
            resolved_at = None
            closed_at = None
            actual_res_hours = None

            if to_status == "On Hold":
                if not request.hold_reason or not request.hold_reason.strip():
                    raise HTTPException(status_code=400, detail="A reason is required when putting a complaint on hold.")
                hold_reason = request.hold_reason.strip()
                hold_until = request.hold_until

            elif to_status == "Resolved - Pending Verification":
                if not request.resolution_notes or not request.resolution_notes.strip():
                    raise HTTPException(status_code=400, detail="Resolution notes are required when reporting completion.")
                resolution_notes = request.resolution_notes.strip()
                resolved_at = now_str

            elif to_status == "Closed":
                closed_at = now_str
                # Compute actual resolution duration in hours
                try:
                    c_time = datetime.strptime(comp["created_at"], "%Y-%m-%d %H:%M:%S")
                    actual_res_hours = round((now - c_time).total_seconds() / 3600.0, 2)
                except Exception:
                    actual_res_hours = 0.0

            # Execute update
            clear_hold = (old_status == "On Hold" and to_status == "In Progress")

            cursor.execute("""
            UPDATE complaints
            SET status = ?,
                assigned_staff_id = coalesce(?, assigned_staff_id),
                hold_reason = CASE WHEN ? = 1 THEN NULL ELSE coalesce(?, hold_reason) END,
                hold_until = CASE WHEN ? = 1 THEN NULL ELSE coalesce(?, hold_until) END,
                resolution_notes = coalesce(?, resolution_notes),
                resolved_at = coalesce(?, resolved_at),
                closed_at = coalesce(?, closed_at),
                actual_resolution_hours = coalesce(?, actual_resolution_hours),
                updated_at = ?
            WHERE id = ?;
            """, (
                to_status,
                new_assigned_staff_id,
                1 if clear_hold else 0,
                hold_reason,
                1 if clear_hold else 0,
                hold_until,
                resolution_notes,
                resolved_at,
                closed_at,
                actual_res_hours,
                now_str,
                complaint_id
            ))

            # Record audit history
            comment = request.comment or ""
            if comp["assigned_staff_id"] is None and new_assigned_staff_id == current_user["id"]:
                comment = f"Claimed from {comp['assigned_department']} Dispatch Queue by {current_user['full_name']}. " + comment
            elif hold_reason:
                comment = f"Hold Reason: {hold_reason}. " + comment
            elif resolution_notes:
                comment = f"Work Completed: {resolution_notes}. " + comment
            elif to_status == "Closed":
                comment = f"Verified and closed by operations. Total elapsed: {actual_res_hours} hrs. " + comment

            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                complaint_id,
                current_user["id"],
                current_user["full_name"],
                current_user["role"],
                old_status,
                to_status,
                action_name,
                comment.strip(),
                1 if request.is_public else 0,
                now_str
            ))

            # Send notification to citizen
            cursor.execute("""
            INSERT INTO notifications (user_id, complaint_id, title, message, created_at)
            VALUES (?, ?, ?, ?, ?);
            """, (
                comp["citizen_id"],
                complaint_id,
                f"Complaint {reference_no} Status: {to_status}",
                f"Your complaint has been updated to '{to_status}'.",
                now_str
            ))

        return {
            "success": True,
            "reference_no": reference_no,
            "from_status": old_status,
            "to_status": to_status,
            "message": f"Complaint status updated to {to_status}."
        }
    finally:
        conn.close()


@router.post("/complaints/{reference_no}/notes")
def add_complaint_note(
    reference_no: str,
    request: NoteCreateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["staff", "admin"]))
):
    """Staff or Admin adds an operational note (public or internal)."""
    if not request.comment or not request.comment.strip():
        raise HTTPException(status_code=400, detail="Note comment cannot be empty.")

    conn = db.get_db_connection()
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, status FROM complaints WHERE reference_no = ?;", (reference_no,))
            comp = cursor.fetchone()
            if not comp:
                raise HTTPException(status_code=404, detail="Complaint not found.")

            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Progress Note', ?, ?, ?);
            """, (
                comp["id"],
                current_user["id"],
                current_user["full_name"],
                current_user["role"],
                comp["status"],
                comp["status"],
                request.comment.strip(),
                1 if request.is_public else 0,
                now_str
            ))

        return {"success": True, "message": "Note recorded."}
    finally:
        conn.close()


@router.post("/complaints/{reference_no}/feedback")
def submit_citizen_feedback(
    reference_no: str,
    request: FeedbackCreateRequest,
    current_user: Dict[str, Any] = Depends(require_role(["citizen"]))
):
    """Citizen submits rating and review for a resolved or closed complaint."""
    conn = db.get_db_connection()
    try:
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, status, citizen_id FROM complaints WHERE reference_no = ?;", (reference_no,))
            comp = cursor.fetchone()
            if not comp:
                raise HTTPException(status_code=404, detail="Complaint not found.")

            if comp["citizen_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="You can only submit feedback for your own complaints.")

            if comp["status"] not in ("Resolved - Pending Verification", "Closed"):
                raise HTTPException(status_code=400, detail="Feedback can only be submitted after resolution.")

            cursor.execute("""
            INSERT INTO complaint_feedback (complaint_id, citizen_id, rating, feedback_text, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(complaint_id) DO UPDATE SET
                rating = excluded.rating,
                feedback_text = excluded.feedback_text,
                created_at = excluded.created_at;
            """, (comp["id"], current_user["id"], request.rating, request.feedback_text, now_str))

        return {"success": True, "message": "Thank you for your feedback!"}
    finally:
        conn.close()


# --------------------------------------------------
# 5. NOTIFICATIONS
# --------------------------------------------------

@router.get("/notifications")
def get_user_notifications(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch unread and recent notifications for the logged in user."""
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT n.*, c.reference_no
        FROM notifications n
        LEFT JOIN complaints c ON n.complaint_id = c.id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC
        LIMIT 20;
        """, (current_user["id"],))
        rows = [dict(r) for r in cursor.fetchall()]
        unread_count = sum(1 for r in rows if not r["is_read"])
        return {"unread_count": unread_count, "notifications": rows}
    finally:
        conn.close()


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = db.get_db_connection()
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?;", (notification_id, current_user["id"]))
        return {"success": True}
    finally:
        conn.close()


# --------------------------------------------------
# 6. OPERATIONAL ANALYTICS (LIVE PLATFORM KPIS)
# --------------------------------------------------

@router.get("/analytics/overview")
def get_operational_analytics_overview(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Live operational dashboard analytics:
    - Status tallies (Submitted, In Progress, On Hold, Pending Verification, Closed)
    - At-risk and overdue counts based on AI prediction vs elapsed duration
    - Department backlog breakdown
    - Prediction vs Actual duration comparison
    """
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        now = datetime.utcnow()

        # Status counts
        cursor.execute("""
        SELECT status, count(*) as count
        FROM complaints
        GROUP BY status;
        """)
        status_map = {row["status"]: row["count"] for row in cursor.fetchall()}

        total_active = sum(status_map.get(s, 0) for s in ("Submitted", "Under Review", "Assigned", "In Progress", "On Hold"))
        unassigned_count = status_map.get("Submitted", 0) + status_map.get("Under Review", 0)
        in_progress_count = status_map.get("In Progress", 0)
        on_hold_count = status_map.get("On Hold", 0)
        pending_verification_count = status_map.get("Resolved - Pending Verification", 0)
        closed_count = status_map.get("Closed", 0)

        # Department breakdown
        cursor.execute("""
        SELECT assigned_department as department,
               count(*) as total_cases,
               count(CASE WHEN status IN ('Submitted', 'Assigned', 'In Progress', 'On Hold') THEN 1 END) as active_backlog,
               count(CASE WHEN status = 'Closed' THEN 1 END) as closed_cases
        FROM complaints
        GROUP BY assigned_department;
        """)
        dept_stats = [dict(r) for r in cursor.fetchall()]

        # Overdue / At-Risk Detection: active cases where elapsed hours > predicted_duration_hours
        cursor.execute("""
        SELECT id, reference_no, problem, borough, assigned_department, priority, status,
               created_at, predicted_duration_hours
        FROM complaints
        WHERE status IN ('Submitted', 'Assigned', 'In Progress', 'On Hold');
        """)
        active_rows = cursor.fetchall()

        overdue_cases = []
        for r in active_rows:
            try:
                c_time = datetime.strptime(r["created_at"], "%Y-%m-%d %H:%M:%S")
                elapsed_hrs = (now - c_time).total_seconds() / 3600.0
                pred_hrs = float(r["predicted_duration_hours"] or 24.0)
                if elapsed_hrs > pred_hrs:
                    case_dict = dict(r)
                    case_dict["elapsed_hours"] = round(elapsed_hrs, 1)
                    case_dict["overdue_hours"] = round(elapsed_hrs - pred_hrs, 1)
                    overdue_cases.append(case_dict)
            except Exception:
                pass

        # Predicted vs Actual resolution comparison on closed tickets
        cursor.execute("""
        SELECT reference_no, problem, predicted_duration_hours, actual_resolution_hours
        FROM complaints
        WHERE status = 'Closed' AND actual_resolution_hours IS NOT NULL;
        """)
        closed_rows = [dict(r) for r in cursor.fetchall()]

        return {
            "total_complaints": sum(status_map.values()),
            "total_active": total_active,
            "unassigned_count": unassigned_count,
            "in_progress_count": in_progress_count,
            "on_hold_count": on_hold_count,
            "pending_verification_count": pending_verification_count,
            "closed_count": closed_count,
            "overdue_count": len(overdue_cases),
            "overdue_cases": overdue_cases[:10],
            "department_stats": dept_stats,
            "closed_duration_comparisons": closed_rows
        }
    finally:
        conn.close()
