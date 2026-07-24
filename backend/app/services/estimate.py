"""Print weight/cost estimate from the real, calibrated mesh volume — not a
bounding-box guess. trimesh computes volume via the divergence theorem over
the mesh's own triangles (signed tetrahedra volume against the origin), so
this reacts to the object's actual shape, not just its W×H×D box."""

from __future__ import annotations

from .exporter import _load_scaled_mesh

# g/cm^3, standard reference densities for common FDM filaments.
MATERIAL_DENSITIES_G_CM3: dict[str, float] = {
    "pla": 1.24,
    "petg": 1.27,
    "abs": 1.04,
}
DEFAULT_MATERIAL = "pla"


def estimate_weight(job_id: str, width_mm: float, height_mm: float, depth_mm: float, material: str) -> dict:
    density = MATERIAL_DENSITIES_G_CM3.get(material.lower(), MATERIAL_DENSITIES_G_CM3[DEFAULT_MATERIAL])
    mesh = _load_scaled_mesh(job_id, width_mm, height_mm, depth_mm)

    # mesh.volume is in mm^3 once the mesh is scaled to real mm dimensions.
    volume_mm3 = abs(float(mesh.volume))
    volume_cm3 = volume_mm3 / 1000.0
    weight_g = volume_cm3 * density

    return {
        "volume_cm3": round(volume_cm3, 2),
        "weight_g": round(weight_g, 1),
        "material": material.lower() if material.lower() in MATERIAL_DENSITIES_G_CM3 else DEFAULT_MATERIAL,
        "density_g_cm3": density,
    }
