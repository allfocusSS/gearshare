"""Trusted test setup, never an application feature: insert one coordinator into a migrated database.

No HTTP route grants the coordinator role (registration always creates a student), so the real-stack browser tests
create the coordinator the way the #11 smoke script does: directly through the repository with a real Argon2id hash.
Run from backend/ with PYTHONPATH=. so that `app` imports. Credentials come from the environment, never from Git.
"""

import os
from uuid import uuid4

from app.auth import Argon2Passwords
from app.database import DatabaseSettings
from app.domain import User
from app.sqlalchemy_store import SQLAlchemyRepository

store = SQLAlchemyRepository(DatabaseSettings(os.environ["GEARSHARE_DATABASE_URL"]))
try:
    with store.transaction() as transaction:
        transaction.add_user(User(str(uuid4()), os.environ["E2E_COORDINATOR_USERNAME"], "coordinator", Argon2Passwords().hash(os.environ["E2E_COORDINATOR_PASSWORD"])))
finally:
    store.close()
