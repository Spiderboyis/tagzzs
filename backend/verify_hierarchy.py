
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

async def test_hierarchy_parsing():
    print("Testing hierarchy parsing logic...")

    # Mock response content
    mock_json_response = {
        "parent": {
            "name": "Technology",
            "score": 0.99,
            "children": [
                {
                    "name": "AI",
                    "score": 0.95,
                    "grandchildren": [
                        { "name": "LLMs", "score": 0.92 },
                        { "name": "Computer Vision", "score": 0.88 }
                    ]
                },
                {
                    "name": "Web Dev",
                    "score": 0.90,
                    "grandchildren": [
                        { "name": "React", "score": 0.85 }
                    ]
                }
            ]
        }
    }

    mock_content = json.dumps(mock_json_response)
    
    # We need to ensure the engine uses our mock client, even if it tries to import it
    # Since we mocked app.clients, TagGenerationEngine will import the mock. 
    # But inside __init__, it calls get_groq_client().
    # Our mock_clients.get_groq_client should return the client mock.
    
    mock_client = MagicMock()
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock()]
    mock_completion.choices[0].message.content = f"Here is the JSON:\n{mock_content}"
    mock_client.chat.completions.create.return_value = mock_completion
    
    mock_clients.get_groq_client.return_value = mock_client

    # Initialize engine
    config = TagGenerationConfig(api_key="test_key")
    engine = TagGenerationEngine(config)
    
    # Inject client explicitly just in case existing one is weird (though it should be the mock)
    engine.client = mock_client

    # Create request
    request = TagGenerationRequest(text="Analysis of AI and Web Development.")

    # Run generation
    response = await engine.generate(request)

    # Verify results
    print(f"Success: {response.success}")
    print(f"Generated {len(response.tags)} tags.")
    
    for tag in response.tags:
        print(f"- [{tag.type}] {tag.name} (Parent: {tag.parent_name}, Score: {tag.score})")

    # Assertions
    assert response.success
    assert len(response.tags) == 6 # 1 Parent + 2 Children + 3 Grandchildren
    
    parent = next(t for t in response.tags if t.type == "parent")
    assert parent.name == "Technology"
    
    ai_child = next(t for t in response.tags if t.name == "AI")
    assert ai_child.parent_name == "Technology"
    assert ai_child.type == "child"

    llm_grand = next(t for t in response.tags if t.name == "LLMs")
    assert llm_grand.parent_name == "AI"
    assert llm_grand.type == "grandchild"

    print("✅ Validation successful: correct hierarchy parsed.")

if __name__ == "__main__":
    asyncio.run(test_hierarchy_parsing())
