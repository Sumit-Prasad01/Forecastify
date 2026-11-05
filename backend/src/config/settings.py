from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent[2]


class Settings(BaseSettings):

    # Databricks SQL Warehouse
    databricks_server_hostname: str = ""
    databricks_http_path: str = ""
    databricks_token: str = ""

    # Databricks Jobs & Volumes
    databricks_host: str = ""
    databricks_job_id: str = ""
    databricks_volume_incoming_path: str = ""

    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment_name: str = ""
    azure_openai_api_version: str = "2024-06-01"

    # CORS
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()