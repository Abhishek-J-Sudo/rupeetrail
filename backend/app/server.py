"""
RupeeTrail as users run it: one program on one address

The built screens (frontend/dist, made by `npm run build`) are served from /, and the API from
/api. Paths like /recurring are both a screen and an API route, hence the prefix. While
developing, `python start.py --dev` runs the API (app.main) and Vite's live-reloading screens
separately instead.
"""

from fastapi import FastAPI
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .main import app as api, startup_event
from .storage import APP_DIR

DIST_DIR = (APP_DIR / "frontend" / "dist").resolve()

app = FastAPI(title="RupeeTrail", version=__version__, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", api)


@app.on_event("startup")
async def startup():
    # A mounted app's own startup hooks don't run
    await startup_event()


if (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def screens(path: str):
        # Files at the top of dist (logo, favicon); any other path is a screen of the app
        file = (DIST_DIR / path).resolve()
        if path and file.is_file() and file.is_relative_to(DIST_DIR):
            return FileResponse(file)
        return FileResponse(DIST_DIR / "index.html")

else:

    @app.get("/", include_in_schema=False)
    async def not_built():
        return PlainTextResponse(
            "The screens haven't been built yet. Run `python start.py`, which builds them, "
            "or download a release, which includes them.",
            status_code=503,
        )
