"""Pytest bootstrap for the KPChat backend test-suite.

The integration tests in ``backend/tests/`` talk to the *running* service over
HTTP, so they need two things present in ``os.environ`` before collection:

* the backend secrets from ``backend/.env`` (``JWT_SECRET``, ``MONGO_URL``, ...)
* ``EXPO_PUBLIC_BACKEND_URL`` from ``frontend/.env`` -- the public base URL the
  tests point their ``requests``/``websockets`` clients at.

Both files are gitignored, which means a fresh clone has no way of knowing
those values. Loading them here keeps ``pytest`` runnable straight after
``cp .env.example .env`` without every test module repeating the same dotenv
boilerplate.

Values already exported in the real environment always win, so CI can override
anything by simply exporting it.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"

# override=False -> never clobber variables the caller already exported.
load_dotenv(BACKEND_DIR / ".env", override=False)
load_dotenv(FRONTEND_DIR / ".env", override=False)

# Fall back to the local service when no public preview URL is configured.
os.environ.setdefault("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001")
