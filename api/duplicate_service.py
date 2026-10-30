"""
api/duplicate_service.py

Central Complaint Registry & Cross-Citizen Duplicate Intelligence Service.
Features:
- Cross-citizen duplicate detection combining normalized addresses,
  category compatibility, genuine GPS Haversine distance, and rolling time window.
- Excludes closed/rejected records and filters out non-genuine centroid coordinates.
- Privacy-preserving candidate payloads for citizen pre-submission advisory (zero PII).
- Administrative linking workflow with cycle prevention, self-link prevention,
  and immutable timeline audit logging.
"""

import math
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple

from api.location_service import normalize_address, BOROUGH_CENTROIDS


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute great-circle distance between two GPS points in meters using stdlib math.
    """
    r = 6371000.0  # Earth's mean radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return r * c


def is_valid_gps(lat: Optional[float], lon: Optional[float]) -> bool:
    """
    Determine if coordinates represent genuine location data rather than
    unverified defaults, (0, 0), or borough fallback centroids.
    """
    if lat is None or lon is None:
        return False
    try:
        f_lat = float(lat)
        f_lon = float(lon)
    except (ValueError, TypeError):
        return False

    if f_lat == 0.0 and f_lon == 0.0:
        return False

    # Check against borough centroid fallbacks (which must never be used for real spatial proximity)
    for c_lat, c_lon in BOROUGH_CENTROIDS.values():
        if abs(f_lat - c_lat) < 0.0002 and abs(f_lon - c_lon) < 0.0002:
            return False

    return -90.0 <= f_lat <= 90.0 and -180.0 <= f_lon <= 180.0


def are_categories_compatible(cat1: str, detail1: Optional[str], cat2: str, detail2: Optional[str]) -> bool:
    """
    Verify if two complaint categories or problem types are identical or operationally related.
    """
    c1 = (cat1 or "").strip().upper()
    c2 = (cat2 or "").strip().upper()
    if c1 == c2:
        return True

    # Related municipal problem groups
    related_groups = [
        {"STREET CONDITION", "SIDEWALK CONDITION"},
        {"DIRTY CONDITIONS", "RODENT", "SANITATION CONDITION"},
        {"NOISE - RESIDENTIAL", "NOISE - COMMERCIAL", "NOISE"},
        {"WATER MAINTENANCE", "SEWER"},
    ]
    for group in related_groups:
        if c1 in group and c2 in group:
            return True

    return False


def find_duplicate_candidates(
    conn,
    complaint_data: Dict[str, Any],
    current_complaint_id: Optional[int] = None,
    distance_threshold_m: float = 150.0,
    time_window_hours: float = 72.0
) -> List[Dict[str, Any]]:
    """
    Detect cross-citizen duplicate candidates for an incoming or existing complaint.
    Returns sanitized candidate records containing ZERO citizen PII.
    """
    target_addr = (complaint_data.get("incident_address") or "").strip()
    target_norm_addr = complaint_data.get("normalized_address") or normalize_address(target_addr)
    target_problem = complaint_data.get("problem", "")
    target_detail = complaint_data.get("problem_detail", "")
    target_lat = complaint_data.get("latitude")
    target_lon = complaint_data.get("longitude")
    target_has_gps = is_valid_gps(target_lat, target_lon)

    # Compute rolling time cutoff
    now = datetime.utcnow()
    cutoff_time = (now - timedelta(hours=time_window_hours)).strftime("%Y-%m-%d %H:%M:%S")

    cursor = conn.cursor()
    # Query active complaints in the time window (exclude Closed, Rejected)
    query = """
    SELECT id, reference_no, problem, problem_detail, borough, incident_address,
           normalized_address, latitude, longitude, status, assigned_staff_id,
           created_at, canonical_complaint_id, duplicate_status
    FROM complaints
    WHERE status NOT IN ('Closed', 'Rejected')
      AND created_at >= ?
    """
    params: List[Any] = [cutoff_time]

    if current_complaint_id:
        query += " AND id != ?"
        params.append(current_complaint_id)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    candidates = []
    for r in rows:
        cand_id = r["id"]
        cand_ref = r["reference_no"]
        cand_prob = r["problem"]
        cand_detail = r["problem_detail"]
        cand_addr = r["incident_address"]
        cand_norm_addr = r["normalized_address"] or normalize_address(cand_addr)
        cand_lat = r["latitude"]
        cand_lon = r["longitude"]
        cand_has_gps = is_valid_gps(cand_lat, cand_lon)

        # Check category compatibility first
        if not are_categories_compatible(target_problem, target_detail, cand_prob, cand_detail):
            continue

        match_tier = None
        match_reason = None
        dist_m = None

        # 1. Address Match: exact normalized address
        if target_norm_addr and cand_norm_addr and target_norm_addr == cand_norm_addr:
            match_tier = "STRONG"
            match_reason = f"Same normalized address ({target_norm_addr}) with matching issue ({cand_prob})."

        # 2. GPS Spatial Match: within distance threshold using genuine GPS
        if target_has_gps and cand_has_gps:
            try:
                calc_dist = haversine_distance_meters(
                    float(target_lat), float(target_lon),
                    float(cand_lat), float(cand_lon)
                )
                if calc_dist <= distance_threshold_m:
                    dist_m = round(calc_dist, 1)
                    if match_tier != "STRONG":
                        match_tier = "STRONG" if calc_dist <= 50.0 else "POSSIBLE"
                        match_reason = f"Nearby incident detected ({dist_m}m away) with matching issue ({cand_prob})."
            except Exception:
                pass

        if match_tier:
            candidates.append({
                "candidate_id": cand_id,
                "reference_no": cand_ref,
                "problem": cand_prob,
                "problem_detail": cand_detail,
                "incident_address": cand_addr,
                "borough": r["borough"],
                "status": r["status"],
                "created_at": r["created_at"],
                "distance_meters": dist_m,
                "has_assigned_staff": bool(r["assigned_staff_id"]),
                "match_tier": match_tier,
                "match_reason": match_reason,
            })

    # Sort so STRONG tiers appear first, then by distance or created_at
    candidates.sort(key=lambda c: (
        0 if c["match_tier"] == "STRONG" else 1,
        c["distance_meters"] if c["distance_meters"] is not None else 999999.0,
        c["created_at"]
    ))
    return candidates


def record_duplicate_candidates(conn, complaint_id: int, candidates: List[Dict[str, Any]]) -> int:
    """
    Persist identified duplicate candidates in complaint_duplicates for admin review.
    Marks complaint as CANDIDATE if not already canonical/duplicate.
    Returns count of recorded candidate pairs.
    """
    if not candidates:
        return 0

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    cursor = conn.cursor()
    recorded_count = 0

    for c in candidates:
        orig_id = c["candidate_id"]
        dup_id = complaint_id
        # Prevent self-link
        if orig_id == dup_id:
            continue

        try:
            cursor.execute("""
            INSERT OR IGNORE INTO complaint_duplicates (
                original_complaint_id, duplicate_complaint_id, match_tier,
                match_reason, distance_meters, review_status, created_at
            ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?);
            """, (
                orig_id,
                dup_id,
                c["match_tier"],
                c["match_reason"],
                c.get("distance_meters"),
                now_str
            ))
            if cursor.rowcount > 0:
                recorded_count += 1
        except Exception:
            pass

    # Update complaint duplicate_status to CANDIDATE if currently NONE
    cursor.execute("""
    UPDATE complaints
    SET duplicate_status = 'CANDIDATE', updated_at = ?
    WHERE id = ? AND duplicate_status = 'NONE';
    """, (now_str, complaint_id))

    return recorded_count


def review_duplicate_candidate(
    conn,
    duplicate_record_id: int,
    action: str,
    admin_id: int,
    admin_name: str,
    admin_role: str,
    reason: str
) -> Dict[str, Any]:
    """
    Transactional linking or dismissal of duplicate candidate pairs.
    action: 'LINK' or 'DISMISS'.
    reason: Mandatory audit justification string.
    Prevents self-linking and circular canonical graphs.
    """
    clean_action = (action or "").strip().upper()
    if clean_action not in ("LINK", "DISMISS"):
        raise ValueError("Invalid review action. Must be 'LINK' or 'DISMISS'.")

    clean_reason = (reason or "").strip()
    if len(clean_reason) < 3:
        raise ValueError("A justification reason (minimum 3 characters) is required.")

    cursor = conn.cursor()
    cursor.execute("""
    SELECT cd.id, cd.original_complaint_id, cd.duplicate_complaint_id, cd.review_status,
           c1.reference_no as original_ref, c2.reference_no as duplicate_ref,
           c1.canonical_complaint_id as orig_canonical_id, c2.canonical_complaint_id as dup_canonical_id
    FROM complaint_duplicates cd
    JOIN complaints c1 ON cd.original_complaint_id = c1.id
    JOIN complaints c2 ON cd.duplicate_complaint_id = c2.id
    WHERE cd.id = ?;
    """, (duplicate_record_id,))
    record = cursor.fetchone()

    if not record:
        raise LookupError(f"Duplicate record #{duplicate_record_id} not found.")

    # 1. Guard against already-reviewed records / concurrency check
    if record["review_status"] != "PENDING":
        raise ValueError(
            f"Duplicate candidate pair #{duplicate_record_id} has already been reviewed (status: {record['review_status']})."
        )

    orig_id = record["original_complaint_id"]
    dup_id = record["duplicate_complaint_id"]
    orig_ref = record["original_ref"]
    dup_ref = record["duplicate_ref"]
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # Prevent self-linking
    if orig_id == dup_id:
        raise ValueError("Cannot link complaint to itself.")

    if clean_action == "LINK":
        # 2. Prevent duplicate from being linked to a different canonical parent if already linked
        if record["dup_canonical_id"] is not None and record["dup_canonical_id"] != orig_id:
            raise ValueError(f"Complaint {dup_ref} is already linked to another canonical complaint.")

        # 3. Prevent linking to an original complaint that is itself already a duplicate
        if record["orig_canonical_id"] is not None:
            raise ValueError(
                f"Cannot link to complaint {orig_ref} because it is already marked as a duplicate of another ticket."
            )

        # 4. Prevent linking a complaint that already acts as a canonical parent with dependents
        cursor.execute("SELECT id FROM complaints WHERE canonical_complaint_id = ? LIMIT 1;", (dup_id,))
        if cursor.fetchone():
            raise ValueError(
                f"Complaint {dup_ref} is already a canonical ticket with linked duplicates. Cannot link it as a child duplicate."
            )

        # Cycle prevention: check if original is already a duplicate of this complaint
        # or if original's canonical chain points to duplicate
        curr = orig_id
        visited = set()
        while curr:
            if curr == dup_id:
                raise ValueError(
                    f"Circular duplicate link detected: Complaint {orig_ref} is already linked to {dup_ref}."
                )
            visited.add(curr)
            cursor.execute("SELECT canonical_complaint_id FROM complaints WHERE id = ?;", (curr,))
            row = cursor.fetchone()
            curr = row["canonical_complaint_id"] if row and row["canonical_complaint_id"] else None
            if curr in visited:
                break

        # Atomic conditional update: ensures exactly one concurrent request can claim and review
        cursor.execute("""
        UPDATE complaint_duplicates
        SET review_status = 'LINKED', reviewed_by = ?, reviewed_at = ?, review_notes = ?
        WHERE id = ? AND review_status = 'PENDING';
        """, (admin_id, now_str, clean_reason, duplicate_record_id))
        if cursor.rowcount == 0:
            raise ValueError(
                f"Duplicate candidate pair #{duplicate_record_id} was already reviewed concurrently."
            )

        # Transactional linking of complaints
        # 1. Update duplicate complaint: point to original canonical, set status DUPLICATE
        cursor.execute("""
        UPDATE complaints
        SET canonical_complaint_id = ?, duplicate_status = 'DUPLICATE', updated_at = ?
        WHERE id = ? AND (canonical_complaint_id IS NULL OR canonical_complaint_id = ?);
        """, (orig_id, now_str, dup_id, orig_id))
        if cursor.rowcount == 0:
            raise ValueError(
                f"Complaint {dup_ref} was concurrently linked to another canonical complaint."
            )

        # 2. Update canonical complaint: set status CANONICAL if not already DUPLICATE
        cursor.execute("""
        UPDATE complaints
        SET duplicate_status = 'CANONICAL', updated_at = ?
        WHERE id = ? AND duplicate_status != 'CANONICAL';
        """, (now_str, orig_id))

        # 3. Append audit timeline entries to both complaints
        cursor.execute("""
        INSERT INTO complaint_history (
            complaint_id, actor_id, actor_name, actor_role, from_status, to_status,
            action, comment, is_public, created_at
        ) VALUES (?, ?, ?, ?, 'Submitted', 'Submitted', 'LINK_DUPLICATE', ?, 1, ?);
        """, (
            dup_id,
            admin_id,
            admin_name,
            admin_role,
            f"Linked as duplicate of canonical complaint {orig_ref}. Reason: {clean_reason}",
            now_str
        ))

        cursor.execute("""
        INSERT INTO complaint_history (
            complaint_id, actor_id, actor_name, actor_role, from_status, to_status,
            action, comment, is_public, created_at
        ) VALUES (?, ?, ?, ?, 'Submitted', 'Submitted', 'ADD_DUPLICATE', ?, 1, ?);
        """, (
            orig_id,
            admin_id,
            admin_name,
            admin_role,
            f"Duplicate complaint {dup_ref} linked to this canonical record. Reason: {clean_reason}",
            now_str
        ))

    elif clean_action == "DISMISS":
        # Atomic conditional update: ensures exactly one concurrent request can claim and review
        cursor.execute("""
        UPDATE complaint_duplicates
        SET review_status = 'DISMISSED', reviewed_by = ?, reviewed_at = ?, review_notes = ?
        WHERE id = ? AND review_status = 'PENDING';
        """, (admin_id, now_str, clean_reason, duplicate_record_id))
        if cursor.rowcount == 0:
            raise ValueError(
                f"Duplicate candidate pair #{duplicate_record_id} was already reviewed concurrently."
            )

        # If duplicate complaint has no other pending candidate links and is not already DUPLICATE,
        # reset its duplicate_status to NONE
        cursor.execute("""
        SELECT count(*) as pending_count
        FROM complaint_duplicates
        WHERE duplicate_complaint_id = ? AND review_status = 'PENDING';
        """, (dup_id,))
        pending_count = cursor.fetchone()["pending_count"]

        if pending_count == 0:
            cursor.execute("""
            UPDATE complaints
            SET duplicate_status = 'NONE', updated_at = ?
            WHERE id = ? AND duplicate_status = 'CANDIDATE';
            """, (now_str, dup_id))

        # Append audit timeline entry
        cursor.execute("""
        INSERT INTO complaint_history (
            complaint_id, actor_id, actor_name, actor_role, from_status, to_status,
            action, comment, is_public, created_at
        ) VALUES (?, ?, ?, ?, 'Submitted', 'Submitted', 'DISMISS_DUPLICATE', ?, 1, ?);
        """, (
            dup_id,
            admin_id,
            admin_name,
            admin_role,
            f"Duplicate candidate match with {orig_ref} dismissed. Reason: {clean_reason}",
            now_str
        ))

    return {
        "success": True,
        "record_id": duplicate_record_id,
        "action": clean_action,
        "original_ref": orig_ref,
        "duplicate_ref": dup_ref,
        "reviewed_at": now_str
    }

