# Web Content Extractor Engine

import logging
import time
import os

from firecrawl import AsyncFirecrawl

from .models import (
    ExtractionRequest,
    ExtractionResponse,
    CleanedData,
    MetaData,
)
from .error_handling import handle_extraction_error
from app.utils.reading_time import calculate_reading_time


class WebContentExtractor:
    """
    Web content extraction using Firecrawl SDK.

    Replaces custom BeautifulSoup implementation with Firecrawl's markdown extraction.
    Dependent on FIRECRAWL_API_KEY environment variable.
    """

    def __init__(self):
        """Initialize the extractor"""
        self.logger = logging.getLogger(__name__)
        api_key = os.getenv("FIRECRAWL_API_KEY")
        if not api_key:
            self.logger.warning("FIRECRAWL_API_KEY not found. Extraction may fail.")

        # Initialize AsyncFirecrawl client
        self.client = AsyncFirecrawl(api_key=api_key)

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        pass

    async def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        """
        Main extraction method using Firecrawl.

        Extracts content from the given URL and returns structured response.
        """
        start_time = time.time()
        url = str(request.url)

        response = ExtractionResponse(url=url)

        try:
            scrape_result = await self.client.scrape(url, formats=["markdown"])

            if isinstance(scrape_result, list):
                if not scrape_result:
                    raise ValueError("No result returned from Firecrawl")
                scrape_result = scrape_result[0]

            # 1. Raw Data (Markdown)
            markdown_content = ""
            if hasattr(scrape_result, "markdown"):
                markdown_content = scrape_result.markdown
            elif isinstance(scrape_result, dict):
                markdown_content = scrape_result.get("markdown", "")

            response.raw_data = markdown_content

            # 2. Cleaned Data
            cleaned_data = CleanedData()
            cleaned_data.main_content = markdown_content

            # Estimate word count/reading time from markdown
            if markdown_content:
                words = len(markdown_content.split())
                cleaned_data.word_count = words
                cleaned_data.reading_time_minutes = calculate_reading_time(
                    markdown_content
                )

            response.cleaned_data = cleaned_data

            # 3. Metadata
            fc_metadata = {}
            if hasattr(scrape_result, "metadata"):
                fc_metadata = scrape_result.metadata
            elif isinstance(scrape_result, dict):
                fc_metadata = scrape_result.get("metadata", {})

            # Helper to get field from dict or object safely
            def get_field(obj, key):
                if isinstance(obj, dict):
                    return obj.get(key)
                return getattr(obj, key, None)

            meta_data = MetaData()
            meta_data.title = get_field(fc_metadata, "title")
            meta_data.description = get_field(fc_metadata, "description")
            meta_data.language = get_field(fc_metadata, "language")
            meta_data.author = get_field(fc_metadata, "author")
            meta_data.keywords = get_field(fc_metadata, "keywords")
            meta_data.og_title = get_field(fc_metadata, "ogTitle")
            meta_data.og_description = get_field(fc_metadata, "ogDescription")
            meta_data.og_image = get_field(fc_metadata, "ogImage")
            meta_data.og_url = get_field(fc_metadata, "ogUrl")

            # Fallbacks or extra mapping
            if not meta_data.title and get_field(fc_metadata, "ogTitle"):
                meta_data.title = get_field(fc_metadata, "ogTitle")

            # Extract first image from markdown if og:image is missing
            if not meta_data.og_image and markdown_content:
                import re

                # Regex to find first markdown image: ![alt](src)
                image_match = re.search(r"!\[.*?\]\((.*?)\)", markdown_content)
                if image_match:
                    first_image_url = image_match.group(1)
                    if first_image_url.startswith("http"):
                        meta_data.og_image = first_image_url

            response.meta_data = meta_data

        except Exception as e:
            response = handle_extraction_error(
                response=response,
                exception=e,
                stage="extraction",
                context={"url": url, "stage": "firecrawl_scrape"},
                url=url,
                logger=self.logger,
            )

        processing_time = int((time.time() - start_time) * 1000)
        response.processing_time_ms = processing_time

        return response


async def extract_content(url: str) -> ExtractionResponse:
    """
    Convenience function for single content extraction.

    Args:
        url: URL to extract content from

    Returns:
        ExtractionResponse with extracted content
    """
    from pydantic import HttpUrl

    # Convert string URL to HttpUrl for validation
    validated_url = HttpUrl(url)
    request = ExtractionRequest(url=validated_url)

    async with WebContentExtractor() as extractor:
        return await extractor.extract(request)
