"""
api/auth.py

Authentication and Role-Based Access Control (RBAC) Module.
Uses standard library hmac, hashlib, secrets, and base64 for secure signed tokens.
Provides FastAPI dependencies for user authentication and role enforcement.
"""

import hmac
import hashlib
import base64
import json
import time
import os
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import api.operational_db as db

# Secret key for token signing (in production from environment, fallback to stable secret)
JWT_SECRET = os.environ.get("CIVIC_SECRET_KEY", "civic-urban-intelligence-secret-key-2026-v1")
TOKEN_TTL_SECONDS = 86400 * 7  # 7 days validity

security_bearer = HTTPBearer(auto_error=False)


def generate_token(user_id: int, email: str, role: str) -> str:
    """Generate a cryptographically signed session token."""
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
        "iat": int(time.time())
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode('utf-8')).decode('utf-8')
    signature = hmac.new(
        JWT_SECRET.encode('utf-8'),
        payload_b64.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verify signed token integrity and expiration."""
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None
        payload_b64, signature = parts
        expected_sig = hmac.new(
            JWT_SECRET.encode('utf-8'),
            payload_b64.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        
        # Decode and verify expiration
        payload_bytes = base64.urlsafe_b64decode(payload_b64.encode('utf-8'))
        payload = json.loads(payload_bytes.decode('utf-8'))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Dict[str, Any]:
    """FastAPI dependency to retrieve authenticated user from Authorization header."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please log in or provide a valid Bearer token."
        )
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid token. Please log in again."
        )

    user_id = payload.get("sub")
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, full_name, role, department, phone FROM users WHERE id = ?;", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User account no longer exists.")
        return dict(user)
    finally:
        conn.close()


def get_optional_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> Optional[Dict[str, Any]]:
    """FastAPI dependency to optionally retrieve authenticated user without raising 401."""
    if not credentials or not credentials.credentials:
        return None
    payload = verify_token(credentials.credentials)
    if not payload:
        return None
    user_id = payload.get("sub")
    conn = db.get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, full_name, role, department, phone FROM users WHERE id = ?;", (user_id,))
        user = cursor.fetchone()
        return dict(user) if user else None
    finally:
        conn.close()


def require_role(allowed_roles: List[str]):
    """Role-based access guard dependency."""
    def role_checker(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access forbidden: requires one of the following roles: {allowed_roles}."
            )
        return current_user
    return role_checker
