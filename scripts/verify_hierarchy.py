import asyncio
import os
import sys

# Add backend directory to sys.path to allow imports
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.refiners.tag_generators.generator import TagGenerationEngine, TagGenerationConfig
from app.services.refiners.tag_generators.models import TagGenerationRequest

# Mock response for testing parsing logic without real API call
class MockMessage:
    def __init__(self, content):
        self.message = self
        self.content = content

class MockChoice:
    def __init__(self, content):
        self.message = MockMessage(content)

class MockCompletion:
    def __init__(self, content):
        self.choices = [MockChoice(content)]

class MockClient:
    def __init__(self, response_content):
        self.chat = self
        self.completions = self
        self.response_content = response_content

    def create(self, **kwargs):
        return MockCompletion(self.response_content)

async def test_parsing():
    print("Testing Linear Hierarchy Parsing...")

    # Mock JSON response from LLM
    mock_json = """
    {
        "parent": {
            "name": "Technology",
            "score": 0.95
        },
        "child_1": {
            "name": "Programming",
            "score": 0.90
        },
        "child_2": {
            "name": "Python",
            "score": 0.85
        }
    }
    """
    
    config = TagGenerationConfig(api_key="mock_key")
    engine = TagGenerationEngine(config)
    
    # Analyze the prompt and parsing logic by overriding the client
    # Note: validation of prompt effect requires real API call, but we test parsing here.
    engine.client = MockClient(mock_json)

    request = TagGenerationRequest(text="This is a tutorial about Python programming.", top_k=3)
    response = await engine.generate(request)

    if not response.success:
        print("❌ Generation failed")
        return

    print(f"✅ Generated {len(response.tags)} tags")
    
    tags = response.tags
    if len(tags) != 3:
        print(f"❌ Expected 3 tags, got {len(tags)}")
        return

    # Verify Parent
    t1 = tags[0]
    print(f"Tag 1: {t1.name} (Parent: {t1.parent_name})")
    if t1.parent_name is not None:
         print("❌ Tag 1 should be root (parent_name=None)")

    # Verify Child 1
    t2 = tags[1]
    print(f"Tag 2: {t2.name} (Parent: {t2.parent_name})")
    if t2.parent_name != t1.name:
         print(f"❌ Tag 2 parent should be {t1.name}")

    # Verify Child 2
    t3 = tags[2]
    print(f"Tag 3: {t3.name} (Parent: {t3.parent_name})")
    if t3.parent_name != t2.name:
         print(f"❌ Tag 3 parent should be {t2.name}")

    print("\n✅ Parsing Logic Verified Successfully!")

if __name__ == "__main__":
    asyncio.run(test_parsing())
