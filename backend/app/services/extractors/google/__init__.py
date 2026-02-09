# Google Docs/Slides Extractor Package
from .extractor import (
    extract_google_docs_content,
    extract_google_slides_content,
    extract_google_sheets_content,
    extract_google_doc_id,
    GoogleExtractionResult
)

__all__ = [
    "extract_google_docs_content",
    "extract_google_slides_content",
    "extract_google_sheets_content",
    "extract_google_doc_id",
    "GoogleExtractionResult"
]
