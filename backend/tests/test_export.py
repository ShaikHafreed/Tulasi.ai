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


def test_export_stl_rests_flat_on_the_print_bed(client, stored_model):
    # STL has no up-axis convention — slicers treat Z as vertical. Without
    # reorientation, Meshy's Y-up GLB would export lying on its side.
    response = client.post(
        f"/api/scans/{stored_model}/export",
        json={"format": "stl", "width_mm": 54.1, "height_mm": 23.2, "depth_mm": 18.5},
    )
    assert response.status_code == 200
    mesh = trimesh.load(io.BytesIO(response.content), file_type="stl", force="mesh")
    assert abs(mesh.bounds[0][2]) < 0.01, f"expected the base at Z=0, got Z={mesh.bounds[0][2]}"


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


def test_estimate_reacts_to_real_mesh_volume_not_bounding_box(client, stored_model):
    small = client.post(
        f"/api/scans/{stored_model}/estimate",
        json={"width_mm": 20, "height_mm": 20, "depth_mm": 20, "material": "pla"},
    )
    big = client.post(
        f"/api/scans/{stored_model}/estimate",
        json={"width_mm": 60, "height_mm": 60, "depth_mm": 60, "material": "pla"},
    )
    assert small.status_code == 200 and big.status_code == 200
    small_body, big_body = small.json(), big.json()

    # 3x linear scale -> ~27x volume for the same shape. Assert it's bigger
    # and in the right ballpark, not exact (mesh isn't a perfect cube).
    assert big_body["volume_cm3"] > small_body["volume_cm3"] * 10
    assert big_body["weight_g"] > small_body["weight_g"] * 10
    assert big_body["density_g_cm3"] == 1.24
    assert big_body["material"] == "pla"


def test_estimate_material_changes_density(client, stored_model):
    response = client.post(
        f"/api/scans/{stored_model}/estimate",
        json={"width_mm": 40, "height_mm": 40, "depth_mm": 40, "material": "petg"},
    )
    assert response.status_code == 200
    assert response.json()["density_g_cm3"] == 1.27


def test_export_missing_model_is_product_error(client):
    response = client.post(
        "/api/scans/does-not-exist/export",
        json={"format": "stl", "width_mm": 10, "height_mm": 10, "depth_mm": 10},
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error_code"] == "model_not_found"
    assert "human_message" in body and "suggested_action" in body
