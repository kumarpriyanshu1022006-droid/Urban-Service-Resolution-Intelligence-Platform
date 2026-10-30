"""
api/location_service.py

Location Intelligence, Address Normalization, and Geocoding Service
for NYC Municipal Complaints.

Features:
- Deterministic NYC address tokenization and normalization
- Real-time geocoding autocomplete via NYC Planning Labs Geosearch (with Nominatim fallback)
- In-memory bounded cache with TTL to minimize redundant upstream requests
- Validates latitude/longitude bounds against the NYC metropolitan area
- Provides borough centroid coordinates exclusively for ML feature preparation
  (leaving database coordinates strictly NULL when unverified)
"""

import re
import time
import json
import logging
import urllib.request
import urllib.parse
from typing import Optional, List, Dict, Any, Tuple

logger = logging.getLogger(__name__)

# Bounding box for New York City (all five boroughs + waterways)
NYC_BOUNDS = {
    "min_lat": 40.477,
    "max_lat": 40.917,
    "min_lon": -74.259,
    "max_lon": -73.700,
}

# Standard centroid coordinates for ML inference fallback only
BOROUGH_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "MANHATTAN": (40.7831, -73.9712),
    "BROOKLYN": (40.6782, -73.9442),
    "QUEENS": (40.7282, -73.7949),
    "BRONX": (40.8448, -73.8648),
    "STATEN ISLAND": (40.5795, -74.1502),
}
NYC_DEFAULT_CENTROID = (40.7128, -74.0060)

# Cardinal directions mapping
DIRECTION_MAP = {
    "N": "NORTH", "N.": "NORTH",
    "S": "SOUTH", "S.": "SOUTH",
    "E": "EAST", "E.": "EAST",
    "W": "WEST", "W.": "WEST",
    "NE": "NORTHEAST", "NE.": "NORTHEAST",
    "NW": "NORTHWEST", "NW.": "NORTHWEST",
    "SE": "SOUTHEAST", "SE.": "SOUTHEAST",
    "SW": "SOUTHWEST", "SW.": "SOUTHWEST",
}

# Street suffix standardization mapping
SUFFIX_MAP = {
    "ST": "STREET", "ST.": "STREET", "STR": "STREET",
    "AVE": "AVENUE", "AVE.": "AVENUE", "AV": "AVENUE", "AV.": "AVENUE",
    "RD": "ROAD", "RD.": "ROAD",
    "BLVD": "BOULEVARD", "BLVD.": "BOULEVARD",
    "DR": "DRIVE", "DR.": "DRIVE",
    "LN": "LANE", "LN.": "LANE",
    "CT": "COURT", "CT.": "COURT",
    "PL": "PLACE", "PL.": "PLACE",
    "PKWY": "PARKWAY", "PKWY.": "PARKWAY", "PWKY": "PARKWAY",
    "TER": "TERRACE", "TER.": "TERRACE", "TERR": "TERRACE",
    "WAY": "WAY",
    "CIR": "CIRCLE", "CIR.": "CIRCLE",
    "EXPY": "EXPRESSWAY", "EXPY.": "EXPRESSWAY",
    "HWY": "HIGHWAY", "HWY.": "HIGHWAY",
    "SQ": "SQUARE", "SQ.": "SQUARE",
}

# In-memory autocomplete cache with 1-hour TTL
_AUTOCOMPLETE_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
CACHE_TTL_SECONDS = 3600
MAX_CACHE_SIZE = 1000


def normalize_address(address: Optional[str]) -> str:
    """
    Produce a deterministic, normalized NYC address string.
    Expands cardinal directions and street suffixes, standardizes punctuation and spacing.
    """
    if not address or not address.strip():
        return ""

    cleaned = address.strip().upper()
    # Replace non-alphanumeric separators (except &, /, -) with space
    cleaned = re.sub(r"[^\w\s\&\/\-]", " ", cleaned)
    tokens = cleaned.split()

    normalized_tokens = []
    for token in tokens:
        if token in DIRECTION_MAP:
            normalized_tokens.append(DIRECTION_MAP[token])
        elif token in SUFFIX_MAP:
            normalized_tokens.append(SUFFIX_MAP[token])
        else:
            normalized_tokens.append(token)

    return " ".join(normalized_tokens)


def is_within_nyc(lat: Optional[float], lon: Optional[float]) -> bool:
    """Validate whether coordinates fall inside the NYC metropolitan boundary."""
    if lat is None or lon is None:
        return False
    try:
        f_lat = float(lat)
        f_lon = float(lon)
        return (
            NYC_BOUNDS["min_lat"] <= f_lat <= NYC_BOUNDS["max_lat"]
            and NYC_BOUNDS["min_lon"] <= f_lon <= NYC_BOUNDS["max_lon"]
        )
    except (ValueError, TypeError):
        return False


def get_borough_centroid(borough: Optional[str]) -> Tuple[float, float]:
    """
    Return representative centroid coordinates for a borough.
    Exclusively used for ML model inference input when user coordinates are missing.
    """
    if not borough:
        return NYC_DEFAULT_CENTROID
    key = borough.strip().upper()
    return BOROUGH_CENTROIDS.get(key, NYC_DEFAULT_CENTROID)


def _clean_cache():
    """Prune expired entries from the autocomplete cache."""
    now = time.time()
    expired = [k for k, (ts, _) in _AUTOCOMPLETE_CACHE.items() if now - ts > CACHE_TTL_SECONDS]
    for k in expired:
        _AUTOCOMPLETE_CACHE.pop(k, None)
    if len(_AUTOCOMPLETE_CACHE) > MAX_CACHE_SIZE:
        # Evict oldest 20%
        sorted_keys = sorted(_AUTOCOMPLETE_CACHE.keys(), key=lambda k: _AUTOCOMPLETE_CACHE[k][0])
        for k in sorted_keys[: len(sorted_keys) // 5]:
            _AUTOCOMPLETE_CACHE.pop(k, None)


def geocode_autocomplete(query: str, borough: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Query NYC address autocomplete providers with caching and fallback.
    Returns a list of structured suggestion dictionaries.
    Gracefully handles offline environments and timeouts by returning [].
    """
    clean_query = query.strip()
    if len(clean_query) < 3:
        return []

    cache_key = f"{clean_query.lower()}|{(borough or '').upper()}"
    now = time.time()

    if cache_key in _AUTOCOMPLETE_CACHE:
        ts, cached_res = _AUTOCOMPLETE_CACHE[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return cached_res

    suggestions: List[Dict[str, Any]] = []

    # 1. Primary Provider: NYC Planning Labs Geosearch API
    try:
        params = {"text": clean_query}
        url = f"https://geosearch.planninglabs.nyc/v2/autocomplete?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "UrbanServiceResolutionPlatform/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            for feat in data.get("features", [])[:6]:
                props = feat.get("properties", {})
                geom = feat.get("geometry", {})
                coords = geom.get("coordinates", [])

                feat_borough = (props.get("borough") or "").upper()
                if borough and borough != "ALL" and feat_borough and feat_borough != borough.upper():
                    continue

                lon = coords[0] if len(coords) >= 2 else None
                lat = coords[1] if len(coords) >= 2 else None

                suggestions.append({
                    "label": props.get("label") or props.get("name") or clean_query,
                    "incident_address": props.get("name") or props.get("label") or clean_query,
                    "borough": feat_borough or borough or "MANHATTAN",
                    "incident_zip": props.get("postalcode") or "",
                    "latitude": lat,
                    "longitude": lon,
                    "confidence": props.get("confidence", 0.9),
                    "source": "NYC_PLANNING_LABS",
                })
    except Exception as exc:
        logger.debug(f"NYC Geosearch query failed: {exc}")

    # 2. Fallback Provider: OpenStreetMap Nominatim with NYC Viewbox (if primary returned 0)
    if not suggestions:
        try:
            search_text = f"{clean_query}, New York, NY"
            nom_params = {
                "q": search_text,
                "format": "json",
                "addressdetails": "1",
                "countrycodes": "us",
                "viewbox": "-74.259,40.477,-73.700,40.917",
                "bounded": "1",
                "limit": "5",
            }
            nom_url = f"https://nominatim.openstreetmap.org/search?{urllib.parse.urlencode(nom_params)}"
            req = urllib.request.Request(
                nom_url,
                headers={
                    "User-Agent": "UrbanServiceResolutionPlatform/1.0 (contact: admin@civic.nyc.gov)",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for item in data:
                    addr_info = item.get("address", {})
                    postcode = addr_info.get("postcode", "")
                    road = addr_info.get("road", "")
                    house_num = addr_info.get("house_number", "")
                    street_addr = f"{house_num} {road}".strip() if (house_num and road) else (item.get("display_name", "").split(",")[0])

                    lat = float(item["lat"]) if "lat" in item else None
                    lon = float(item["lon"]) if "lon" in item else None

                    # Infer borough from city_district/county/suburb
                    inferred_borough = "MANHATTAN"
                    for key in ["city_district", "suburb", "county", "city"]:
                        val = (addr_info.get(key) or "").upper()
                        for b in ["MANHATTAN", "BROOKLYN", "QUEENS", "BRONX", "STATEN ISLAND"]:
                            if b in val:
                                inferred_borough = b
                                break

                    suggestions.append({
                        "label": item.get("display_name") or clean_query,
                        "incident_address": street_addr or clean_query,
                        "borough": inferred_borough,
                        "incident_zip": postcode,
                        "latitude": lat,
                        "longitude": lon,
                        "confidence": 0.8,
                        "source": "NOMINATIM",
                    })
        except Exception as exc:
            logger.debug(f"Nominatim fallback failed: {exc}")

    _clean_cache()
    _AUTOCOMPLETE_CACHE[cache_key] = (now, suggestions)
    return suggestions


# In-memory reverse-geocoding cache with 1-hour TTL
_REVERSE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def _standardize_borough(raw_borough: Optional[str]) -> str:
    """Normalize raw provider borough string to standard NYC 5 boroughs."""
    if not raw_borough:
        return "MANHATTAN"
    val = raw_borough.strip().upper()
    if val in BOROUGH_CENTROIDS:
        return val
    if "MANHATTAN" in val or "NEW YORK" in val:
        return "MANHATTAN"
    if "BROOKLYN" in val or "KINGS" in val:
        return "BROOKLYN"
    if "QUEENS" in val:
        return "QUEENS"
    if "BRONX" in val:
        return "BRONX"
    if "STATEN" in val or "RICHMOND" in val:
        return "STATEN ISLAND"
    return "MANHATTAN"


def reverse_geocode(lat: Optional[float], lon: Optional[float]) -> Dict[str, Any]:
    """
    Reverse-geocode GPS coordinates into a structured human-readable address.
    
    1. Validates legal coordinate ranges (-90..90, -180..180).
    2. Primary for NYC locations: NYC Planning Labs Geosearch Reverse API.
    3. Global Fallback: OpenStreetMap Nominatim Reverse API (handles international coords).
    4. Caches results to prevent redundant upstream requests and observe rate limits.
    5. Correctly separates successful address detection from NYC municipal service eligibility.
    """
    if lat is None or lon is None:
        return {
            "success": False,
            "is_nyc": False,
            "outside_service_area": True,
            "error": "Coordinates are required.",
            "address": None,
            "incident_address": None,
            "borough": None,
            "incident_zip": None,
            "latitude": None,
            "longitude": None,
            "source": "INVALID"
        }

    try:
        f_lat = round(float(lat), 5)
        f_lon = round(float(lon), 5)
    except (ValueError, TypeError):
        return {
            "success": False,
            "is_nyc": False,
            "outside_service_area": True,
            "error": "Invalid numeric coordinates.",
            "address": None,
            "incident_address": None,
            "borough": None,
            "incident_zip": None,
            "latitude": None,
            "longitude": None,
            "source": "INVALID"
        }

    # Validate global coordinate ranges
    if not (-90.0 <= f_lat <= 90.0 and -180.0 <= f_lon <= 180.0):
        return {
            "success": False,
            "is_nyc": False,
            "outside_service_area": True,
            "error": "Coordinates are outside valid global ranges.",
            "address": None,
            "incident_address": None,
            "borough": None,
            "incident_zip": None,
            "latitude": f_lat,
            "longitude": f_lon,
            "source": "OUT_OF_BOUNDS"
        }

    is_nyc = is_within_nyc(f_lat, f_lon)
    cache_key = f"{f_lat}|{f_lon}"
    now = time.time()

    if cache_key in _REVERSE_CACHE:
        ts, cached_res = _REVERSE_CACHE[cache_key]
        if now - ts < CACHE_TTL_SECONDS:
            return cached_res

    # 1. Primary Provider for NYC coordinates: NYC Planning Labs Geosearch Reverse
    if is_nyc:
        try:
            url = f"https://geosearch.planninglabs.nyc/v2/reverse?point.lat={f_lat}&point.lon={f_lon}"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "UrbanServiceResolutionPlatform/1.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                features = data.get("features", [])
                if features:
                    props = features[0].get("properties", {})
                    label = props.get("label") or props.get("name") or ""
                    name = props.get("name") or (label.split(",")[0].strip() if label else "")
                    b_name = _standardize_borough(props.get("borough"))
                    postal = props.get("postalcode") or ""

                    if name or label:
                        result = {
                            "success": True,
                            "is_nyc": True,
                            "outside_service_area": False,
                            "address": label or name,
                            "incident_address": name or (label.split(",")[0].strip() if label else ""),
                            "borough": b_name,
                            "incident_zip": postal,
                            "latitude": f_lat,
                            "longitude": f_lon,
                            "source": "NYC_PLANNING_LABS"
                        }
                        _REVERSE_CACHE[cache_key] = (now, result)
                        return result
        except Exception as exc:
            logger.debug(f"NYC Geosearch reverse failed: {exc}")

    # 2. International Provider: OpenStreetMap Nominatim Reverse API
    # Resolves coordinates outside NYC (e.g. 28.4625, 77.4935) or when primary returns 0 features
    try:
        nom_url = f"https://nominatim.openstreetmap.org/reverse?lat={f_lat}&lon={f_lon}&format=json&addressdetails=1"
        req = urllib.request.Request(
            nom_url,
            headers={
                "User-Agent": "UrbanServiceResolutionPlatform/1.0 (contact: admin@civic.nyc.gov)",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            addr_info = data.get("address", {})
            road = addr_info.get("road", "")
            house_num = addr_info.get("house_number", "")
            suburb = addr_info.get("suburb") or addr_info.get("neighbourhood") or addr_info.get("subdistrict") or ""
            city = addr_info.get("city") or addr_info.get("town") or addr_info.get("village") or addr_info.get("state_district") or addr_info.get("state") or ""
            postcode = addr_info.get("postcode", "")
            display_name = data.get("display_name", "")

            # Formulate readable incident address
            if house_num and road:
                street_addr = f"{house_num} {road}"
            elif road:
                street_addr = f"{road}, {suburb}" if suburb else road
            elif suburb:
                street_addr = f"{suburb}, {city}" if city else suburb
            elif display_name:
                parts = [p.strip() for p in display_name.split(",") if p.strip()]
                street_addr = ", ".join(parts[:3]) if len(parts) >= 3 else display_name
            else:
                street_addr = ""

            if is_nyc:
                inferred_borough = "MANHATTAN"
                for key in ["city_district", "suburb", "county", "city", "borough"]:
                    val = addr_info.get(key)
                    if val:
                        inferred_borough = _standardize_borough(val)
                        break
                borough_val = inferred_borough
                outside_area = False
            else:
                # Outside NYC: do not assign fake NYC borough!
                borough_val = None
                outside_area = True

            if street_addr or display_name:
                result = {
                    "success": True,
                    "is_nyc": is_nyc,
                    "outside_service_area": outside_area,
                    "address": display_name or street_addr,
                    "incident_address": street_addr or display_name.split(",")[0].strip(),
                    "borough": borough_val,
                    "incident_zip": postcode,
                    "city": city,
                    "latitude": f_lat,
                    "longitude": f_lon,
                    "source": "NOMINATIM"
                }
                _REVERSE_CACHE[cache_key] = (now, result)
                return result
    except Exception as exc:
        logger.debug(f"Nominatim reverse fallback failed: {exc}")

    return {
        "success": False,
        "is_nyc": is_nyc,
        "outside_service_area": not is_nyc,
        "error": "No matching street address found for the provided coordinates.",
        "address": None,
        "incident_address": None,
        "borough": None,
        "incident_zip": None,
        "latitude": f_lat,
        "longitude": f_lon,
        "source": "NONE"
    }

