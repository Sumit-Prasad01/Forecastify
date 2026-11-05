"""Databricks Jobs + Unity Catalog Volumes integration for the data-ingestion
pipeline (upload a raw file, trigger the Bronze/Silver/Gold job, poll its run).

Reuses the same PAT token as src.data.databricks_client (the SQL warehouse
client) and llm_client.py (Azure OpenAI's env-loading pattern), but talks to
a different Databricks API surface -- Jobs + Volumes over REST via the
Databricks SDK's WorkspaceClient -- rather than SQL, so it's kept in its own
module.

DATABRICKS_HOST is read directly if set; otherwise it's derived from
DATABRICKS_SERVER_HOSTNAME (the same var the SQL client already uses), so
this works without adding a second hostname to .env.
"""


import io
import os
from pathlib import Path
from typing import Any, Optional

from databricks.sdk import WorkspaceClient

from backend.src.config.settings import get_settings

s = get_settings()

_client: Optional[WorkspaceClient] = None



class DatabricksJobsConfigError(RuntimeError):
    """Raised when a required Databricks Jobs/Volumes environment variable is missing."""


def get_client() -> WorkspaceClient:
    """Return a cached WorkspaceClient, or raise DatabricksJobsConfigError if unconfigured."""

    global _client

    if _client is None:
        missing = [
            name
            for name, value in {
                "DATABRICKS_HOST (or DATABRICKS_SERVER_HOSTNAME)": s.databricks_host,
                "DATABRICKS_TOKEN": s.databricks_token,
            }.items()
            if not value
        ]
        if missing:
            raise DatabricksJobsConfigError(f"Missing Databricks environment variable(s): {', '.join(missing)}")

        _client = WorkspaceClient(
            host = s.databricks_host,
            token = s.databricks_token
        )

    return _client