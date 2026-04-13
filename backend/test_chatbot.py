"""Test script to check if RAG Chatbot initializes correctly"""
import os
from dotenv import load_dotenv

load_dotenv()

print("=== Testing RAG Chatbot Initialization ===")
print()

# Check if API key is loaded
api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    print(f"[OK] API key found: {api_key[:20]}...")
else:
    print("[ERROR] API key NOT found in environment!")
    print("Make sure .env file exists and has OPENAI_API_KEY set")
    exit(1)

print()
print("Attempting to initialize RAG Chatbot...")
print()

try:
    from rag_chatbot import RAGChatbot
    chatbot = RAGChatbot()
    print("[OK] RAG Chatbot initialized successfully!")
    print()
    print("The chatbot is ready to use.")
except Exception as e:
    print(f"[ERROR] Error initializing RAG Chatbot: {e}")
    print()
    print("Full error details:")
    import traceback
    traceback.print_exc()
    exit(1)
