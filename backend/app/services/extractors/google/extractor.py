"""
Google Docs/Slides Content Extractor

Extracts text content from publicly shared Google Docs and Slides
using their export endpoints (no OAuth required for public docs).
"""

import re
import logging
import time
from typing import Tuple, Optional
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class GoogleExtractionResult:
    """Result from Google Docs/Slides extraction"""
    success: bool
    content: str
    title: str
    doc_type: str  # "google_docs" or "google_slides"
    doc_id: str
    word_count: int = 0
    error: Optional[str] = None
    processing_time_ms: int = 0


def extract_google_doc_id(url: str) -> Tuple[Optional[str], str]:
    """
    Extract document ID and type from Google Docs/Slides URL.
    
    Supported URL formats:
    - https://docs.google.com/document/d/{DOC_ID}/edit
    - https://docs.google.com/document/d/{DOC_ID}/view
    - https://docs.google.com/document/d/{DOC_ID}/edit?usp=sharing
    - https://docs.google.com/presentation/d/{DOC_ID}/edit
    - https://docs.google.com/presentation/d/{DOC_ID}/view
    
    Returns:
        Tuple of (doc_id, doc_type) where doc_type is "docs" or "slides"
    """
    # Pattern for Google Docs
    docs_pattern = r"docs\.google\.com/document/d/([a-zA-Z0-9_-]+)"
    # Pattern for Google Slides
    slides_pattern = r"docs\.google\.com/presentation/d/([a-zA-Z0-9_-]+)"
    # Pattern for Google Sheets
    sheets_pattern = r"docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)"
    
    docs_match = re.search(docs_pattern, url)
    if docs_match:
        return docs_match.group(1), "docs"
    
    slides_match = re.search(slides_pattern, url)
    if slides_match:
        return slides_match.group(1), "slides"

    sheets_match = re.search(sheets_pattern, url)
    if sheets_match:
        return sheets_match.group(1), "sheets"
    
    return None, "unknown"


async def extract_google_docs_content(url: str) -> GoogleExtractionResult:
    """
    Extract text content from a Google Docs document.
    
    Uses the public export endpoint which works for documents
    shared as "Anyone with the link can view".
    
    Args:
        url: Google Docs URL
        
    Returns:
        GoogleExtractionResult with extracted content or error
    """
    start_time = time.time()
    doc_id, doc_type = extract_google_doc_id(url)
    
    if not doc_id or doc_type != "docs":
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_docs",
            doc_id="",
            error="Invalid Google Docs URL format. Expected: docs.google.com/document/d/{id}/..."
        )
    
    # Google Docs export URL for plain text
    export_url = f"https://docs.google.com/document/d/{doc_id}/export?format=txt"
    
    logger.info(f"[GOOGLE_DOCS] Extracting from doc_id: {doc_id}")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                export_url, 
                timeout=aiohttp.ClientTimeout(total=30),
                allow_redirects=True
            ) as response:
                processing_time = int((time.time() - start_time) * 1000)
                
                if response.status == 200:
                    content = await response.text()
                    
                    # Clean up content - remove BOM and extra whitespace
                    content = content.strip()
                    if content.startswith('\ufeff'):
                        content = content[1:]
                    
                    # Word count
                    word_count = len(content.split())
                    
                    # Extract title from first non-empty line
                    lines = [l.strip() for l in content.split('\n') if l.strip()]
                    title = lines[0][:200] if lines else "Untitled Google Doc"
                    
                    logger.info(f"[GOOGLE_DOCS] ✅ Extracted {word_count} words from doc")
                    
                    return GoogleExtractionResult(
                        success=True,
                        content=content,
                        title=title,
                        doc_type="google_docs",
                        doc_id=doc_id,
                        word_count=word_count,
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 403 or response.status == 401:
                    logger.warning(f"[GOOGLE_DOCS] Access denied for doc_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_docs",
                        doc_id=doc_id,
                        error="This document is private. Please change sharing settings to 'Anyone with the link can view' and try again.",
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 404:
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_docs",
                        doc_id=doc_id,
                        error="Document not found. Please check the URL and try again.",
                        processing_time_ms=processing_time
                    )
                    
                else:
                    logger.error(f"[GOOGLE_DOCS] HTTP {response.status} for doc_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_docs",
                        doc_id=doc_id,
                        error=f"Failed to fetch document (HTTP {response.status})",
                        processing_time_ms=processing_time
                    )
                    
    except aiohttp.ClientTimeout:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_DOCS] Timeout for doc_id: {doc_id}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_docs",
            doc_id=doc_id,
            error="Request timed out. Please try again.",
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_DOCS] Error extracting doc_id {doc_id}: {str(e)}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_docs",
            doc_id=doc_id,
            error=f"Extraction failed: {str(e)}",
            processing_time_ms=processing_time
        )


async def extract_google_slides_content(url: str) -> GoogleExtractionResult:
    """
    Extract text content from a Google Slides presentation.
    
    Uses the public export endpoint which works for presentations
    shared as "Anyone with the link can view".
    
    Args:
        url: Google Slides URL
        
    Returns:
        GoogleExtractionResult with extracted content or error
    """
    start_time = time.time()
    doc_id, doc_type = extract_google_doc_id(url)
    
    if not doc_id or doc_type != "slides":
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_slides",
            doc_id="",
            error="Invalid Google Slides URL format. Expected: docs.google.com/presentation/d/{id}/..."
        )
    
    # Google Slides export URL for plain text
    export_url = f"https://docs.google.com/presentation/d/{doc_id}/export/txt"
    
    logger.info(f"[GOOGLE_SLIDES] Extracting from presentation_id: {doc_id}")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                export_url,
                timeout=aiohttp.ClientTimeout(total=30),
                allow_redirects=True
            ) as response:
                processing_time = int((time.time() - start_time) * 1000)
                
                if response.status == 200:
                    content = await response.text()
                    
                    # Clean up content
                    content = content.strip()
                    if content.startswith('\ufeff'):
                        content = content[1:]
                    
                    # Word count
                    word_count = len(content.split())
                    
                    # Extract title from first non-empty line
                    lines = [l.strip() for l in content.split('\n') if l.strip()]
                    title = lines[0][:200] if lines else "Untitled Presentation"
                    
                    logger.info(f"[GOOGLE_SLIDES] ✅ Extracted {word_count} words from presentation")
                    
                    return GoogleExtractionResult(
                        success=True,
                        content=content,
                        title=title,
                        doc_type="google_slides",
                        doc_id=doc_id,
                        word_count=word_count,
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 403 or response.status == 401:
                    logger.warning(f"[GOOGLE_SLIDES] Access denied for presentation_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_slides",
                        doc_id=doc_id,
                        error="This presentation is private. Please change sharing settings to 'Anyone with the link can view' and try again.",
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 404:
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_slides",
                        doc_id=doc_id,
                        error="Presentation not found. Please check the URL and try again.",
                        processing_time_ms=processing_time
                    )
                    
                else:
                    logger.error(f"[GOOGLE_SLIDES] HTTP {response.status} for presentation_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_slides",
                        doc_id=doc_id,
                        error=f"Failed to fetch presentation (HTTP {response.status})",
                        processing_time_ms=processing_time
                    )
                    
    except aiohttp.ClientTimeout:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_SLIDES] Timeout for presentation_id: {doc_id}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_slides",
            doc_id=doc_id,
            error="Request timed out. Please try again.",
            processing_time_ms=processing_time
        )
        

    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_SLIDES] Error extracting presentation_id {doc_id}: {str(e)}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_slides",
            doc_id=doc_id,
            error=f"Extraction failed: {str(e)}",
            processing_time_ms=processing_time
        )


async def extract_google_sheets_content(url: str) -> GoogleExtractionResult:
    """
    Extract text content from a Google Sheets spreadsheet.
    
    Uses the public export endpoint which works for spreadsheets
    shared as "Anyone with the link can view".
    
    Args:
        url: Google Sheets URL
        
    Returns:
        GoogleExtractionResult with extracted content or error
    """
    start_time = time.time()
    doc_id, doc_type = extract_google_doc_id(url)
    
    if not doc_id or doc_type != "sheets":
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_sheets",
            doc_id="",
            error="Invalid Google Sheets URL format. Expected: docs.google.com/spreadsheets/d/{id}/..."
        )
    
    # Google Sheets export URL for CSV (first sheet)
    # We could theoretically iterate sheets, but simple CSV export of first sheet is a good start
    export_url = f"https://docs.google.com/spreadsheets/d/{doc_id}/export?format=csv"
    
    logger.info(f"[GOOGLE_SHEETS] Extracting from spreadsheet_id: {doc_id}")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                export_url,
                timeout=aiohttp.ClientTimeout(total=30),
                allow_redirects=True
            ) as response:
                processing_time = int((time.time() - start_time) * 1000)
                
                if response.status == 200:
                    csv_content = await response.text()
                    
                    # Clean up content
                    csv_content = csv_content.strip()
                    if csv_content.startswith('\ufeff'):
                        csv_content = csv_content[1:]
                    
                    # Convert to Markdown Table for better readability
                    import csv
                    import io
                    
                    try:
                        # Parse CSV
                        reader = csv.reader(io.StringIO(csv_content))
                        rows = list(reader)
                        
                        markdown_content = ""
                        
                        if rows:
                            # Create Header
                            headers = rows[0]
                            markdown_content += "| " + " | ".join([f"**{h.strip()}**" for h in headers]) + " |\n"
                            markdown_content += "| " + " | ".join(["---"] * len(headers)) + " |\n"
                            
                            # Create Rows
                            for row in rows[1:]:
                                # Hande row length mismatch if any
                                if len(row) < len(headers):
                                    row += [""] * (len(headers) - len(row))
                                elif len(row) > len(headers):
                                    row = row[:len(headers)]
                                    
                                cleaned_row = [cell.replace('\n', ' ').strip() for cell in row]
                                markdown_content += "| " + " | ".join(cleaned_row) + " |\n"
                                
                            # If empty content
                            if not markdown_content.strip():
                                markdown_content = csv_content # Fallback
                        else:
                            markdown_content = "Empty Spreadsheet"
                            
                    except Exception as e:
                        logger.warning(f"Failed to convert CSV to Markdown: {e}")
                        markdown_content = csv_content # Fallback to raw CSV

                    # Word count (approximate)
                    word_count = len(markdown_content.split())
                    
                    # Use filename from Content-Disposition header if available
                    title = "Untitled Spreadsheet"
                    if "Content-Disposition" in response.headers:
                        import cgi
                        _, params = cgi.parse_header(response.headers["Content-Disposition"])
                        if "filename" in params:
                            title = params["filename"].replace(".csv", "")
                    
                    logger.info(f"[GOOGLE_SHEETS] ✅ Extracted {word_count} words from spreadsheet (formatted as Markdown)")
                    
                    return GoogleExtractionResult(
                        success=True,
                        content=markdown_content,
                        title=title,
                        doc_type="google_sheets",
                        doc_id=doc_id,
                        word_count=word_count,
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 403 or response.status == 401:
                    logger.warning(f"[GOOGLE_SHEETS] Access denied for spreadsheet_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_sheets",
                        doc_id=doc_id,
                        error="This spreadsheet is private. Please change sharing settings to 'Anyone with the link can view' and try again.",
                        processing_time_ms=processing_time
                    )
                    
                elif response.status == 404:
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_sheets",
                        doc_id=doc_id,
                        error="Spreadsheet not found. Please check the URL and try again.",
                        processing_time_ms=processing_time
                    )
                    
                else:
                    logger.error(f"[GOOGLE_SHEETS] HTTP {response.status} for spreadsheet_id: {doc_id}")
                    return GoogleExtractionResult(
                        success=False,
                        content="",
                        title="",
                        doc_type="google_sheets",
                        doc_id=doc_id,
                        error=f"Failed to fetch spreadsheet (HTTP {response.status})",
                        processing_time_ms=processing_time
                    )
                    
    except aiohttp.ClientTimeout:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_SHEETS] Timeout for spreadsheet_id: {doc_id}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_sheets",
            doc_id=doc_id,
            error="Request timed out. Please try again.",
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"[GOOGLE_SHEETS] Error extracting spreadsheet_id {doc_id}: {str(e)}")
        return GoogleExtractionResult(
            success=False,
            content="",
            title="",
            doc_type="google_sheets",
            doc_id=doc_id,
            error=f"Extraction failed: {str(e)}",
            processing_time_ms=processing_time
        )
