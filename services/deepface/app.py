import base64
import binascii
import os
import tempfile
from pathlib import Path
from typing import Any

from deepface import DeepFace
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

os.environ.setdefault("DEEPFACE_HOME", "/models")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

app = FastAPI(title="ArtSaurus DeepFace Identity Gate")


class VerifyRequest(BaseModel):
    img1: str
    img2: str
    model_name: str = "ArcFace"
    detector_backend: str = "retinaface"
    distance_metric: str = "cosine"
    enforce_detection: bool = False
    align: bool = True


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/verify")
def verify(request: VerifyRequest) -> dict[str, Any]:
    try:
        with tempfile.TemporaryDirectory() as directory:
            left_path = _write_data_url(request.img1, Path(directory) / "reference.jpg")
            right_path = _write_data_url(request.img2, Path(directory) / "candidate.jpg")
            result = DeepFace.verify(
                img1_path=str(left_path),
                img2_path=str(right_path),
                model_name=request.model_name,
                detector_backend=request.detector_backend,
                distance_metric=request.distance_metric,
                enforce_detection=request.enforce_detection,
                align=request.align,
            )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "verified": bool(result.get("verified")),
        "distance": _read_float(result.get("distance")),
        "threshold": _read_float(result.get("threshold")),
        "model": result.get("model") or request.model_name,
        "detectorBackend": request.detector_backend,
        "distanceMetric": request.distance_metric,
        "facialAreas": result.get("facial_areas"),
        "time": _read_float(result.get("time")),
    }


def _write_data_url(value: str, path: Path) -> Path:
    _, _, payload = value.partition(",")
    raw = payload or value
    try:
        path.write_bytes(base64.b64decode(raw, validate=True))
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 image payload.") from exc
    return path


def _read_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None
