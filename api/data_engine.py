"""
Memory-efficient DuckDB read-only query engine for historical complaints.
Queries C:\\Users\\kumar\\Urban\\export.csv without loading into Pandas.
"""

from pathlib import Path
import threading
import time
from typing import Optional, Dict, Any, List
import duckdb

# --------------------------------------------------
# CONFIGURATION & CONSTANTS
# --------------------------------------------------

CSV_PATH = Path(r"C:\Users\kumar\Urban\export.csv")
CSV_SQL_PATH = "C:/Users/kumar/Urban/export.csv"

# Bounded scan window for responsive interactive queries
DEFAULT_SCAN_LIMIT = 50000
MAX_PAGE_SIZE = 100
CACHE_TTL_SECONDS = 3600  # 1 hour in-memory cache for aggregate summaries

# Concurrency semaphore: prevents concurrent scans from starving system resources
_CONCURRENCY_SEMAPHORE = threading.Semaphore(2)

# In-memory cache for successfully computed aggregations
_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Any] = {
    "summary": None,
    "summary_ts": 0.0,
    "distributions": None,
    "distributions_ts": 0.0,
    "filters": None,
    "filters_ts": 0.0,
}

# Strict sort allowlists to prevent SQL injection
VALID_SORT_COLUMNS = {
    "created_date": "created_dt",
    "closed_date": "closed_dt",
    "agency": "agency",
    "problem": "problem",
    "borough": "borough",
    "status": "status",
    "unique_key": "unique_key",
}

VALID_SORT_ORDERS = {
    "asc": "ASC",
    "desc": "DESC",
}


# --------------------------------------------------
# CONNECTION FACTORY
# --------------------------------------------------

def _create_connection() -> duckdb.DuckDBPyConnection:
    """Create a bounded, read-only DuckDB connection."""
    con = duckdb.connect(":memory:")
    con.execute("PRAGMA max_memory='1.5GB'")
    con.execute("PRAGMA threads=2")
    return con


def verify_csv_access() -> Dict[str, Any]:
    """Check whether the historical CSV is present and readable."""
    if not CSV_PATH.is_file():
        return {
            "available": False,
            "path": str(CSV_PATH),
            "error": "Historical CSV file not found at specified path."
        }
    try:
        size_bytes = CSV_PATH.stat().st_size
        return {
            "available": True,
            "path": str(CSV_PATH),
            "size_bytes": size_bytes,
            "size_gb": round(size_bytes / (1024 ** 3), 2)
        }
    except Exception as exc:
        return {
            "available": False,
            "path": str(CSV_PATH),
            "error": f"Failed to access CSV file: {exc}"
        }


# --------------------------------------------------
# PAGINATED & FILTERED COMPLAINTS
# --------------------------------------------------

def query_paginated_complaints(
    page: int = 1,
    page_size: int = 25,
    borough: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "created_date",
    sort_order: str = "desc",
    scan_limit: int = DEFAULT_SCAN_LIMIT
) -> Dict[str, Any]:
    """
    Fetch a paginated slice of complaints using bounded DuckDB streaming.
    All user filters are parameterized to prevent SQL injection.
    Unresolved complaints strictly return actual_resolution_days = None.
    """
    status_info = verify_csv_access()
    if not status_info["available"]:
        raise FileNotFoundError(status_info.get("error", "Historical CSV inaccessible."))

    # Validate pagination bounds
    page = max(1, int(page))
    page_size = max(1, min(MAX_PAGE_SIZE, int(page_size)))
    offset = (page - 1) * page_size

    # Validate sorting allowlists
    normalized_sort_by = sort_by.strip().lower()
    if normalized_sort_by not in VALID_SORT_COLUMNS:
        raise ValueError(
            f"Invalid sort_by '{sort_by}'. Allowed: {list(VALID_SORT_COLUMNS.keys())}"
        )
    sql_sort_col = VALID_SORT_COLUMNS[normalized_sort_by]

    normalized_sort_order = sort_order.strip().lower()
    if normalized_sort_order not in VALID_SORT_ORDERS:
        raise ValueError(
            f"Invalid sort_order '{sort_order}'. Allowed: {list(VALID_SORT_ORDERS.keys())}"
        )
    sql_sort_order = VALID_SORT_ORDERS[normalized_sort_order]

    # Build parameterized filter conditions
    where_clauses = []
    params = []

    if borough and borough.strip().upper() != "ALL":
        where_clauses.append('upper(borough) = ?')
        params.append(borough.strip().upper())

    if category and category.strip().upper() != "ALL":
        where_clauses.append('problem ILIKE ?')
        params.append(f"%{category.strip()}%")

    if status and status.strip().upper() != "ALL":
        where_clauses.append('status ILIKE ?')
        params.append(status.strip())

    if search and search.strip():
        sanitized_search = search.strip()[:80]  # bounded string length
        where_clauses.append(
            '(unique_key ILIKE ? OR problem ILIKE ? OR problem_detail ILIKE ? OR incident_zip ILIKE ?)'
        )
        search_pattern = f"%{sanitized_search}%"
        params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

    filter_sql = ""
    if where_clauses:
        filter_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
    WITH complaint_window AS (
        SELECT 
            "Unique Key" as unique_key,
            "Agency" as agency,
            "Agency Name" as agency_name,
            "Problem (formerly Complaint Type)" as problem,
            "Problem Detail (formerly Descriptor)" as problem_detail,
            "Location Type" as location_type,
            "Incident Zip" as incident_zip,
            "Borough" as borough,
            "Open Data Channel Type" as channel,
            "Created Date" as created_date,
            "Closed Date" as closed_date,
            "Status" as status,
            TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
            TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
        FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
        LIMIT {int(scan_limit)}
    ),
    filtered_set AS (
        SELECT 
            unique_key,
            agency,
            agency_name,
            problem,
            problem_detail,
            location_type,
            incident_zip,
            borough,
            channel,
            created_date,
            closed_date,
            status,
            created_dt,
            closed_dt,
            CASE 
                WHEN status = 'Closed' AND closed_dt IS NOT NULL AND created_dt IS NOT NULL AND closed_dt >= created_dt 
                THEN round(date_diff('second', created_dt, closed_dt) / 86400.0, 4)
                ELSE NULL 
            END as actual_resolution_days,
            CASE 
                WHEN status = 'Closed' AND closed_dt IS NOT NULL AND created_dt IS NOT NULL AND closed_dt >= created_dt 
                THEN round(date_diff('second', created_dt, closed_dt) / 3600.0, 2)
                ELSE NULL 
            END as actual_resolution_hours
        FROM complaint_window
        {filter_sql}
    )
    SELECT * 
    FROM filtered_set
    ORDER BY {sql_sort_col} {sql_sort_order} NULLS LAST
    LIMIT {page_size + 1} OFFSET {offset}
    """

    count_query = f"""
    WITH complaint_window AS (
        SELECT 
            "Unique Key" as unique_key,
            "Problem (formerly Complaint Type)" as problem,
            "Problem Detail (formerly Descriptor)" as problem_detail,
            "Incident Zip" as incident_zip,
            "Borough" as borough,
            "Status" as status
        FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
        LIMIT {int(scan_limit)}
    )
    SELECT count(*) as total_matching
    FROM complaint_window
    {filter_sql}
    """

    acquired = _CONCURRENCY_SEMAPHORE.acquire(timeout=10.0)
    if not acquired:
        raise TimeoutError("System busy. Please retry query shortly.")

    try:
        con = _create_connection()
        t0 = time.time()

        # Execute data slice
        rows_df = con.execute(query, params).df()

        # Determine has_next without full-dataset scan
        has_next = len(rows_df) > page_size
        if has_next:
            rows_df = rows_df.iloc[:page_size]

        # Execute bounded matching count
        total_matching = int(con.execute(count_query, params).fetchone()[0])
        elapsed = round(time.time() - t0, 3)

        records = rows_df.to_dict(orient="records")

        # Clean NaN/NaT values for JSON compliance
        cleaned_records = []
        for r in records:
            cleaned_records.append({
                "unique_key": str(r.get("unique_key") or ""),
                "agency": str(r.get("agency") or ""),
                "agency_name": str(r.get("agency_name") or ""),
                "problem": str(r.get("problem") or ""),
                "problem_detail": str(r.get("problem_detail") or ""),
                "location_type": str(r.get("location_type") or ""),
                "incident_zip": str(r.get("incident_zip") or ""),
                "borough": str(r.get("borough") or ""),
                "channel": str(r.get("channel") or ""),
                "created_date": str(r.get("created_date") or ""),
                "closed_date": str(r.get("closed_date")) if r.get("closed_date") is not None else None,
                "status": str(r.get("status") or ""),
                "actual_resolution_days": float(r["actual_resolution_days"]) if r.get("actual_resolution_days") is not None and str(r["actual_resolution_days"]) != "nan" else None,
                "actual_resolution_hours": float(r["actual_resolution_hours"]) if r.get("actual_resolution_hours") is not None and str(r["actual_resolution_hours"]) != "nan" else None,
            })

        total_pages = max(1, (total_matching + page_size - 1) // page_size)

        return {
            "dataset_scope": "bounded_scan_window",
            "page": page,
            "page_size": page_size,
            "window_matching_records": total_matching,
            "total_matching": total_matching,  # compatibility alias
            "total_pages": total_pages,
            "has_next": has_next,
            "has_prev": page > 1,
            "scan_window_size": scan_limit,
            "query_duration_seconds": elapsed,
            "scope_disclosure": f"Results and match counts apply strictly within the bounded scan window of {scan_limit} records, not the entire historical archive.",
            "records": cleaned_records,
        }
    finally:
        _CONCURRENCY_SEMAPHORE.release()


# --------------------------------------------------
# POINT LOOKUP FOR SINGLE RECORD
# --------------------------------------------------

def query_complaint_by_id(
    unique_key: str,
    scan_limit: int = DEFAULT_SCAN_LIMIT
) -> Optional[Dict[str, Any]]:
    """Retrieve full detail attributes for a single complaint record."""
    status_info = verify_csv_access()
    if not status_info["available"]:
        raise FileNotFoundError(status_info.get("error", "Historical CSV inaccessible."))

    sanitized_key = str(unique_key).strip()
    if not sanitized_key:
        return None

    query = f"""
    WITH complaint_window AS (
        SELECT 
            "Unique Key" as unique_key,
            "Agency" as agency,
            "Agency Name" as agency_name,
            "Problem (formerly Complaint Type)" as problem,
            "Problem Detail (formerly Descriptor)" as problem_detail,
            "Location Type" as location_type,
            "Incident Zip" as incident_zip,
            "Incident Address" as incident_address,
            "City" as city,
            "Borough" as borough,
            "Status" as status,
            "Open Data Channel Type" as channel,
            "Created Date" as created_date,
            "Closed Date" as closed_date,
            "Community Board" as community_board,
            "Council District" as council_district,
            "Police Precinct" as police_precinct,
            "Latitude" as latitude,
            "Longitude" as longitude,
            TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
            TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
        FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
        LIMIT {int(scan_limit)}
    )
    SELECT *,
        CASE 
            WHEN status = 'Closed' AND closed_dt IS NOT NULL AND closed_dt >= created_dt 
            THEN round(date_diff('second', created_dt, closed_dt) / 86400.0, 4)
            ELSE NULL 
        END as actual_resolution_days,
        CASE 
            WHEN status = 'Closed' AND closed_dt IS NOT NULL AND closed_dt >= created_dt 
            THEN round(date_diff('second', created_dt, closed_dt) / 3600.0, 2)
            ELSE NULL 
        END as actual_resolution_hours
    FROM complaint_window
    WHERE unique_key = ?
    LIMIT 1
    """

    acquired = _CONCURRENCY_SEMAPHORE.acquire(timeout=10.0)
    if not acquired:
        raise TimeoutError("System busy. Please retry query shortly.")

    try:
        con = _create_connection()
        res_df = con.execute(query, [sanitized_key]).df()
        if res_df.empty:
            return None

        row = res_df.iloc[0].to_dict()
        return {
            "unique_key": str(row.get("unique_key") or ""),
            "agency": str(row.get("agency") or ""),
            "agency_name": str(row.get("agency_name") or ""),
            "problem": str(row.get("problem") or ""),
            "problem_detail": str(row.get("problem_detail") or ""),
            "location_type": str(row.get("location_type") or ""),
            "incident_zip": str(row.get("incident_zip") or ""),
            "incident_address": str(row.get("incident_address") or ""),
            "city": str(row.get("city") or ""),
            "borough": str(row.get("borough") or ""),
            "status": str(row.get("status") or ""),
            "channel": str(row.get("channel") or ""),
            "created_date": str(row.get("created_date") or ""),
            "closed_date": str(row.get("closed_date")) if row.get("closed_date") is not None else None,
            "community_board": str(row.get("community_board") or ""),
            "council_district": str(row.get("council_district") or ""),
            "police_precinct": str(row.get("police_precinct") or ""),
            "latitude": str(row.get("latitude") or ""),
            "longitude": str(row.get("longitude") or ""),
            "actual_resolution_days": float(row["actual_resolution_days"]) if row.get("actual_resolution_days") is not None and str(row["actual_resolution_days"]) != "nan" else None,
            "actual_resolution_hours": float(row["actual_resolution_hours"]) if row.get("actual_resolution_hours") is not None and str(row["actual_resolution_hours"]) != "nan" else None,
        }
    finally:
        _CONCURRENCY_SEMAPHORE.release()


# --------------------------------------------------
# HISTORICAL ANALYTICS SUMMARY (CACHED)
# --------------------------------------------------

def query_historical_summary(
    scan_limit: int = DEFAULT_SCAN_LIMIT,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Calculate summary metrics over verified source data.
    Caches successful results with TTL.
    """
    now = time.time()
    with _CACHE_LOCK:
        if not force_refresh and _CACHE["summary"] and (now - _CACHE["summary_ts"] < CACHE_TTL_SECONDS):
            cached = dict(_CACHE["summary"])
            cached["cached"] = True
            cached["cache_age_seconds"] = round(now - _CACHE["summary_ts"], 1)
            return cached

    status_info = verify_csv_access()
    if not status_info["available"]:
        raise FileNotFoundError(status_info.get("error", "Historical CSV inaccessible."))

    query = f"""
    WITH sample_window AS (
        SELECT 
            "Unique Key",
            "Status",
            TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
            TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
        FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
        LIMIT {int(scan_limit)}
    ),
    closed_cases AS (
        SELECT 
            date_diff('second', created_dt, closed_dt) as dur_sec
        FROM sample_window
        WHERE "Status" = 'Closed' AND closed_dt IS NOT NULL AND closed_dt >= created_dt
    )
    SELECT 
        (SELECT count(*) FROM sample_window) as total_records,
        (SELECT count(*) FROM closed_cases) as closed_records,
        (SELECT count(*) FROM sample_window WHERE "Status" != 'Closed' OR closed_dt IS NULL) as active_backlog,
        (SELECT count(*) FROM sample_window WHERE "Status" = 'Closed' AND closed_dt IS NOT NULL AND closed_dt < created_dt) as anomalous_records,
        (SELECT round(median(dur_sec) / 3600.0, 2) FROM closed_cases) as median_resolution_hours,
        (SELECT round(median(dur_sec) / 86400.0, 2) FROM closed_cases) as median_resolution_days,
        (SELECT round(count(CASE WHEN dur_sec <= 86400 THEN 1 END) * 100.0 / nullif(count(*), 0), 1) FROM closed_cases) as sub_24h_rate,
        (SELECT round(count(CASE WHEN dur_sec >= 345600 THEN 1 END) * 100.0 / nullif(count(*), 0), 1) FROM closed_cases) as extended_duration_rate
    """

    acquired = _CONCURRENCY_SEMAPHORE.acquire(timeout=15.0)
    if not acquired:
        raise TimeoutError("System busy. Please retry analytics query shortly.")

    try:
        con = _create_connection()
        t0 = time.time()
        res = con.execute(query).df().iloc[0].to_dict()
        elapsed = round(time.time() - t0, 3)

        total_scanned = int(res["total_records"])
        closed_cnt = int(res["closed_records"])
        active_cnt = int(res["active_backlog"])
        anomalous_cnt = int(res.get("anomalous_records", 0))

        payload = {
            "dataset_scope": "bounded_scan_window",
            "scan_window_size": scan_limit,
            "window_scanned_records": total_scanned,
            "window_closed_records": closed_cnt,
            "window_active_backlog": active_cnt,
            "window_anomalous_records": anomalous_cnt,
            # Aliases for backward compatibility
            "total_records": total_scanned,
            "closed_records": closed_cnt,
            "active_backlog": active_cnt,
            "median_resolution_hours": float(res["median_resolution_hours"]) if res["median_resolution_hours"] is not None else 0.0,
            "median_resolution_days": float(res["median_resolution_days"]) if res["median_resolution_days"] is not None else 0.0,
            "sub_24h_rate": float(res["sub_24h_rate"]) if res["sub_24h_rate"] is not None else 0.0,
            "extended_duration_rate": float(res["extended_duration_rate"]) if res["extended_duration_rate"] is not None else 0.0,
            "query_duration_seconds": elapsed,
            "scope_disclosure": f"Summary figures are calculated strictly across the bounded scan window of {scan_limit} records from export.csv, not the full historical archive.",
            "cached": False,
        }

        # Cache only on successful computation
        with _CACHE_LOCK:
            _CACHE["summary"] = payload
            _CACHE["summary_ts"] = now

        return payload
    finally:
        _CONCURRENCY_SEMAPHORE.release()


# --------------------------------------------------
# HISTORICAL DISTRIBUTIONS FOR CHARTS (CACHED)
# --------------------------------------------------

def query_historical_distributions(
    scan_limit: int = DEFAULT_SCAN_LIMIT,
    force_refresh: bool = False
) -> Dict[str, Any]:
    """
    Generate verified historical distributions for frontend charts:
    - Resolution duration buckets
    - Borough turnaround stats
    - Category workload ranking
    - Weekly volume dynamics
    """
    now = time.time()
    with _CACHE_LOCK:
        if not force_refresh and _CACHE["distributions"] and (now - _CACHE["distributions_ts"] < CACHE_TTL_SECONDS):
            cached = dict(_CACHE["distributions"])
            cached["cached"] = True
            cached["cache_age_seconds"] = round(now - _CACHE["distributions_ts"], 1)
            return cached

    status_info = verify_csv_access()
    if not status_info["available"]:
        raise FileNotFoundError(status_info.get("error", "Historical CSV inaccessible."))

    acquired = _CONCURRENCY_SEMAPHORE.acquire(timeout=15.0)
    if not acquired:
        raise TimeoutError("System busy. Please retry analytics query shortly.")

    try:
        con = _create_connection()
        t0 = time.time()

        # 1. Borough stats
        borough_query = f"""
        WITH sample_window AS (
            SELECT 
                "Borough" as borough,
                "Status" as status,
                TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
                TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
            FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
            LIMIT {int(scan_limit)}
        )
        SELECT 
            borough,
            count(*) as total,
            count(CASE WHEN status = 'Closed' AND closed_dt IS NOT NULL AND closed_dt >= created_dt THEN 1 END) as closed,
            count(CASE WHEN status != 'Closed' OR closed_dt IS NULL THEN 1 END) as active_backlog,
            round(coalesce(median(CASE WHEN status = 'Closed' AND closed_dt >= created_dt THEN date_diff('second', created_dt, closed_dt) / 86400.0 END), 0.0), 2) as median_days
        FROM sample_window
        WHERE borough IS NOT NULL AND borough != 'Unspecified' AND borough != ''
        GROUP BY borough
        ORDER BY total DESC
        """
        borough_df = con.execute(borough_query).df()

        # 2. Category workload
        cat_query = f"""
        WITH sample_window AS (
            SELECT 
                "Problem (formerly Complaint Type)" as problem,
                "Status" as status,
                TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
                TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
            FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
            LIMIT {int(scan_limit)}
        )
        SELECT 
            problem as category,
            count(*) as requests,
            round(coalesce(median(CASE WHEN status = 'Closed' AND closed_dt >= created_dt THEN date_diff('second', created_dt, closed_dt) / 86400.0 END), 0.0), 2) as median_days,
            round(coalesce(avg(CASE WHEN status = 'Closed' AND closed_dt >= created_dt THEN date_diff('second', created_dt, closed_dt) / 3600.0 END), 0.0), 1) as avg_hours
        FROM sample_window
        WHERE problem IS NOT NULL AND problem != ''
        GROUP BY problem
        ORDER BY requests DESC
        LIMIT 10
        """
        cat_df = con.execute(cat_query).df()

        # 3. Resolution duration distribution (all 6 standard buckets guaranteed)
        dist_query = f"""
        WITH sample_window AS (
            SELECT 
                "Status" as status,
                TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
                TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
            FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
            LIMIT {int(scan_limit)}
        ),
        closed_cases AS (
            SELECT 
                date_diff('second', created_dt, closed_dt) / 86400.0 as res_days
            FROM sample_window
            WHERE status = 'Closed' AND closed_dt IS NOT NULL AND created_dt IS NOT NULL AND closed_dt >= created_dt
        ),
        all_buckets AS (
            SELECT 1 as bucket_order, '< 12 hrs' as range_label UNION ALL
            SELECT 2, '12-24 hrs' UNION ALL
            SELECT 3, '1-2 days' UNION ALL
            SELECT 4, '2-4 days' UNION ALL
            SELECT 5, '4-7 days' UNION ALL
            SELECT 6, '> 7 days'
        ),
        bucketed AS (
            SELECT 
                CASE 
                    WHEN res_days < 0.5 THEN 1
                    WHEN res_days < 1.0 THEN 2
                    WHEN res_days < 2.0 THEN 3
                    WHEN res_days < 4.0 THEN 4
                    WHEN res_days < 7.0 THEN 5
                    ELSE 6
                END as bucket_order,
                count(*) as count
            FROM closed_cases
            GROUP BY 1
        )
        SELECT 
            b.range_label as range,
            coalesce(c.count, 0) as count,
            round(coalesce(c.count, 0) * 100.0 / nullif((SELECT count(*) FROM closed_cases), 0), 1) as percentage
        FROM all_buckets b
        LEFT JOIN bucketed c ON b.bucket_order = c.bucket_order
        ORDER BY b.bucket_order
        """
        dist_df = con.execute(dist_query).df()

        # 4. Weekly volume trend (complete 7-day week Mon-Sun in chronological order)
        weekly_query = f"""
        WITH sample_window AS (
            SELECT 
                "Status" as status,
                TRY_STRPTIME("Created Date", '%m/%d/%Y %I:%M:%S %p') as created_dt,
                TRY_STRPTIME("Closed Date", '%m/%d/%Y %I:%M:%S %p') as closed_dt
            FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
            LIMIT {int(scan_limit)}
        ),
        all_days AS (
            SELECT 1 as dow, 'Mon' as day UNION ALL
            SELECT 2, 'Tue' UNION ALL
            SELECT 3, 'Wed' UNION ALL
            SELECT 4, 'Thu' UNION ALL
            SELECT 5, 'Fri' UNION ALL
            SELECT 6, 'Sat' UNION ALL
            SELECT 7, 'Sun'
        ),
        daily_stats AS (
            SELECT 
                isodow(created_dt) as dow,
                count(*) as requests,
                round(coalesce(avg(CASE WHEN status = 'Closed' AND closed_dt IS NOT NULL AND created_dt IS NOT NULL AND closed_dt >= created_dt THEN date_diff('second', created_dt, closed_dt) / 3600.0 END), 0.0), 1) as avg_resolution_hours
            FROM sample_window
            WHERE created_dt IS NOT NULL
            GROUP BY isodow(created_dt)
        )
        SELECT 
            ad.day,
            ad.dow,
            coalesce(ds.requests, 0) as requests,
            coalesce(ds.avg_resolution_hours, 0.0) as avg_resolution_hours
        FROM all_days ad
        LEFT JOIN daily_stats ds ON ad.dow = ds.dow
        ORDER BY ad.dow
        """
        weekly_df = con.execute(weekly_query).df()

        elapsed = round(time.time() - t0, 3)

        payload = {
            "borough_stats": borough_df.to_dict(orient="records"),
            "category_workload": cat_df.to_dict(orient="records"),
            "resolution_distribution": dist_df.to_dict(orient="records"),
            "weekly_volume_trend": weekly_df.to_dict(orient="records"),
            "scan_window_size": scan_limit,
            "query_duration_seconds": elapsed,
            "cached": False,
        }

        with _CACHE_LOCK:
            _CACHE["distributions"] = payload
            _CACHE["distributions_ts"] = now

        return payload
    finally:
        _CONCURRENCY_SEMAPHORE.release()


# --------------------------------------------------
# DYNAMIC FILTER OPTIONS
# --------------------------------------------------

def query_distinct_filters(scan_limit: int = DEFAULT_SCAN_LIMIT) -> Dict[str, Any]:
    """Retrieve distinct boroughs, problem types, and statuses for filter dropdowns."""
    now = time.time()
    with _CACHE_LOCK:
        if _CACHE["filters"] and (now - _CACHE["filters_ts"] < CACHE_TTL_SECONDS):
            return _CACHE["filters"]

    status_info = verify_csv_access()
    if not status_info["available"]:
        raise FileNotFoundError(status_info.get("error", "Historical CSV inaccessible."))

    acquired = _CONCURRENCY_SEMAPHORE.acquire(timeout=10.0)
    if not acquired:
        raise TimeoutError("System busy. Please retry shortly.")

    try:
        con = _create_connection()
        query = f"""
        WITH sample_window AS (
            SELECT 
                "Borough" as borough,
                "Problem (formerly Complaint Type)" as problem,
                "Status" as status
            FROM read_csv('{CSV_SQL_PATH}', header=true, sample_size=200, all_varchar=true)
            LIMIT {int(scan_limit)}
        )
        SELECT 
            list(distinct borough) filter (where borough is not null and borough != '' and borough != 'Unspecified') as boroughs,
            list(distinct problem) filter (where problem is not null and problem != '') as categories,
            list(distinct status) filter (where status is not null and status != '') as statuses
        FROM sample_window
        """
        row = con.execute(query).df().iloc[0].to_dict()

        b_val = row.get("boroughs")
        c_val = row.get("categories")
        s_val = row.get("statuses")

        boroughs = sorted([str(x) for x in b_val if x]) if b_val is not None else []
        categories = sorted([str(x) for x in c_val if x])[:30] if c_val is not None else []
        statuses = sorted([str(x) for x in s_val if x]) if s_val is not None else []

        payload = {
            "boroughs": boroughs,
            "categories": categories,
            "statuses": statuses,
            "scan_window_size": scan_limit
        }

        with _CACHE_LOCK:
            _CACHE["filters"] = payload
            _CACHE["filters_ts"] = now

        return payload
    finally:
        _CONCURRENCY_SEMAPHORE.release()
