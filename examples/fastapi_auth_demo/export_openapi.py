from __future__ import annotations

import argparse
import json
from pathlib import Path

from app import app


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export the FastAPI OpenAPI schema to a JSON file.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="openapi.generated.json",
        help="Output path for the generated OpenAPI JSON.",
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf8")

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
