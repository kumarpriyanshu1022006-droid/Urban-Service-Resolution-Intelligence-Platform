
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# --------------------------------------------------
# 1. PATHS AND MODEL LOADING
# --------------------------------------------------

MODEL_DIR = Path(r"C:\Users\kumar\Urban\models")

MODEL_PATH = MODEL_DIR / "urban_resolution_final_pipeline.pkl"
CONFIG_PATH = MODEL_DIR / "urban_resolution_final_config.json"

if not MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Model not found: {MODEL_PATH}"
    )

if not CONFIG_PATH.is_file():
    raise FileNotFoundError(
        f"Config not found: {CONFIG_PATH}"
    )

# The saved pipeline already contains preprocessing.
model = joblib.load(MODEL_PATH)

with open(CONFIG_PATH, "r", encoding="utf-8") as file:
    config = json.load(file)

INPUT_FEATURES = config["input_features"]
CATEGORICAL_FEATURES = config["categorical_features"]
NUMERICAL_FEATURES = config["numerical_features"]

COMPLAINT_TYPE = "Problem (formerly Complaint Type)"
CREATED_DATE = "Created Date"

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Urban Service Resolution Intelligence API",
    description=(
        "Predicts complaint resolution time "
        "using a trained machine learning pipeline."
    ),
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.historical_router import router as historical_router
app.include_router(historical_router)

from api.operational_router import router as operational_router, set_predictor
app.include_router(operational_router, prefix="/api/operations", tags=["Operations"])



# --------------------------------------------------
# 2. REQUEST SCHEMA
# --------------------------------------------------

class PredictionRequest(BaseModel):
    complaint: dict = Field(
        ...,
        description="Complaint data using the training feature names."
    )


# --------------------------------------------------
# 3. HELPER FUNCTIONS
# --------------------------------------------------

def derive_project_category(complaint_type: str) -> str:
    """Derive the category only if the model expects this feature."""

    value = complaint_type.strip().casefold()

    if value == "illegal parking":
        return "Parking"
    if value == "water maintenance":
        return "Water Issue"
    if value == "noise - street/sidewalk":
        return "Street Condition"
    if value == "dirty conditions":
        return "Garbage / Waste"
    if value == "street light condition":
        return "Street Lighting"
    if value == "noise":
        return "Noise"

    return "Other"


def prepare_input(complaint: dict) -> pd.DataFrame:
    data = complaint.copy()

    # Validate complaint type.
    if COMPLAINT_TYPE not in data:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required field: {COMPLAINT_TYPE}"
        )

    if pd.isna(data[COMPLAINT_TYPE]) or not str(
        data[COMPLAINT_TYPE]
    ).strip():
        raise HTTPException(
            status_code=422,
            detail=f"{COMPLAINT_TYPE} cannot be empty."
        )

    # Validate and parse creation date.
    created_value = data.get(CREATED_DATE)

    if created_value is None or pd.isna(created_value):
        raise HTTPException(
            status_code=422,
            detail=f"Missing required field: {CREATED_DATE}"
        )

    created = pd.to_datetime(created_value, errors="coerce")

    if pd.isna(created):
        raise HTTPException(
            status_code=422,
            detail="Created Date must be a valid date/time."
        )

    # Derive date features using the same names as training.
    data["Created Hour"] = int(created.hour)
    data["Created Day"] = int(created.day)
    data["Created Month"] = int(created.month)
    data["Created DayOfWeek"] = int(created.dayofweek)

    # Add this only if it is an expected model feature.
    if "Project Issue Category" in INPUT_FEATURES:
        data["Project Issue Category"] = derive_project_category(
            str(data[COMPLAINT_TYPE])
        )

    # Check that every required feature is present.
    derived_fields = {
        "Created Hour",
        "Created Day",
        "Created Month",
        "Created DayOfWeek",
        "Project Issue Category"
    }

    missing = [
        feature
        for feature in INPUT_FEATURES
        if feature not in data and feature not in derived_fields
    ]

    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Required input features are missing.",
                "missing_features": missing
            }
        )

    # Keep feature order exactly as specified in the config.
    input_df = pd.DataFrame(
        [
            {
                feature: data.get(feature)
                for feature in INPUT_FEATURES
            }
        ],
        columns=INPUT_FEATURES
    )

    # Convert categorical values to strings, preserving nulls.
    for col in CATEGORICAL_FEATURES:
        if col in input_df.columns:
            input_df[col] = input_df[col].map(
                lambda value: (
                    str(value) if pd.notna(value) else np.nan
                )
            )

    # Convert numeric values safely.
    for col in NUMERICAL_FEATURES:
        if col in input_df.columns:
            input_df[col] = pd.to_numeric(
                input_df[col], errors="coerce"
            )

    return input_df


# --------------------------------------------------
# 4. HEALTH ENDPOINTS
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "Urban Service Resolution Intelligence API",
        "status": "running",
        "model": config.get("model_name", "LightGBM"),
        "version": app.version
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "pipeline_includes_preprocessing": True,
        "model_version": config.get("model_name", "LightGBM")
    }


def estimate_resolution(complaint: dict) -> dict:
    """Run model inference on a complaint dictionary and return formatted estimates."""
    input_df = prepare_input(complaint)

    try:
        raw_prediction = float(model.predict(input_df)[0])

        if not np.isfinite(raw_prediction):
            raise ValueError("The model returned an invalid prediction.")

        prediction_days = max(0.0, raw_prediction)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {type(exc).__name__}: {exc}"
        ) from exc

    total_minutes = round(prediction_days * 24 * 60)
    hours, minutes = divmod(total_minutes, 60)

    return {
        "predicted_resolution_days": round(prediction_days, 5),
        "predicted_resolution_hours": round(prediction_days * 24, 2),
        "predicted_resolution_minutes": total_minutes,
        "display_duration": f"{hours} hours {minutes} minutes",
        "unit": "days",
        "model": config.get("model_name", "LightGBM"),
        "note": "This is an ML estimate, not a guaranteed resolution deadline."
    }

set_predictor(estimate_resolution)


# --------------------------------------------------
# 5. PREDICTION ENDPOINT
# --------------------------------------------------

@app.post("/predict")
def predict(request: PredictionRequest):
    return estimate_resolution(request.complaint)
