"""Application configuration loaded from environment variables (never hardcoded keys)."""

from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime settings for MedSarthi backend."""

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(ROOT_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "MedSarthi"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SYNTHETIC_PROTOTYPE_MODE: bool = True
    PROTOTYPE_NOTICE: str = (
        "Educational prototype using synthetic data only. "
        "Not clinically validated for real clinical care."
    )

    DATABASE_URL: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'medsarthi.db').as_posix()}"

    JWT_SECRET_KEY: str = "dev-only-change-me-to-a-64-char-random-secret-key-medsarthi-2026"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False
    REFRESH_COOKIE_NAME: str = "medsarthi_refresh_token"
    CSRF_COOKIE_NAME: str = "medsarthi_csrf_token"

    FRONTEND_ORIGIN: str = "http://localhost:3000"
    STORAGE_LOCAL_DIR: str = str(BACKEND_DIR / "storage")
    AUDIO_DEFAULT_RETENTION_HOURS: int = 24

    # AI / OCR / Speech provider selection & privacy guards (keys remain empty by default)
    LLM_PRIMARY_PROVIDER: str = "groq"
    LLM_FALLBACK_PROVIDER: str = "openrouter"
    LLM_ALLOW_UNPAID_TRAINING_TIER: bool = False
    GROQ_ZDR_VERIFIED: bool = False
    GROQ_API_KEY: str = Field(default="")
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    OPENAI_API_KEY: str = Field(default="")
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENROUTER_API_KEY: str = Field(default="")
    OPENROUTER_MODEL: str = "meta-llama/llama-3.3-70b-instruct:free"

    QR_UPLOAD_AUTO_START: bool = True

    OCR_PRIMARY_PROVIDER: str = "pymupdf_rapidocr"
    OCR_FALLBACK_PROVIDER: str = "google_vision"
    GOOGLE_CLOUD_VISION_API_KEY: str = Field(default="")
    GCV_ENDPOINT: str = "https://us-vision.googleapis.com"
    AZURE_DOC_INTEL_ENDPOINT: str = Field(default="")
    AZURE_DOC_INTEL_KEY: str = Field(default="")
    AZURE_DOC_INTEL_F0_MODE: bool = True

    STT_PRIMARY_PROVIDER: str = "deepgram"
    DEEPGRAM_API_KEY: str = Field(default="")
    DEEPGRAM_MIP_OPT_OUT: bool = True

    TTS_PRIMARY_PROVIDER: str = "mithi"
    MITHI_VOICE_NAME: str = "charvi"
    MITHI_MODEL_DIR: str = "./models/mithi-v2-flash"
    MITHI_DEVICE: str = "cuda"
    MITHI_FALLBACK_CPU: bool = True
    TRANSLATION_PROVIDER: str = "llm"

    @property
    def mithi_model_path(self) -> Path:
        path = Path(self.MITHI_MODEL_DIR)
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        return path

    QR_UPLOAD_PORT: int = 5000
    NGROK_AUTHTOKEN: str = Field(default="")

    @property
    def storage_path(self) -> Path:
        path = Path(self.STORAGE_LOCAL_DIR)
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        return path


@lru_cache
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()
