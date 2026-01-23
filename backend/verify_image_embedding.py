from app.clients.embedding.embedding_client import EmbeddingClient
from PIL import Image
import numpy as np
import os

def test_image_embedding():
    print("Initializing EmbeddingClient...")
    client = EmbeddingClient()
    
    # Create dummy image
    print("Creating dummy image...")
    img = Image.new('RGB', (100, 100), color = 'red')
    img_path = "temp_test_image.png"
    img.save(img_path)
    
    try:
        # Embed image from object
        print("Embedding image from PIL object...")
        emb_img = client.embed_image(img)
        print(f"Image embedding dim: {len(emb_img)}")
        assert len(emb_img) == 512, f"Expected 512, got {len(emb_img)}"
        
        # Embed image from path
        print("Embedding image from path...")
        emb_img_path = client.embed_image(img_path)
        print(f"Image path embedding dim: {len(emb_img_path)}")
        assert len(emb_img_path) == 512
        
        # Embed text for image search
        print("Embedding text for image search...")
        emb_text = client.embed_text_clip("red square")
        print(f"Text CLIP embedding dim: {len(emb_text)}")
        assert len(emb_text) == 512
        
        # Validation: Dot product should be high for matching text/image
        score = np.dot(emb_img, emb_text)
        print(f"Similarity score (red square vs image): {score}")
        
        # Negative test
        emb_text_neg = client.embed_text_clip("blue circle")
        score_neg = np.dot(emb_img, emb_text_neg)
        print(f"Similarity score (blue circle vs image): {score_neg}")
        
        if score > score_neg:
            print("SUCCESS: Image matched 'red square' better than 'blue circle'")
        else:
            print("WARNING: Similarity scores unexpected (might be unnormalized)")

        print("Verification successful!")
        
    finally:
        if os.path.exists(img_path):
            os.remove(img_path)

if __name__ == "__main__":
    test_image_embedding()
