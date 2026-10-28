"""
Dedicated FastAPI router for read-only historical complaints and analytics queries.
Does not touch or modify POST /predict or any ML models.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from api.data_engine import (
    verify_csv_access,
    query_paginated_complaints,
    query_complaint_by_id,
    query_historical_summary,
    query_historical_distributions,
    query_distinct_filters,
    VALID_SORT_COLUMNS,
    VALID_SORT_ORDERS,
    DEFAULT_SCAN_LIMIT
)

router = APIRouter(prefix="/api/historical", tags=["Historical Data"])


@router.get("/status")
def get_historical_status():
    """Verify accessibility of the external 14.48 GB CSV file."""
    info = verify_csv_access()
    return info


@router.get("/complaints")
def list_historical_complaints(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page (max 100)"),
    borough: Optional[str] = Query(None, description="Filter by Borough name"),
    category: Optional[str] = Query(None, description="Filter by Complaint Category / Problem"),
    status: Optional[str] = Query(None, description="Filter by Ticket Status"),
    search: Optional[str] = Query(None, max_length=80, description="Search term for ID, type, ZIP"),
    sort_by: str = Query("created_date", description=f"Sort column: {list(VALID_SORT_COLUMNS.keys())}"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    scan_limit: int = Query(DEFAULT_SCAN_LIMIT, ge=1000, le=200000, description="Bounded query window size")
):
    """
    Paginated, filtered list of historical complaints.
    Unresolved complaints strictly return actual_resolution_days = null.
    """
    # Server-side validation of sort parameters
    if sort_by.strip().lower() not in VALID_SORT_COLUMNS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort_by '{sort_by}'. Allowed columns: {list(VALID_SORT_COLUMNS.keys())}"
        )

    if sort_order.strip().lower() not in VALID_SORT_ORDERS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort_order '{sort_order}'. Allowed values: ['asc', 'desc']"
        )

    try:
        data = query_paginated_complaints(
            page=page,
            page_size=page_size,
            borough=borough,
            category=category,
            status=status,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
            scan_limit=scan_limit
        )
        return data
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Historical dataset unavailable: {exc}"
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc)
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=str(exc)
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query historical complaints: {type(exc).__name__}: {exc}"
        ) from exc


@router.get("/complaints/{unique_key}")
def get_complaint_detail(
    unique_key: str,
    scan_limit: int = Query(DEFAULT_SCAN_LIMIT, ge=1000, le=200000)
):
    """Retrieve full attribute metadata for a single complaint record by Unique Key."""
    try:
        record = query_complaint_by_id(unique_key=unique_key, scan_limit=scan_limit)
        if not record:
            raise HTTPException(
                status_code=404,
                detail=f"Complaint record '{unique_key}' was not found in the recent search window."
            )
        return record
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Historical dataset unavailable: {exc}"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to lookup complaint: {type(exc).__name__}: {exc}"
        ) from exc


@router.get("/analytics/summary")
def get_analytics_summary(
    force_refresh: bool = Query(False, description="Bypass cache and recompute"),
    scan_limit: int = Query(DEFAULT_SCAN_LIMIT, ge=1000, le=200000)
):
    """
    Return calculated summary metrics over verified historical complaints.
    Unresolved complaints are excluded from resolution duration metrics and tracked as active_backlog.
    """
    try:
        summary = query_historical_summary(scan_limit=scan_limit, force_refresh=force_refresh)
        return summary
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Historical dataset unavailable: {exc}"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate historical summary: {type(exc).__name__}: {exc}"
        ) from exc


@router.get("/analytics/distributions")
def get_analytics_distributions(
    force_refresh: bool = Query(False, description="Bypass cache and recompute"),
    scan_limit: int = Query(DEFAULT_SCAN_LIMIT, ge=1000, le=200000)
):
    """
    Return calculated distribution datasets for UI charts:
    borough turnaround, category workload, duration histogram, weekly trends.
    """
    try:
        distributions = query_historical_distributions(scan_limit=scan_limit, force_refresh=force_refresh)
        return distributions
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Historical dataset unavailable: {exc}"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate historical distributions: {type(exc).__name__}: {exc}"
        ) from exc


@router.get("/filters")
def get_filter_options(
    scan_limit: int = Query(DEFAULT_SCAN_LIMIT, ge=1000, le=200000)
):
    """Return distinct boroughs, problem categories, and statuses for filter dropdowns."""
    try:
        options = query_distinct_filters(scan_limit=scan_limit)
        return options
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Historical dataset unavailable: {exc}"
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve filter options: {type(exc).__name__}: {exc}"
        ) from exc
