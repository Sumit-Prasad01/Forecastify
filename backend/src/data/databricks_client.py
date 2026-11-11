from databricks import sql
from src.config.settings import get_settings


def get_connection():
    s = get_settings()

    raw_hostname = s.databricks_server_hostname or s.databricks_host
    if not raw_hostname or "your-workspace" in raw_hostname:
        raise ValueError(
            "DATABRICKS_SERVER_HOSTNAME is missing or unconfigured in .env"
        )

    if not s.databricks_http_path or "your-warehouse-id" in s.databricks_http_path:
        raise ValueError(
            "DATABRICKS_HTTP_PATH is missing or unconfigured in .env"
        )

    if not s.databricks_token or "dapiXXXX" in s.databricks_token:
        raise ValueError(
            "DATABRICKS_TOKEN is missing or unconfigured in .env"
        )

    # Clean hostname (remove https://, http://, and trailing slashes)
    server_hostname = (
        raw_hostname.replace("https://", "")
        .replace("http://", "")
        .strip("/")
    )

    try:
        return sql.connect(
            server_hostname=server_hostname,
            http_path=s.databricks_http_path,
            access_token=s.databricks_token,
        )

    except Exception as exc:
        raise RuntimeError(
            "Could not create a Databricks SQL connection. Verify that the values in "
            "DATABRICKS_SERVER_HOSTNAME, DATABRICKS_HTTP_PATH, and DATABRICKS_TOKEN "
            "are valid for the current Databricks workspace, and that the SQL warehouse "
            "referenced by DATABRICKS_HTTP_PATH is running."
        ) from exc
