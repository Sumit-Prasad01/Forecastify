import os
from databricks import sql

from src.config.settings import get_settings

s = get_settings()


def get_connection():

    if not s.databricks_host:
        raise ValueError(
            "DATABRICKS_SERVER_HOSTNAME is missing from .env"
        )

    if not s.databricks_http_path:
        raise ValueError(
            "DATABRICKS_HTTP_PATH is missing from .env"
        )

    if not s.databricks_token:
        raise ValueError(
            "DATABRICKS_TOKEN is missing from .env"
        )

    try:
        return sql.connect(
            server_hostname = s.databricks_host,
            http_path = s.databricks_http_path,
            access_token = s.databricks_token,
        )

    except Exception as exc:
        raise RuntimeError(
            "Could not create a Databricks SQL connection. Verify that the values in "
            "DATABRICKS_SERVER_HOSTNAME, DATABRICKS_HTTP_PATH, and DATABRICKS_TOKEN "
            "are valid for the current Databricks workspace, and that the SQL warehouse "
            "or endpoint referenced by DATABRICKS_HTTP_PATH is available."
        ) from exc