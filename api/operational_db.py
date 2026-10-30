"""
api/operational_db.py

Operational Relational Database Engine for the Urban Service Resolution Platform.
Uses standard library sqlite3 with WAL mode, foreign keys, and connection pooling.
Stores new complaints, user accounts, status audit history, notifications, and feedback.
Completely decoupled from the read-only DuckDB historical archive.
"""

import sqlite3
import os
import hashlib
import secrets
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple

# Database file location in data/
DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "operational.db"


def get_db_connection() -> sqlite3.Connection:
    """Create a thread-safe connection to the operational SQLite database."""
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


# --------------------------------------------------
# PASSWORD HASHING (Standard Library PBKDF2-HMAC-SHA256)
# --------------------------------------------------

def hash_password(password: str) -> str:
    """Hash password with secure salt using standard library hashlib."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100000
    )
    return f"{salt}${key.hex()}"


def verify_password(password: str, hashed_value: str) -> bool:
    """Verify plain password against stored salt$hash."""
    try:
        parts = hashed_value.split("$")
        if len(parts) != 2:
            return False
        salt, expected_hash = parts
        key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            iterations=100000
        )
        return secrets.compare_digest(key.hex(), expected_hash)
    except Exception:
        return False


CONFIGURED_DEPARTMENTS = [
    {
        "code": "DSNY",
        "name": "Department of Sanitation",
        "agency_name": "Department of Sanitation",
        "description": "Trash collection, illegal dumping, street sweeping, and recycling enforcement.",
        "contact": "212-555-0144"
    },
    {
        "code": "DOT",
        "name": "Department of Transportation",
        "agency_name": "Department of Transportation",
        "description": "Potholes, cave-ins, traffic signals, crosswalks, bridge and highway repairs.",
        "contact": "212-555-0188"
    },
    {
        "code": "NYPD",
        "name": "New York City Police Department",
        "agency_name": "New York City Police Department",
        "description": "Blocked hydrants, illegal parking obstruction, noise violations, traffic safety.",
        "contact": "212-555-0155"
    },
    {
        "code": "DEP",
        "name": "Department of Environmental Protection",
        "agency_name": "Department of Environmental Protection",
        "description": "Hydrant leaks, water pressure, hazardous odors, sewer catch-basin backups.",
        "contact": "212-555-0177"
    },
    {
        "code": "DOB",
        "name": "Department of Buildings",
        "agency_name": "Department of Buildings",
        "description": "Structural safety, unpermitted construction, scaffolding hazards, elevator maintenance.",
        "contact": "212-555-0120"
    },
    {
        "code": "DPR",
        "name": "Department of Parks and Recreation",
        "agency_name": "Department of Parks and Recreation",
        "description": "Downed tree limbs, park pathways, playground maintenance, public green spaces.",
        "contact": "212-555-0130"
    }
]


# --------------------------------------------------
# DATABASE INITIALIZATION & SCHEMA
# --------------------------------------------------

def init_operational_db():
    """Create tables, indexes, and initial seed accounts if they do not exist."""
    conn = get_db_connection()
    try:
        with conn:
            # 1. Users table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('citizen', 'staff', 'admin')),
                department TEXT,
                phone TEXT,
                created_at TEXT NOT NULL
            );
            """)

            # 2. Complaints table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS complaints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference_no TEXT UNIQUE NOT NULL,
                citizen_id INTEGER NOT NULL REFERENCES users(id),
                problem TEXT NOT NULL,
                problem_detail TEXT NOT NULL,
                agency TEXT NOT NULL,
                agency_name TEXT NOT NULL,
                borough TEXT NOT NULL,
                incident_zip TEXT NOT NULL,
                incident_address TEXT NOT NULL,
                location_type TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'ONLINE',
                description TEXT NOT NULL,
                evidence_url TEXT,
                latitude REAL,
                longitude REAL,
                location_source TEXT DEFAULT 'UNVERIFIED',
                gps_accuracy REAL,
                normalized_address TEXT,
                status TEXT NOT NULL DEFAULT 'Submitted' CHECK(
                    status IN (
                        'Submitted',
                        'Under Review',
                        'Assigned',
                        'In Progress',
                        'On Hold',
                        'Resolved - Pending Verification',
                        'Closed',
                        'Rejected'
                    )
                ),
                suggested_priority TEXT NOT NULL DEFAULT 'Medium' CHECK(
                    suggested_priority IN ('Low', 'Medium', 'High', 'Emergency')
                ),
                priority TEXT NOT NULL DEFAULT 'Medium' CHECK(
                    priority IN ('Low', 'Medium', 'High', 'Emergency')
                ),
                priority_override_reason TEXT,
                assigned_department TEXT,
                assigned_staff_id INTEGER REFERENCES users(id),
                predicted_duration_days REAL,
                predicted_duration_hours REAL,
                prediction_model_version TEXT,
                prediction_timestamp TEXT,
                hold_reason TEXT,
                hold_until TEXT,
                resolution_notes TEXT,
                resolution_evidence_url TEXT,
                actual_resolution_hours REAL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                resolved_at TEXT,
                closed_at TEXT,
                canonical_complaint_id INTEGER REFERENCES complaints(id),
                duplicate_status TEXT NOT NULL DEFAULT 'NONE' CHECK(
                    duplicate_status IN ('NONE', 'CANDIDATE', 'DUPLICATE', 'CANONICAL')
                )
            );
            """)

            # Safe column migration for existing operational databases
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(complaints);")
            columns = [row["name"] for row in cursor.fetchall()]
            if "suggested_priority" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN suggested_priority TEXT DEFAULT 'Medium';")
                cursor.execute("UPDATE complaints SET suggested_priority = priority WHERE suggested_priority IS NULL;")
            if "priority_override_reason" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN priority_override_reason TEXT;")
            if "location_source" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN location_source TEXT DEFAULT 'UNVERIFIED';")
            if "gps_accuracy" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN gps_accuracy REAL;")
            if "normalized_address" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN normalized_address TEXT;")
            if "canonical_complaint_id" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN canonical_complaint_id INTEGER REFERENCES complaints(id);")
            if "duplicate_status" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN duplicate_status TEXT DEFAULT 'NONE';")
                cursor.execute("UPDATE complaints SET duplicate_status = 'NONE' WHERE duplicate_status IS NULL;")
            if "completion_details" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN completion_details TEXT;")
            if "resolution_latitude" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN resolution_latitude REAL;")
            if "resolution_longitude" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN resolution_longitude REAL;")
            if "resolution_gps_accuracy" not in columns:
                cursor.execute("ALTER TABLE complaints ADD COLUMN resolution_gps_accuracy REAL;")

            # Indexes for high performance
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_ref ON complaints(reference_no);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_citizen ON complaints(citizen_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_staff ON complaints(assigned_staff_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_dept ON complaints(assigned_department);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_canonical ON complaints(canonical_complaint_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_complaints_dup_status ON complaints(duplicate_status);")

            # 2b. Central Duplicate Intelligence & Candidate Review Queue
            conn.execute("""
            CREATE TABLE IF NOT EXISTS complaint_duplicates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                duplicate_complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                match_tier TEXT NOT NULL CHECK(match_tier IN ('STRONG', 'POSSIBLE')),
                match_reason TEXT NOT NULL,
                distance_meters REAL,
                review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING', 'LINKED', 'DISMISSED')),
                reviewed_by INTEGER REFERENCES users(id),
                reviewed_at TEXT,
                review_notes TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(original_complaint_id, duplicate_complaint_id)
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dup_original ON complaint_duplicates(original_complaint_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dup_duplicate ON complaint_duplicates(duplicate_complaint_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_dup_status ON complaint_duplicates(review_status);")

            # 2c. Completion Evidence & Field Verification Assets
            conn.execute("""
            CREATE TABLE IF NOT EXISTS complaint_evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                uploader_id INTEGER NOT NULL REFERENCES users(id),
                file_path TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                content_type TEXT NOT NULL,
                evidence_type TEXT NOT NULL DEFAULT 'COMPLETION' CHECK(evidence_type IN ('COMPLETION', 'INITIAL', 'INSPECTION')),
                latitude REAL,
                longitude REAL,
                gps_accuracy REAL,
                location_source TEXT DEFAULT 'DEVICE_GPS',
                notes TEXT,
                created_at TEXT NOT NULL
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_evidence_complaint ON complaint_evidence(complaint_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_evidence_uploader ON complaint_evidence(uploader_id);")

            # 3. Status Audit History (Chronological Timeline)
            conn.execute("""
            CREATE TABLE IF NOT EXISTS complaint_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                actor_id INTEGER REFERENCES users(id),
                actor_name TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT NOT NULL,
                action TEXT NOT NULL,
                comment TEXT,
                is_public INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_history_complaint ON complaint_history(complaint_id);")

            # 4. Citizen Feedback
            conn.execute("""
            CREATE TABLE IF NOT EXISTS complaint_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complaint_id INTEGER UNIQUE NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
                citizen_id INTEGER NOT NULL REFERENCES users(id),
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                feedback_text TEXT,
                created_at TEXT NOT NULL
            );
            """)

            # 5. Notifications
            conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);")

            # --------------------------------------------------
            # SEED DEFAULT USERS (If table is empty or missing departments)
            # --------------------------------------------------
            cursor.execute("SELECT count(*) FROM users;")
            user_count = cursor.fetchone()[0]

            now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            if user_count == 0:
                seed_users = [
                    (
                        "admin@civic.nyc.gov",
                        hash_password("AdminPass123!"),
                        "Marcus Vance",
                        "admin",
                        "Operations",
                        "212-555-0100",
                        now_str
                    ),
                    (
                        "officer.smith@dsny.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Officer Sarah Smith",
                        "staff",
                        "DSNY",
                        "212-555-0144",
                        now_str
                    ),
                    (
                        "officer.chen@dot.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Officer David Chen",
                        "staff",
                        "DOT",
                        "212-555-0188",
                        now_str
                    ),
                    (
                        "officer.rivera@nypd.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Officer Marcus Rivera",
                        "staff",
                        "NYPD",
                        "212-555-0155",
                        now_str
                    ),
                    (
                        "inspector.rostova@dep.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Inspector Elena Rostova",
                        "staff",
                        "DEP",
                        "212-555-0177",
                        now_str
                    ),
                    (
                        "inspector.miller@dob.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Inspector Frank Miller",
                        "staff",
                        "DOB",
                        "212-555-0122",
                        now_str
                    ),
                    (
                        "ranger.vance@parks.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Ranger Chloe Vance",
                        "staff",
                        "DPR",
                        "212-555-0133",
                        now_str
                    ),
                    (
                        "citizen.jane@nyc.net",
                        hash_password("CitizenPass123!"),
                        "Jane Doe",
                        "citizen",
                        None,
                        "718-555-0199",
                        now_str
                    ),
                ]
                cursor.executemany("""
                INSERT INTO users (email, password_hash, full_name, role, department, phone, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """, seed_users)

                # Seed sample operational complaints to populate dashboards immediately
                seed_sample_complaints(conn, now_str)
            else:
                # Ensure NYPD, DEP, DOB, and DPR staff exist in existing operational DBs
                additional_staff = [
                    (
                        "officer.rivera@nypd.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Officer Marcus Rivera",
                        "staff",
                        "NYPD",
                        "212-555-0155",
                        now_str
                    ),
                    (
                        "inspector.rostova@dep.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Inspector Elena Rostova",
                        "staff",
                        "DEP",
                        "212-555-0177",
                        now_str
                    ),
                    (
                        "inspector.miller@dob.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Inspector Frank Miller",
                        "staff",
                        "DOB",
                        "212-555-0122",
                        now_str
                    ),
                    (
                        "ranger.vance@parks.nyc.gov",
                        hash_password("StaffPass123!"),
                        "Ranger Chloe Vance",
                        "staff",
                        "DPR",
                        "212-555-0133",
                        now_str
                    )
                ]
                for u in additional_staff:
                    cursor.execute("SELECT id FROM users WHERE email = ?;", (u[0],))
                    if not cursor.fetchone():
                        cursor.execute("""
                        INSERT INTO users (email, password_hash, full_name, role, department, phone, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?);
                        """, u)

    finally:
        conn.close()


def seed_sample_complaints(conn: sqlite3.Connection, base_time: str):
    """Seed a realistic set of initial operational complaints spanning different statuses."""
    cursor = conn.cursor()

    # Get user IDs
    cursor.execute("SELECT id FROM users WHERE email = 'citizen.jane@nyc.net';")
    citizen_row = cursor.fetchone()
    citizen_id = citizen_row[0] if citizen_row else 1

    cursor.execute("SELECT id FROM users WHERE email = 'officer.smith@dsny.nyc.gov';")
    smith_row = cursor.fetchone()
    smith_id = smith_row[0] if smith_row else 2

    cursor.execute("SELECT id FROM users WHERE email = 'officer.chen@dot.nyc.gov';")
    chen_row = cursor.fetchone()
    chen_id = chen_row[0] if chen_row else 3

    cursor.execute("SELECT id FROM users WHERE email = 'admin@civic.nyc.gov';")
    admin_row = cursor.fetchone()
    admin_id = admin_row[0] if admin_row else 1

    sample_complaints = [
        # 1. Submitted (New, Unassigned)
        {
            "reference_no": "NYC-2026-90412",
            "citizen_id": citizen_id,
            "problem": "Dirty Conditions",
            "problem_detail": "Trash / Illegal Dumping",
            "agency": "DSNY",
            "agency_name": "Department of Sanitation",
            "borough": "MANHATTAN",
            "incident_zip": "10001",
            "incident_address": "450 7th Ave",
            "location_type": "Sidewalk",
            "description": "Heavy bags of uncollected commercial garbage overflowing onto pedestrian sidewalk.",
            "latitude": 40.7505,
            "longitude": -73.9934,
            "status": "Submitted",
            "priority": "Medium",
            "assigned_department": "DSNY",
            "assigned_staff_id": None,
            "predicted_duration_days": 0.54,
            "predicted_duration_hours": 13.0,
            "prediction_model_version": "LightGBM_L2",
            "created_at": "2026-10-18 09:30:00",
            "updated_at": "2026-10-18 09:30:00",
            "history": [
                ("Submitted", "Submitted", "Complaint registered via citizen portal. Initial AI prediction: 13.0 hours.", "Jane Doe", "citizen", 1, "2026-10-18 09:30:00")
            ]
        },
        # 2. In Progress (Assigned to Officer Smith, DSNY)
        {
            "reference_no": "NYC-2026-88124",
            "citizen_id": citizen_id,
            "problem": "Dirty Conditions",
            "problem_detail": "Dumpster Overflow",
            "agency": "DSNY",
            "agency_name": "Department of Sanitation",
            "borough": "BROOKLYN",
            "incident_zip": "11201",
            "incident_address": "120 Adams St",
            "location_type": "Commercial",
            "description": "Large construction dumpster overflowing with debris onto bike lane.",
            "latitude": 40.6980,
            "longitude": -73.9890,
            "status": "In Progress",
            "priority": "High",
            "assigned_department": "DSNY",
            "assigned_staff_id": smith_id,
            "predicted_duration_days": 0.75,
            "predicted_duration_hours": 18.0,
            "prediction_model_version": "LightGBM_L2",
            "created_at": "2026-10-17 14:15:00",
            "updated_at": "2026-10-18 10:00:00",
            "history": [
                ("Submitted", "Submitted", "Complaint registered via citizen portal. Initial AI prediction: 18.0 hours.", "Jane Doe", "citizen", 1, "2026-10-17 14:15:00"),
                ("Submitted", "Assigned", "Assigned to DSNY enforcement squad.", "Marcus Vance", "admin", 1, "2026-10-17 15:00:00"),
                ("Assigned", "In Progress", "Officer Smith acknowledged ticket and dispatched sanitation inspection truck #402.", "Officer Sarah Smith", "staff", 1, "2026-10-18 10:00:00")
            ]
        },
        # 3. On Hold (Pothole needing contractor asphalt crew)
        {
            "reference_no": "NYC-2026-77319",
            "citizen_id": citizen_id,
            "problem": "Street Condition",
            "problem_detail": "Pothole Emergency",
            "agency": "DOT",
            "agency_name": "Department of Transportation",
            "borough": "QUEENS",
            "incident_zip": "11375",
            "incident_address": "71st Ave & Queens Blvd",
            "location_type": "Street",
            "description": "Deep 8-inch pothole causing tire damage in center lane.",
            "latitude": 40.7215,
            "longitude": -73.8445,
            "status": "On Hold",
            "priority": "Emergency",
            "assigned_department": "DOT",
            "assigned_staff_id": chen_id,
            "predicted_duration_days": 1.2,
            "predicted_duration_hours": 28.8,
            "prediction_model_version": "LightGBM_L2",
            "hold_reason": "Severe rainfall prevented hot asphalt application; rescheduled for dry conditions.",
            "hold_until": "2026-10-21 08:00:00",
            "created_at": "2026-10-16 11:00:00",
            "updated_at": "2026-10-17 16:30:00",
            "history": [
                ("Submitted", "Submitted", "Pothole reported by citizen.", "Jane Doe", "citizen", 1, "2026-10-16 11:00:00"),
                ("Submitted", "Assigned", "Assigned to DOT Queens rapid repair crew.", "Marcus Vance", "admin", 1, "2026-10-16 11:30:00"),
                ("Assigned", "In Progress", "Crew inspected site and placed emergency reflective safety cones.", "Officer David Chen", "staff", 1, "2026-10-16 13:00:00"),
                ("In Progress", "On Hold", "Heavy rain storm halted paving. Resuming upon ground dry-out.", "Officer David Chen", "staff", 1, "2026-10-17 16:30:00")
            ]
        },
        # 4. Resolved - Pending Verification (Staff completed work)
        {
            "reference_no": "NYC-2026-64102",
            "citizen_id": citizen_id,
            "problem": "Illegal Parking",
            "problem_detail": "Blocked Hydrant",
            "agency": "NYPD",
            "agency_name": "New York City Police Department",
            "borough": "BRONX",
            "incident_zip": "10451",
            "incident_address": "Grand Concourse & E 161st St",
            "location_type": "Street/Sidewalk",
            "description": "Commercial truck parked directly across active fire hydrant.",
            "latitude": 40.8260,
            "longitude": -73.9230,
            "status": "Resolved - Pending Verification",
            "priority": "High",
            "assigned_department": "NYPD",
            "assigned_staff_id": None,
            "predicted_duration_days": 0.15,
            "predicted_duration_hours": 3.6,
            "prediction_model_version": "LightGBM_L2",
            "resolution_notes": "Summons #NYPD-88219 issued. Vehicle towed from hydrant zone.",
            "created_at": "2026-10-19 08:00:00",
            "updated_at": "2026-10-19 11:15:00",
            "resolved_at": "2026-10-19 11:15:00",
            "history": [
                ("Submitted", "Submitted", "Vehicle blocking hydrant reported.", "Jane Doe", "citizen", 1, "2026-10-19 08:00:00"),
                ("Submitted", "In Progress", "Patrol car dispatched to location.", "Marcus Vance", "admin", 1, "2026-10-19 08:45:00"),
                ("In Progress", "Resolved - Pending Verification", "Summons issued and tow truck cleared hydrant.", "Marcus Vance", "admin", 1, "2026-10-19 11:15:00")
            ]
        },
        # 5. Closed (Fully Verified & Closed)
        {
            "reference_no": "NYC-2026-51980",
            "citizen_id": citizen_id,
            "problem": "Noise - Residential",
            "problem_detail": "Loud Music/Party",
            "agency": "NYPD",
            "agency_name": "New York City Police Department",
            "borough": "MANHATTAN",
            "incident_zip": "10002",
            "incident_address": "88 Ludlow St",
            "location_type": "Residential",
            "description": "Excessive stereo noise past midnight.",
            "latitude": 40.7180,
            "longitude": -73.9900,
            "status": "Closed",
            "priority": "Low",
            "assigned_department": "NYPD",
            "assigned_staff_id": None,
            "predicted_duration_days": 0.1,
            "predicted_duration_hours": 2.4,
            "actual_resolution_hours": 2.2,
            "prediction_model_version": "LightGBM_L2",
            "resolution_notes": "Officers arrived at scene, tenant complied with noise reduction order.",
            "created_at": "2026-10-15 01:00:00",
            "updated_at": "2026-10-15 03:12:00",
            "resolved_at": "2026-10-15 03:12:00",
            "closed_at": "2026-10-15 03:15:00",
            "history": [
                ("Submitted", "Submitted", "Noise complaint received.", "Jane Doe", "citizen", 1, "2026-10-15 01:00:00"),
                ("Submitted", "In Progress", "Unit 14 dispatched.", "Marcus Vance", "admin", 1, "2026-10-15 01:30:00"),
                ("In Progress", "Resolved - Pending Verification", "Condition corrected on arrival.", "Marcus Vance", "admin", 1, "2026-10-15 03:12:00"),
                ("Resolved - Pending Verification", "Closed", "Admin verified officer bodycam log. Case closed.", "Marcus Vance", "admin", 1, "2026-10-15 03:15:00")
            ]
        }
    ]

    for item in sample_complaints:
        cursor.execute("""
        INSERT INTO complaints (
            reference_no, citizen_id, problem, problem_detail, agency, agency_name,
            borough, incident_zip, incident_address, location_type, description,
            latitude, longitude, status, suggested_priority, priority, priority_override_reason,
            assigned_department, assigned_staff_id, predicted_duration_days, predicted_duration_hours,
            prediction_model_version, prediction_timestamp, hold_reason, hold_until, resolution_notes,
            actual_resolution_hours, created_at, updated_at, resolved_at, closed_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        );
        """, (
            item["reference_no"],
            item["citizen_id"],
            item["problem"],
            item["problem_detail"],
            item["agency"],
            item["agency_name"],
            item["borough"],
            item["incident_zip"],
            item["incident_address"],
            item["location_type"],
            item["description"],
            item["latitude"],
            item["longitude"],
            item["status"],
            item.get("suggested_priority", item["priority"]),
            item["priority"],
            item.get("priority_override_reason"),
            item["assigned_department"],
            item["assigned_staff_id"],
            item["predicted_duration_days"],
            item["predicted_duration_hours"],
            item["prediction_model_version"],
            item["created_at"],
            item.get("hold_reason"),
            item.get("hold_until"),
            item.get("resolution_notes"),
            item.get("actual_resolution_hours"),
            item["created_at"],
            item["updated_at"],
            item.get("resolved_at"),
            item.get("closed_at")
        ))
        complaint_id = cursor.lastrowid

        # Insert history events
        for h in item["history"]:
            cursor.execute("""
            INSERT INTO complaint_history (
                complaint_id, actor_name, actor_role, from_status, to_status, action, comment, is_public, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                complaint_id,
                h[3],
                h[4],
                h[0],
                h[1],
                h[1],
                h[2],
                h[5],
                h[6]
            ))

    # Add 1 sample feedback record for the closed complaint
    cursor.execute("SELECT id FROM complaints WHERE reference_no = 'NYC-2026-51980';")
    closed_row = cursor.fetchone()
    if closed_row:
        cursor.execute("""
        INSERT INTO complaint_feedback (complaint_id, citizen_id, rating, feedback_text, created_at)
        VALUES (?, ?, 5, 'Quick response in the middle of the night. Thank you!', '2026-10-15 09:00:00');
        """, (closed_row[0], citizen_id))


# Ensure database and seed data are ready on import
init_operational_db()
