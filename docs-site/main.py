"""manymems docs site — FastAPI app that renders docs/public/ MDX as HTML."""
from __future__ import annotations

import json
import re
from pathlib import Path

import frontmatter
import mistune
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# ---------------------------------------------------------------------------
# Paths (docs-site/ lives one level below project root)
# ---------------------------------------------------------------------------
HERE = Path(__file__).parent
DOCS_ROOT = HERE / ".." / "docs" / "public"
TEMPLATES_DIR = HERE / "templates"
STATIC_DIR = HERE / "static"

# ---------------------------------------------------------------------------
# MDX JSX stripping
# ---------------------------------------------------------------------------
_JSX_BLOCK = re.compile(
    r"<(Card|CardGroup|Note|Warning|Info|Tip|Tabs|Tab|Accordion|Steps|Step|Expandable|Frame|Icon|Tooltip|ResponseField|ParamField|CodeGroup)(\s[^>]*)?>.*?</\1>",
    re.DOTALL,
)
_JSX_SELF_CLOSE = re.compile(r"<[A-Z][a-zA-Z]*[^>]*/?>")
_MDX_IMPORT = re.compile(r"^import\s+.*$", re.MULTILINE)
_MDX_EXPORT = re.compile(r"^export\s+.*$", re.MULTILINE)
_FRONTMATTER_FENCE = re.compile(r"^---\s*\n.*?^---\s*\n", re.DOTALL | re.MULTILINE)


def strip_mdx(text: str) -> str:
    """Remove MDX-specific JSX so plain mistune can render the prose."""
    text = _JSX_BLOCK.sub("", text)
    text = _JSX_SELF_CLOSE.sub("", text)
    text = _MDX_IMPORT.sub("", text)
    text = _MDX_EXPORT.sub("", text)
    return text


# ---------------------------------------------------------------------------
# Markdown renderer
# ---------------------------------------------------------------------------
_md = mistune.create_markdown(
    plugins=["table", "strikethrough", "footnotes", "task_lists"],
    escape=False,
)


def render_md(text: str) -> str:
    return _md(strip_mdx(text))  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Nav tree from docs.json
# ---------------------------------------------------------------------------

def _load_nav() -> list[dict]:
    docs_json = DOCS_ROOT / "docs.json"
    if not docs_json.exists():
        return []
    with docs_json.open() as fh:
        data = json.load(fh)
    return data.get("navigation", {}).get("groups", [])


def _slug_to_path(slug: str) -> Path | None:
    """Resolve a slug like 'architecture/overview' to the actual .mdx or .md file."""
    for ext in (".mdx", ".md"):
        candidate = DOCS_ROOT / (slug + ext)
        if candidate.exists():
            return candidate
        # slug might be a directory — check for index
        index = DOCS_ROOT / slug / ("index" + ext)
        if index.exists():
            return index
    return None


# ---------------------------------------------------------------------------
# Page catalogue (slug → metadata)
# ---------------------------------------------------------------------------

def _build_catalogue() -> dict[str, dict]:
    catalogue: dict[str, dict] = {}
    for mdx_file in DOCS_ROOT.rglob("*.mdx"):
        rel = mdx_file.relative_to(DOCS_ROOT)
        slug = str(rel.with_suffix("")).replace("\\", "/")
        if slug.endswith("/index"):
            slug = slug[: -len("/index")]
        try:
            post = frontmatter.load(str(mdx_file))
            title = post.metadata.get("title", slug.split("/")[-1].replace("-", " ").title())
            description = post.metadata.get("description", "")
        except Exception:
            title = slug.split("/")[-1].replace("-", " ").title()
            description = ""
        catalogue[slug] = {"title": title, "description": description, "path": mdx_file}
    for md_file in DOCS_ROOT.rglob("*.md"):
        rel = md_file.relative_to(DOCS_ROOT)
        slug = str(rel.with_suffix("")).replace("\\", "/")
        if slug in catalogue:
            continue
        if slug.endswith("/index"):
            slug = slug[: -len("/index")]
        try:
            post = frontmatter.load(str(md_file))
            title = post.metadata.get("title", slug.split("/")[-1].replace("-", " ").title())
            description = post.metadata.get("description", "")
        except Exception:
            title = slug.split("/")[-1].replace("-", " ").title()
            description = ""
        catalogue[slug] = {"title": title, "description": description, "path": md_file}
    return catalogue


_CATALOGUE: dict[str, dict] = {}
_NAV: list[dict] = []


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="manymems docs", docs_url=None, redoc_url=None)
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.on_event("startup")
async def _startup() -> None:
    global _CATALOGUE, _NAV
    _CATALOGUE = _build_catalogue()
    _NAV = _load_nav()


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "nav": _NAV,
            "catalogue": _CATALOGUE,
            "active_slug": "",
        },
    )


@app.get("/{slug:path}", response_class=HTMLResponse)
async def doc_page(request: Request, slug: str) -> HTMLResponse:
    # Normalise trailing slash
    slug = slug.rstrip("/")
    info = _CATALOGUE.get(slug)
    if info is None:
        # Try resolving via file path
        file_path = _slug_to_path(slug)
        if file_path is None:
            from fastapi.responses import Response
            return Response(content="Page not found", status_code=404)
        try:
            post = frontmatter.load(str(file_path))
            title = post.metadata.get("title", slug.split("/")[-1].replace("-", " ").title())
            description = post.metadata.get("description", "")
            body = post.content
        except Exception:
            title = slug.split("/")[-1].replace("-", " ").title()
            description = ""
            body = file_path.read_text()
        content_html = render_md(body)
    else:
        file_path = info["path"]
        try:
            post = frontmatter.load(str(file_path))
            title = post.metadata.get("title", info["title"])
            description = post.metadata.get("description", info["description"])
            body = post.content
        except Exception:
            title = info["title"]
            description = info["description"]
            body = file_path.read_text()
        content_html = render_md(body)

    return templates.TemplateResponse(
        request,
        "page.html",
        {
            "nav": _NAV,
            "catalogue": _CATALOGUE,
            "active_slug": slug,
            "title": title,
            "description": description,
            "content": content_html,
        },
    )
