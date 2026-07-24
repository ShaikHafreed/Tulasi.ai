"""Real-world-scale mesh export. Meshy's GLB comes out at an arbitrary scale;
Tulasi knows the object's real millimeter dimensions (from calibration or the
user's edits), so on export we scale the mesh so its bounding box matches
those real dimensions and hand back an STL (the 3D-printing standard) or GLB
that drops straight into a slicer at the correct size.

This is the "make it FIT right" promise made concrete: the file you print is
physically the size you measured.
"""

from __future__ import annotations

import numpy as np
import trimesh

from ..errors import AppError
from .meshy import STORAGE_DIR

# fmt -> (trimesh file_type, http content-type)
_FORMATS = {
    "stl": ("stl", "model/stl"),
    "glb": ("glb", "model/gltf-binary"),
}


def _load_scaled_mesh(job_id: str, width_mm: float, height_mm: float, depth_mm: float) -> "trimesh.Trimesh":
    """Shared by export and the print-cost estimator: loads the stored GLB and
    scales it to the requested real millimeter dimensions."""
    source = STORAGE_DIR / f"{job_id}.glb"
    if not source.exists():
        raise AppError(
            status_code=404,
            error_code="model_not_found",
            human_message="We couldn't find that model's file.",
            suggested_action="Regenerate the scan, then export again.",
        )

    try:
        # force="mesh" flattens the GLB scene graph into a single mesh — STL
        # has no scene graph anyway, and it makes bounding-box scaling simple.
        mesh = trimesh.load(source, force="mesh")
    except Exception as exc:  # noqa: BLE001 — turn any loader failure into a product error
        raise AppError(
            status_code=500,
            error_code="export_load_failed",
            human_message="Couldn't read that model for export.",
            suggested_action="Try regenerating the scan.",
        ) from exc

    if getattr(mesh, "is_empty", True) or mesh.extents is None:
        raise AppError(
            status_code=422,
            error_code="empty_model",
            human_message="That model has no printable geometry.",
            suggested_action="Regenerate the scan and try again.",
        )

    if width_mm > 0 and height_mm > 0 and depth_mm > 0:
        mesh = _scale_to_dimensions(mesh, [width_mm, height_mm, depth_mm])

    return mesh


def build_export(
    job_id: str,
    fmt: str,
    width_mm: float | None,
    height_mm: float | None,
    depth_mm: float | None,
) -> tuple[bytes, str, str]:
    """Returns (file_bytes, filename, content_type). Scales the stored GLB so
    its bounding box equals the requested millimeter dimensions, then exports
    to `fmt`."""
    if fmt not in _FORMATS:
        raise AppError(
            status_code=400,
            error_code="unsupported_format",
            human_message=f"Can't export as '{fmt}'.",
            suggested_action="Choose STL or GLB.",
        )

    mesh = _load_scaled_mesh(job_id, width_mm or 0, height_mm or 0, depth_mm or 0)

    if fmt == "stl":
        # STL has no up-axis convention — slicers treat Z as vertical (the
        # build plate is the XY plane). Meshy's GLB is Y-up (glTF convention,
        # matching the web viewer), so without this the model lands on its
        # side in a slicer instead of standing the way it was photographed.
        # GLB export is left in its native orientation — web viewers already
        # expect Y-up.
        mesh = _orient_for_print_bed(mesh)

    file_type, content_type = _FORMATS[fmt]
    data = mesh.export(file_type=file_type)
    if isinstance(data, str):  # some exporters return text
        data = data.encode()

    return bytes(data), f"tulasi-{job_id}.{file_type}", content_type


def _scale_to_dimensions(mesh: "trimesh.Trimesh", targets_mm: list[float]) -> "trimesh.Trimesh":
    """Scales `mesh` per-axis so its bounding box equals `targets_mm`.

    Matches by SORTED extent → SORTED target (largest measured dimension to the
    model's largest axis, and so on). This sidesteps any ambiguity about which
    model axis is "width" vs "depth" — the printed part ends up W×H×D in some
    orientation, which is what matters for fit. When Meshy's proportions are
    already right the per-axis factors come out near-equal (≈ uniform scale);
    when they're slightly off, this corrects them to the measured truth.
    """
    extents = np.asarray(mesh.extents, dtype=float)
    axis_rank_asc = list(np.argsort(extents))  # axis indices, smallest extent first
    targets_asc = sorted(targets_mm)

    scale = np.ones(3, dtype=float)
    for rank, axis in enumerate(axis_rank_asc):
        extent = extents[axis]
        scale[axis] = targets_asc[rank] / extent if extent > 1e-9 else 1.0

    scaled = mesh.copy()
    scaled.apply_scale(scale)
    return scaled


def _orient_for_print_bed(mesh: "trimesh.Trimesh") -> "trimesh.Trimesh":
    """Rotates Y-up (glTF/web) to Z-up (the print-bed convention STL implies)
    and drops the mesh so its lowest point sits at Z=0 — flat base down,
    resting on the plate, matching how the object was actually photographed
    standing rather than lying on its side."""
    oriented = mesh.copy()
    rotation = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
    oriented.apply_transform(rotation)
    oriented.apply_translation([0.0, 0.0, -float(oriented.bounds[0][2])])
    return oriented
