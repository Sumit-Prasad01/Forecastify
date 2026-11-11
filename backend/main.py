"""FastAPI microservice serving retail sales forecasts from Databricks."""

import logging
from datetime import date, datetime
from typing import List, Optional, Union

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from src.data import analytics, databricks_jobs
from src.data.databricks_jobs import DatabricksJobsConfigError
from src.data.db import (
    check_connection,
    fetch_distinct_products,
    fetch_forecast_predictions,
    fetch_forecasts,
    fetch_history_actuals,
    fetch_product_static,
    fetch_products,
    fetch_recent_sales_features,
    fetch_stores,
)

from src.genai.chatbot import QUICK_ACTIONS, run_chat, run_quick_action
from src.genai.explain_context import build_forecast_context
from src.genai.forecast_explainer import generate_explanation
from src.genai.llm_client import LLMConfigError
from src.models.schema import (
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    ExplainResponse,
    ForecastListResponse,
    ForecastPoint,
    ForecastRecord,
    ForecastSummary,
    ForecastTrendResponse,
    HealthResponse,
    KPISummary,
    PipelineStatusResponse,
    PipelineTriggerResponse,
    PipelineUploadAndTriggerResponse,
    PipelineUploadResponse,
    PredictedRevenueStat,
    Product,
    ProductForecastGroup,
    QuickActionRequest,
    Store,
    TopCategoryStat,
    TopProductStat,
    UploadedFileInfo,
)
from src.config.settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("forecastify_api")

s = get_settings()

app = FastAPI(
    title="Forecastify",
    description="Serves retail sales forecast data from the Databricks gold layer (forecastify.gold.forecast_results).",
    version="0.1.0",
)

# Parse allowed origins with fallback
raw_origins = [origin.strip() for origin in s.allowed_origins.split(",") if origin.strip()]
allowed_origins = raw_origins or ["http://localhost:5173", "http://localhost:3000", "http://localhost:4173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check",
    description="Confirms the API is running and can reach the Databricks SQL warehouse.",
)
def health() -> HealthResponse:
    try:
        check_connection()
    except Exception as exc:
        logger.warning("Databricks health check failed or unconfigured: %s", exc)
        return HealthResponse(
            status=f"API is running. Databricks connection is not established: {exc}",
            databricks_connected=False,
        )

    return HealthResponse(status="ready", databricks_connected=True)


def _to_date(value) -> date:
    """Normalize a date/datetime/string value from the connector to a plain date."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.strptime(value.split("T")[0], "%Y-%m-%d").date()
        except ValueError:
            pass
    return date.today()


def _merge_points(history_rows: list[dict], forecast_rows: list[dict]) -> List[ForecastPoint]:
    """Merge sales_features actuals and forecast_results predictions into one
    chronological timeline, keyed by date."""
    points: dict[date, ForecastPoint] = {}

    for row in history_rows:
        row_date = _to_date(row["date"])
        points[row_date] = ForecastPoint(
            date=row_date,
            actual_units=float(row["units_sold"]) if row.get("units_sold") is not None else None,
            predicted_units=None,
        )

    for row in forecast_rows:
        forecast_date = _to_date(row["forecast_date"])
        pred = float(row["predicted_units"]) if row.get("predicted_units") is not None else None
        existing = points.get(forecast_date)
        if existing is not None:
            existing.predicted_units = pred
        else:
            points[forecast_date] = ForecastPoint(
                date=forecast_date,
                actual_units=None,
                predicted_units=pred,
            )

    return [points[key] for key in sorted(points)]


@app.get(
    "/forecast",
    response_model=Union[ForecastListResponse, ForecastTrendResponse],
    summary="Get sales forecast (flat list, or merged actual+forecast trend)",
    description=(
        "Two modes, selected by `include_history`:\n\n"
        "- **include_history=false (default)** — returns forecast rows as-is from "
        "forecastify.gold.forecast_results, filtered by product_id/store_id/category.\n\n"
        "- **include_history=true** — merges real history with the model's forecast into "
        "one chronological timeline for a single series. Requires both product_id and store_id."
    ),
)
def get_forecast(
    product_id: Optional[str] = Query(None, description="Filter by product ID"),
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    category: Optional[str] = Query(None, description="Filter by product category (ignored when include_history=true)"),
    include_history: bool = Query(False, description="Merge in historical actuals alongside the forecast"),
    history_days: int = Query(90, ge=1, description="Days of history to include; only used when include_history=true"),
) -> Union[ForecastListResponse, ForecastTrendResponse]:
    if include_history:
        if not product_id or not store_id:
            raise HTTPException(
                status_code=400,
                detail="include_history=true requires both product_id and store_id.",
            )

        try:
            history_rows = fetch_history_actuals(product_id, store_id, history_days)
            forecast_rows = fetch_forecast_predictions(product_id, store_id)
        except Exception as exc:
            logger.exception("Failed to build forecast trend: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch trend data from Databricks: {exc}",
            )

        return ForecastTrendResponse(
            product_id=product_id,
            store_id=store_id,
            history_days=history_days,
            points=_merge_points(history_rows, forecast_rows),
        )

    try:
        rows = fetch_forecasts(product_id=product_id, store_id=store_id, category=category)
    except Exception as exc:
        logger.exception("Failed to query forecast_results: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch forecast data from Databricks: {exc}",
        )

    records = [ForecastRecord(**row) for row in rows]
    return ForecastListResponse(count=len(records), results=records)


@app.get(
    "/forecast/trend/all",
    summary="Get every predicted record, grouped by product",
    description="Returns every row from forecastify.gold.forecast_results, grouped by product_id.",
)
def get_forecast_trend_all() -> List[ProductForecastGroup]:
    try:
        products = fetch_distinct_products()
        groups = [
            ProductForecastGroup(
                product_id=product["product_id"],
                category=product["category"],
                records=[ForecastRecord(**row) for row in fetch_forecasts(product_id=product["product_id"])],
            )
            for product in products
        ]
    except Exception as exc:
        logger.exception("Failed to fetch all forecast records: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch forecast data from Databricks: {exc}",
        )

    return groups


@app.post(
    "/forecast/explain",
    response_model=ExplainResponse,
    summary="Explain an existing forecast in plain language",
    description="Explains an already-computed forecast using contextual metrics and LLM narrative.",
)
def explain_forecast(request: ExplainRequest) -> ExplainResponse:
    try:
        forecast_rows = fetch_forecasts(product_id=request.product_id, store_id=request.store_id)
    except Exception as exc:
        logger.exception("Failed to fetch forecast_results for explanation: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch forecast data from Databricks: {exc}",
        )

    if not forecast_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No forecast found for product_id={request.product_id!r}, store_id={request.store_id!r}.",
        )

    try:
        recent_rows = fetch_recent_sales_features(request.product_id, request.store_id, days=90)
    except Exception as exc:
        logger.exception("Failed to fetch sales_features history for explanation: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch historical data from Databricks: {exc}",
        )

    if not recent_rows:
        raise HTTPException(
            status_code=404,
            detail=f"No historical data found for product_id={request.product_id!r}, store_id={request.store_id!r}.",
        )

    try:
        product_static = fetch_product_static(request.product_id)
    except Exception as exc:
        logger.exception("Failed to fetch product attributes for explanation: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch product attributes from Databricks: {exc}",
        )

    context = build_forecast_context(
        product_id=request.product_id,
        store_id=request.store_id,
        forecast_rows=forecast_rows,
        recent_features_rows=recent_rows,
        product_static=product_static,
    )

    try:
        narrative = generate_explanation(context, request.user_question)
    except LLMConfigError as exc:
        logger.error("Azure OpenAI is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=f"GenAI explanation service is not configured: {exc}")
    except Exception as exc:
        logger.exception("Azure OpenAI call failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="GenAI explanation service is currently unreachable. Please try again shortly.",
        )

    return ExplainResponse(
        product_id=request.product_id,
        store_id=request.store_id,
        forecast_summary=ForecastSummary(
            avg_predicted_units=context["avg_predicted_units"],
            total_predicted_units=context["total_predicted_units"],
            vs_recent_history_pct_change=context["vs_recent_history_pct_change"],
        ),
        explanation=narrative["explanation"],
        key_drivers=narrative["key_drivers"],
        risks_or_opportunities=narrative["risks_or_opportunities"],
        recommendation=narrative["recommendation"],
        model_version=str(context.get("model_version", "1.0")),
    )


@app.get(
    "/products",
    response_model=List[Product],
    summary="List all products",
    description="Returns every product from forecastify.silver.products, for populating a product selector.",
)
def get_products() -> List[Product]:
    try:
        rows = fetch_products()
    except Exception as exc:
        logger.exception("Failed to fetch products: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch products from Databricks: {exc}",
        )

    return [Product(**row) for row in rows]


@app.get(
    "/stores",
    response_model=List[Store],
    summary="List all stores",
    description="Returns every store from forecastify.silver.stores, for populating a store selector.",
)
def get_stores() -> List[Store]:
    try:
        rows = fetch_stores()
    except Exception as exc:
        logger.exception("Failed to fetch stores: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch stores from Databricks: {exc}",
        )

    return [Store(**row) for row in rows]


@app.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask a free-text business question (GenAI, tool-calling)",
    description="General-purpose analytics chatbot backed by real SQL queries via tool-calling.",
)
def chat(request: ChatRequest) -> ChatResponse:
    history = [{"role": turn.role, "content": turn.content} for turn in request.history]

    try:
        result = run_chat(
            request.message,
            history=history,
            store_id=request.store_id,
            store_name=request.store_name,
        )
    except LLMConfigError as exc:
        logger.error("Azure OpenAI is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=f"Chat service is not configured: {exc}")
    except Exception as exc:
        logger.exception("Chat request failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Chat service is currently unreachable. Please try again shortly.",
        )

    return ChatResponse(**result)


@app.post(
    "/chat/quick",
    response_model=ChatResponse,
    summary="Run a predefined quick-question button (deterministic, no LLM)",
    description="Answers one of a fixed set of business questions directly from analytics.py.",
)
def chat_quick(request: QuickActionRequest) -> ChatResponse:
    try:
        result = run_quick_action(request.action, request.params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Missing required param: {exc}")
    except Exception as exc:
        logger.exception("Quick action failed: action=%s params=%s exc=%s", request.action, request.params, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute answer from Databricks: {exc}",
        )

    return ChatResponse(**result)


@app.get(
    "/kpis",
    response_model=KPISummary,
    summary="Dashboard KPI summary",
    description="At-a-glance numbers for the dashboard header: top category, top product, at-risk count, and predicted revenue.",
)
def get_kpis() -> KPISummary:
    try:
        summary = analytics.get_kpi_summary()
    except Exception as exc:
        logger.exception("Failed to compute KPI summary: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute KPI summary from Databricks: {exc}",
        )

    return KPISummary(
        top_category=TopCategoryStat(**summary["top_category"]),
        top_product=TopProductStat(**summary["top_product"]),
        predicted_revenue=PredictedRevenueStat(**summary["predicted_revenue"]),
        at_risk_count=summary["at_risk_count"],
    )


ALLOWED_UPLOAD_PREFIXES = ("sales_transactions", "calendar_marketing_external")


def _validate_upload_filename(filename: Optional[str]) -> str:
    """Enforce what the Bronze notebook expects: a CSV whose filename starts
    with one of the recognized prefixes. Raises HTTPException(400) otherwise."""
    if not filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")
    if not filename.startswith(ALLOWED_UPLOAD_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail=f"Filename must start with one of {ALLOWED_UPLOAD_PREFIXES} -- that's what the Bronze notebook expects.",
        )

    return filename


async def _upload_pipeline_files(files: List[UploadFile]) -> List[UploadedFileInfo]:
    """Upload logic for pipeline files."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    for file in files:
        _validate_upload_filename(file.filename)

    uploaded: List[UploadedFileInfo] = []
    for file in files:
        content = await file.read()
        try:
            volume_path = databricks_jobs.upload_file_to_volume(file.filename, content)
        except DatabricksJobsConfigError as exc:
            logger.error("Pipeline upload is not configured: %s", exc)
            raise HTTPException(status_code=503, detail=f"Pipeline upload is not configured: {exc}")
        except Exception as exc:
            logger.exception("Failed to upload pipeline file %s to Databricks Volume: %s", file.filename, exc)
            raise HTTPException(
                status_code=502, 
                detail=f"Failed to upload {file.filename} to Databricks Volume: {exc}",
            )
        uploaded.append(UploadedFileInfo(filename=file.filename or "unknown.csv", volume_path=volume_path))

    return uploaded


def _trigger_pipeline_job() -> int:
    """Shared trigger logic for /pipeline/trigger and /pipeline/upload-and-trigger."""
    try:
        return databricks_jobs.trigger_job()
    except DatabricksJobsConfigError as exc:
        logger.info("Pipeline trigger is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=f"Pipeline trigger is not configured: {exc}")
    except Exception as exc:
        logger.exception("Failed to trigger Databricks job: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to trigger the pipeline job: {exc}",
        )


@app.post(
    "/pipeline/upload",
    response_model=PipelineUploadResponse,
    summary="Upload raw data file(s) to incoming Volume without triggering the pipeline",
)
async def upload_pipeline(
    sales_transactions_file: Optional[UploadFile] = File(None),
    calendar_marketing_file: Optional[UploadFile] = File(None),
) -> PipelineUploadResponse:
    files = [f for f in (sales_transactions_file, calendar_marketing_file) if f is not None]
    uploaded = await _upload_pipeline_files(files)
    return PipelineUploadResponse(files=uploaded)


@app.post(
    "/pipeline/trigger",
    response_model=PipelineTriggerResponse,
    summary="Trigger the data pipeline job (run-now, no new file)",
    description="Triggers a run-now on DATABRICKS_JOB_ID against existing files in the Volume.",
)
def trigger_pipeline() -> PipelineTriggerResponse:
    run_id = _trigger_pipeline_job()
    return PipelineTriggerResponse(run_id=run_id)


@app.get(
    "/pipeline/status/{run_id}",
    response_model=PipelineStatusResponse,
    summary="Check a pipeline run's status",
    description="Returns the run's life_cycle_state, result_state, and state_message.",
)
def get_pipeline_status(run_id: int) -> PipelineStatusResponse:
    try:
        status = databricks_jobs.get_run_status(run_id)
    except DatabricksJobsConfigError as exc:
        logger.error("Pipeline status check is not configured: %s", exc)
        raise HTTPException(status_code=503, detail=f"Pipeline status check is not configured: {exc}")
    except Exception as exc:
        logger.exception("Failed to fetch run status for run_id=%s: %s", run_id, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch pipeline run status: {exc}",
        )

    return PipelineStatusResponse(run_id=run_id, **status)


@app.post(
    "/pipeline/upload-and-trigger",
    response_model=PipelineUploadAndTriggerResponse,
    summary="Upload raw data file(s) and immediately trigger the pipeline",
    description="Uploads files to DATABRICKS_VOLUME_INCOMING_PATH, then triggers a run-now on DATABRICKS_JOB_ID.",
)
async def upload_and_trigger_pipeline(
    sales_transactions_file: Optional[UploadFile] = File(
        None, 
        description="CSV whose filename starts with 'sales_transactions', e.g. sales_transactions_2026_09.csv"
    ),
    calendar_marketing_file: Optional[UploadFile] = File(
        None,
        description="CSV whose filename starts with 'calendar_marketing_external', e.g. calendar_marketing_external_2026_09.csv"
    )
) -> PipelineUploadAndTriggerResponse:
    files = [f for f in (sales_transactions_file, calendar_marketing_file) if f is not None]
    uploaded = await _upload_pipeline_files(files)
    run_id = _trigger_pipeline_job()
    return PipelineUploadAndTriggerResponse(files=uploaded, run_id=run_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
