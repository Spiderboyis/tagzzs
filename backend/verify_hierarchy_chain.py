
import sys
import os
import asyncio
import json
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# MOCK dependencies BEFORE importing generator to avoid runtime environment issues
mock_clients = MagicMock()
sys.modules["app.clients"] = mock_clients

# Import the module to test
from app.services.refiners.tag_generators.generator import TagGenerationEngine, TagGenerationRequest
from app.services.refiners.tag_generators.models import TagGenerationConfig

async def test_linear_hierarchy_parsing():
    print("Testing linear hierarchy parsing logic...")

    # Mock response content for a 3-level chain
    mock_json_response = {
        "chain": [
            { "level": "parent", "name": "Technology", "score": 0.99 },
            { "level": "child", "name": "AI", "score": 0.95 },
            { "level": "grandchild", "name": "LLMs", "score": 0.92 }
        ]
    }

    mock_content = json.dumps(mock_json_response)
    
    mock_client = MagicMock()
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock()]
    mock_completion.choices[0].message.content = f"Here is the JSON:\n{mock_content}"
    mock_client.chat.completions.create.return_value = mock_completion
    
    mock_clients.get_groq_client.return_value = mock_client

    # Initialize engine
    config = TagGenerationConfig(api_key="test_key")
    engine = TagGenerationEngine(config)
    engine.client = mock_client

    # Create request
    request = TagGenerationRequest(text="Analysis of AI LLMs.")

    # Run generation
    response = await engine.generate(request)

    # Verify results
    print(f"Success: {response.success}")
    print(f"Generated {len(response.tags)} tags.")
    
    for tag in response.tags:
        print(f"- [{tag.type}] {tag.name} (Parent: {tag.parent_name}, Score: {tag.score})")

    # Assertions
    assert response.success
    assert len(response.tags) == 3 
    
    t1 = response.tags[0]
    assert t1.type == "parent"
    assert t1.name == "Technology"
    assert t1.parent_name is None
    
    t2 = response.tags[1]
    assert t2.type == "child"
    assert t2.name == "AI"
    assert t2.parent_name == "Technology"

    t3 = response.tags[2]
    assert t3.type == "grandchild"
    assert t3.name == "LLMs"
    assert t3.parent_name == "AI"

    print("✅ Validation successful: correct linear chain parsed.")

if __name__ == "__main__":
    asyncio.run(test_linear_hierarchy_parsing())
