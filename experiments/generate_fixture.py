"""Regenerates experiments/fixtures/sample.glb, the mock-mode viewer fixture."""

from pathlib import Path

import trimesh

OUTPUT = Path(__file__).parent / "fixtures" / "sample.glb"


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    mesh.export(OUTPUT, file_type="glb")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
