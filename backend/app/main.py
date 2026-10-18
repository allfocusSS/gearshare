"""Minimal API bootstrap; product endpoints are added in later iterations."""

from fastapi import FastAPI

app = FastAPI(title="GearShare")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
