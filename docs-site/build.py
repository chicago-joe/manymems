"""Static site generator for manymems docs.

Uses httpx ASGITransport (async) to crawl the FastAPI app without starting a real
server, then writes every route to docs-site/dist/ as plain HTML files.

Usage:
    uv run --directory docs-site python build.py
"""
from __future__ import annotations

import asyncio
import shutil
from pathlib import Path

from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Bootstrap: chdir so relative paths inside main.py resolve correctly.
# ---------------------------------------------------------------------------
import os

HERE = Path(__file__).parent
os.chdir(HERE)

from main import _build_catalogue, app  # noqa: E402

DIST = HERE / "dist"
STATIC_SRC = HERE / "static"


def write_page(dist_path: Path, html: str) -> None:
    dist_path.parent.mkdir(parents=True, exist_ok=True)
    dist_path.write_text(html, encoding="utf-8")


def collect_slugs() -> list[str]:
    catalogue = _build_catalogue()
    return sorted(catalogue.keys())


async def build_async() -> None:
    print("Building manymems docs static site...")

    # Clean output directory
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    # Copy static assets
    if STATIC_SRC.exists():
        shutil.copytree(STATIC_SRC, DIST / "static")
        print("  Copied static/ → dist/static/")

    # Write .nojekyll so GitHub Pages serves files starting with _
    (DIST / ".nojekyll").write_text("")

    slugs = collect_slugs()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Landing page
        resp = await client.get("/")
        if resp.status_code == 200:
            write_page(DIST / "index.html", resp.text)
            print("  / → dist/index.html")
        else:
            print(f"  WARNING: GET / returned {resp.status_code}")

        # Doc pages
        for slug in slugs:
            resp = await client.get(f"/{slug}")
            if resp.status_code == 200:
                out = DIST / slug / "index.html"
                write_page(out, resp.text)
                print(f"  /{slug} → dist/{slug}/index.html")
            else:
                print(f"  WARNING: GET /{slug} returned {resp.status_code}")

    total = len(list(DIST.rglob("*.html")))
    print(f"\nDone. {total} HTML files in {DIST}")


def main() -> None:
    asyncio.run(build_async())


if __name__ == "__main__":
    main()
