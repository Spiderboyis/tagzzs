"""
Tag Generation Engine

Core tag generation logic using Groq API.
Low-level implementation following extractor pattern with free-tier integration.
"""

import logging
import time
import os
import asyncio
import json
from typing import Optional

from app.clients import get_groq_client
from .models import (
    TagGenerationRequest,
    TagGenerationResponse,
    TagGenerationConfig,
    Tag,
)


class TagGenerationEngine:
    """
    Core tag generation engine using Groq API (LLaMA model).

    Implements low-level tag generation following architecture pattern:
    Text Input → Groq API Call → Tag Extraction → Structured Output

    Uses free-tier Groq API with LLaMA 3.1 70B model.
    """

    def __init__(self, config: Optional[TagGenerationConfig] = None):
        """Initialize tag generation engine"""
        if config is None:
            config = TagGenerationConfig(api_key=os.getenv("GROQ_API_KEY", ""))
        self.config = config
        self.logger = logging.getLogger(__name__)

        try:
            self.client = get_groq_client()
            self.logger.info(
                f"✅ Groq client initialized with model: {self.config.model_name}"
            )
        except Exception as e:
            self.logger.error(f"Failed to initialize Groq client: {str(e)}")
            raise

    async def generate(self, request: TagGenerationRequest) -> TagGenerationResponse:
        """
        Generate tags for text using Groq API with a single linear hierarchy chain.
        Sequence: Parent -> Child -> Grandchild
        Max 3 tags total.

        Args:
            request: TagGenerationRequest with text and parameters

        Returns:
            TagGenerationResponse with tags and metadata
        """
        start_time = time.time()
        response = TagGenerationResponse(
            success=False,
            text=request.text,
            tags=[],
            candidate_labels=self.config.candidate_labels,
            processing_time_ms=0,
        )

        try:
            self.logger.info(
                f"Starting tag generation via Groq API (text length: {len(request.text)} chars)"
            )

            labels_str = ", ".join(self.config.candidate_labels)

            max_text_chars = 2000
            text_to_analyze = (
                request.text[:max_text_chars]
                if len(request.text) > max_text_chars
                else request.text
            )
            if len(request.text) > max_text_chars:
                text_to_analyze += "..."
                self.logger.info(
                    f"Truncated text from {len(request.text)} to {len(text_to_analyze)} chars for tag generation"
                )

            prompt = f"""Analyze the following text and generate a hierarchical tagging structure.
1. Identify the single most relevant BROAD Category (Parent Tag).
2. Identify a specific Sub-topic (Child 1) that fits under that category.
3. Identify a more specific Detailed Topic (Child 2) that fits under the Sub-topic.
4. For each tag, provide a confidence score between 0 and 1.
5. Ensure tags are from the provided list if possible, but you may generate new relevant ones if needed.
6. The structure MUST be a linear chain: Parent -> Child 1 -> Child 2.

Available tags (for reference): {labels_str}

Text to analyze:
{text_to_analyze}

Please respond in JSON format with this EXACT structure:
{{
    "chain": [
        {{ "level": "parent", "name": "Broad_Category", "score": 0.95 }},
        {{ "level": "child", "name": "Sub_Category", "score": 0.90 }},
        {{ "level": "grandchild", "name": "Specific_Topic", "score": 0.85 }}
    ]
}}
Note: The "chain" list can have 1, 2, or 3 items depending on confidence and specificity. Use meaningful names.

Response:"""

            retry_count = 0
            while retry_count < self.config.max_retries:
                try:
                    message = self.client.chat.completions.create(
                        model=self.config.model_name,
                        max_tokens=1024,
                        temperature=self.config.temperature,
                        top_p=self.config.top_p,
                        messages=[{"role": "user", "content": prompt}],
                    )

                    response_text = message.choices[0].message.content.strip()

                    try:
                        json_start = response_text.find("{")
                        json_end = response_text.rfind("}") + 1
                        if json_start != -1 and json_end > json_start:
                            json_str = response_text[json_start:json_end]
                            parsed = json.loads(json_str)
                            response.tags = []
                            
                            chain = parsed.get("chain", [])
                            previous_tag_name = None
                            
                            # Validate and add tags in order
                            for item in chain:
                                name = item.get("name")
                                level = item.get("level")
                                score = float(item.get("score", 0.0))
                                
                                if not name:
                                    continue
                                    
                                # Map level string to our specific types just to be safe, though prompt asks for specific keys
                                if level not in ["parent", "child", "grandchild"]:
                                    # Fallback if LLM messes up level names
                                    if previous_tag_name is None:
                                        level = "parent"
                                    elif response.tags[-1].type == "parent":
                                        level = "child"
                                    else:
                                        level = "grandchild"

                                response.tags.append(
                                    Tag(
                                        name=name,
                                        score=score,
                                        type=level,
                                        parent_name=previous_tag_name
                                    )
                                )
                                previous_tag_name = name
                                
                                # Enforce max 3 just in case
                                if len(response.tags) >= 3:
                                    break

                    except (
                        json.JSONDecodeError,
                        KeyError,
                        IndexError,
                        ValueError,
                    ) as e:
                        self.logger.warning(
                            f"Failed to parse API response as JSON: {str(e)}"
                        )
                        response.tags = []

                    response.success = len(response.tags) > 0
                    self.logger.info(
                        f"✅ Tag generation complete. Generated {len(response.tags)} tags in chain"
                    )
                    break

                except Exception as e:
                    retry_count += 1
                    if retry_count >= self.config.max_retries:
                        raise
                    self.logger.warning(
                        f"API call failed, retrying ({retry_count}/{self.config.max_retries}): {str(e)}"
                    )
                    await asyncio.sleep(self.config.retry_delay)

        except Exception as e:
            self.logger.error(f"Tag generation failed: {str(e)}")
            response.errors.append(str(e))
            response.success = False

        response.processing_time_ms = int((time.time() - start_time) * 1000)

        return response
