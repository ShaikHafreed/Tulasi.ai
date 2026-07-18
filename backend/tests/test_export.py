import io
import shutil
from pathlib import Path

import pytest
import trimesh

from app.services.meshy import STORAGE_DIR

FIXTURE_GLB = Path(__file__).resolve().parent.parent.parent / "experiments" / "fixtures" / "sample.glb"


@pytest.fixture
def stored_model():
    # Drop the fixture GLB into storage under a known job id, clean up after.
    job_id = "export-test-job"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STORAGE_DIR / f"{job_id}.glb"
    shutil.copyfile(FIXTURE_GLB, dest)
    yield job_id
    if dest.exists():
        dest.unlink()


def test_export_stl_scales_to_real_dimensions(client, stored_model):
    response = client.post(
        f"/api/scans/{stored_model}/export",
        json={"format": "stl", "width_mm": 54.1, "height_mm": 23.2, "depth_mm": 18.5},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("model/stl")
    assert "attachment" in response.headers["content-disposition"]

    # The exported STL's bounding box must equal the requested dimensions
    # (sorted, since axis labelling is matched by size) — this is the whole
    # "FIT right" promise, so assert it on the real bytes.
    mesh = trimesh.load(io.BytesIO(response.content), file_type="stl", force="mesh")
    got = sorted(mesh.extents)
    want = sorted([54.1, 23.2, 18.5])
    for g, w in zip(got, want):
        assert abs(g - w) < 0.05, f"expected {want}, got {got}"


def test_export_glb_format(client, stored_model):
    response = client.post(
        f"/api/scans/{stored_model}/export",
        json={"format": "glb", "width_mm": 30, "height_mm": 30, "depth_mm": 30},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("model/gltf-binary")
    assert response.content[:4] == b"glTF"  # GLB magic number


def test_export_rejects_unknown_format(client, stored_model):
    response = client.post(
        f"/api/scans/{stored_model}/export",
        json={"format": "obj"},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_format"


def test_export_missing_model_is_product_error(client):
    response = client.post(
        "/api/scans/does-not-exist/export",
        json={"format": "stl", "width_mm": 10, "height_mm": 10, "depth_mm": 10},
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error_code"] == "model_not_found"
    assert "human_message" in body and "suggested_action" in body
