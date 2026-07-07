"""Print-ready validation heuristics: wall thickness, overhangs, stability.

Ray-cast thickness sampling and face-normal overhang checks against a loaded
trimesh. Real-world units need a mm-per-unit scale factor — without one,
thickness is reported in model units and flagged as such so callers don't
mistake it for millimeters.
"""

import numpy as np
import trimesh

from . import meshy
from .. import object_state

MIN_WALL_THICKNESS_MM = 1.2
MAX_OVERHANG_DEGREES = 45.0
OVERHANG_RATIO_THRESHOLD = 0.05
THICKNESS_SAMPLE_COUNT = 200


def _sample_wall_thickness(mesh: trimesh.Trimesh) -> list[float]:
    if not mesh.is_watertight:
        return []

    sample_points, face_indices = trimesh.sample.sample_surface(mesh, THICKNESS_SAMPLE_COUNT)
    normals = mesh.face_normals[face_indices]

    origins = sample_points - normals * 1e-4
    directions = -normals

    locations, index_ray, _ = mesh.ray.intersects_location(origins, directions)

    thicknesses = []
    for ray_idx in range(len(origins)):
        hits = locations[index_ray == ray_idx]
        if len(hits) == 0:
            continue
        distances = np.linalg.norm(hits - origins[ray_idx], axis=1)
        thicknesses.append(float(distances.min()))
    return thicknesses


def _overhang_face_count(mesh: trimesh.Trimesh) -> int:
    # Overhang angle is measured from vertical: a wall (0°) is fine, a
    # horizontal downward-facing ceiling (90°) is the worst case. Faces
    # resting on the build plate are excluded — the plate supports them,
    # so they aren't an overhang even though they face straight down.
    up = np.array([0.0, 1.0, 0.0])
    angle_from_up = np.degrees(np.arccos(np.clip(mesh.face_normals @ up, -1.0, 1.0)))
    downward_tilt = angle_from_up - 90.0

    min_y = mesh.bounds[0][1]
    face_min_y = mesh.vertices[mesh.faces][:, :, 1].min(axis=1)
    tolerance = 1e-4 * max(float(mesh.extents.max()), 1.0)
    resting_on_bed = np.isclose(face_min_y, min_y, atol=tolerance)

    is_overhang = (downward_tilt > MAX_OVERHANG_DEGREES) & ~resting_on_bed
    return int(np.sum(is_overhang))


def _has_stable_base(mesh: trimesh.Trimesh) -> bool:
    bounds = mesh.bounds
    base_width = bounds[1][0] - bounds[0][0]
    base_depth = bounds[1][2] - bounds[0][2]
    height = bounds[1][1] - bounds[0][1]
    base_footprint = max((base_width * base_depth) ** 0.5, 1e-6)
    return bool(height / base_footprint < 5.0)


def estimate_mm_per_unit(mesh: trimesh.Trimesh, job_id: str) -> float | None:
    """Best-effort mm-per-model-unit scale, reusing whatever calibration
    data exists for this job — the assistant's object_state if the user has
    already set dimensions, else a fresh calibration pass on the original
    photo. Returns None if neither is available."""
    width_mm = object_state.get(job_id).get("width_mm")

    if width_mm is None:
        from . import calibrate  # local import: avoids a service->service cycle at module load

        photo_matches = list(meshy.STORAGE_DIR.glob(f"{job_id}_photo.*"))
        if photo_matches:
            result = calibrate.calibrate(photo_matches[0].read_bytes())
            width_mm = result.get("width_mm")

    if width_mm is None:
        return None

    max_dim = float(mesh.bounding_box.extents.max())
    if max_dim <= 0:
        return None
    return width_mm / max_dim


def validate_mesh(mesh: trimesh.Trimesh, mm_per_unit: float | None = None) -> dict:
    watertight = bool(mesh.is_watertight)
    thicknesses = _sample_wall_thickness(mesh)

    scale = mm_per_unit or 1.0
    min_thickness_mm = None
    thin_wall_count = 0
    if thicknesses:
        thicknesses_mm = [t * scale for t in thicknesses]
        min_thickness_mm = min(thicknesses_mm)
        thin_wall_count = sum(1 for t in thicknesses_mm if t < MIN_WALL_THICKNESS_MM)

    overhang_face_count = _overhang_face_count(mesh)
    total_faces = max(len(mesh.faces), 1)
    overhang_ratio = overhang_face_count / total_faces
    stable = _has_stable_base(mesh)

    issues = []
    if not watertight:
        issues.append("Mesh isn't watertight, so wall thickness can't be measured reliably.")
    if thin_wall_count:
        issues.append(f"{thin_wall_count} sampled points are thinner than {MIN_WALL_THICKNESS_MM}mm.")
    if overhang_ratio > OVERHANG_RATIO_THRESHOLD:
        issues.append(f"{overhang_face_count} faces overhang more than {MAX_OVERHANG_DEGREES}° without support.")
    if not stable:
        issues.append("Model is tall and narrow relative to its base — it may tip over when printing.")

    return {
        "watertight": watertight,
        "min_wall_thickness_mm": min_thickness_mm,
        "thickness_in_real_units": mm_per_unit is not None,
        "overhang_face_count": overhang_face_count,
        "overhang_face_ratio": overhang_ratio,
        "stable_base": stable,
        "printable": watertight and thin_wall_count == 0 and overhang_ratio <= OVERHANG_RATIO_THRESHOLD and stable,
        "issues": issues,
    }
