import trimesh

from app.services import validate


def test_validate_mesh_reports_watertight_box_as_printable():
    mesh = trimesh.creation.box(extents=(20.0, 20.0, 20.0))

    report = validate.validate_mesh(mesh, mm_per_unit=1.0)

    assert report["watertight"] is True
    assert report["min_wall_thickness_mm"] is not None
    assert report["thickness_in_real_units"] is True
    assert report["stable_base"] is True
    assert report["printable"] is True
    assert report["issues"] == []


def test_validate_mesh_flags_thin_walls_when_scaled_down():
    # A 1x1x1 box scaled to mm_per_unit=0.5 implies walls far under 1.2mm.
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))

    report = validate.validate_mesh(mesh, mm_per_unit=0.5)

    assert report["min_wall_thickness_mm"] < validate.MIN_WALL_THICKNESS_MM
    assert report["printable"] is False
    assert any("thinner than" in issue for issue in report["issues"])


def test_validate_mesh_flags_tall_narrow_base_as_unstable():
    mesh = trimesh.creation.box(extents=(1.0, 20.0, 1.0))

    report = validate.validate_mesh(mesh, mm_per_unit=1.0)

    assert report["stable_base"] is False
    assert report["printable"] is False


def test_validate_mesh_without_scale_reports_model_units():
    mesh = trimesh.creation.box(extents=(20.0, 20.0, 20.0))

    report = validate.validate_mesh(mesh, mm_per_unit=None)

    assert report["thickness_in_real_units"] is False
    assert report["min_wall_thickness_mm"] is not None


def test_estimate_mm_per_unit_uses_object_state(monkeypatch):
    from app import object_state

    mesh = trimesh.creation.box(extents=(2.0, 2.0, 2.0))
    object_state.update("job-scale", width_mm=40.0)

    mm_per_unit = validate.estimate_mm_per_unit(mesh, "job-scale")

    assert mm_per_unit == 40.0 / 2.0


def test_estimate_mm_per_unit_returns_none_without_any_calibration(monkeypatch, tmp_path):
    mesh = trimesh.creation.box(extents=(2.0, 2.0, 2.0))
    monkeypatch.setattr(validate.meshy, "STORAGE_DIR", tmp_path)

    mm_per_unit = validate.estimate_mm_per_unit(mesh, "job-no-calibration")

    assert mm_per_unit is None
