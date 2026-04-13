"""
Test script for the Chat API endpoint with example questions
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

# Example questions to test the chat API
EXAMPLE_QUESTIONS = [
    # General questions
    "What is artificial intelligence?",
    "What is machine learning?",
    "Explain how machine learning works",
    "What is the difference between AI and machine learning?",
    
    # GPA Calculator related questions
    "How does the GPA calculator work?",
    "What grades are accepted in the GPA calculator?",
    "How do I calculate my GPA?",
    "What is the grade point value for an A+?",
    
    # Technical questions
    "What is FastAPI?",
    "How does RAG (Retrieval-Augmented Generation) work?",
    "What is a vector database?",
    
    # Conversational questions
    "Hello, how are you?",
    "Can you help me with my studies?",
    "What can you do?",
    
    # Follow-up questions (use same conversation_id)
    "Tell me more about that",
    "Can you explain that in simpler terms?",
]

def test_chat_api(question: str, conversation_id: str = None):
    """
    Test the chat API endpoint with a question.
    
    Args:
        question: The question to ask
        conversation_id: Optional conversation ID for context
    """
    url = f"{BASE_URL}/api/chat"
    
    payload = {
        "message": question
    }
    
    if conversation_id:
        payload["conversation_id"] = conversation_id
    
    try:
        print(f"\n{'='*60}")
        print(f"Question: {question}")
        print(f"{'='*60}")
        
        response = requests.post(url, json=payload)
        
        if response.status_code == 200:
            result = response.json()
            print(f"\nAnswer: {result['response']}")
            print(f"\nConversation ID: {result['conversation_id']}")
            
            if result.get('sources'):
                print(f"\nSources ({len(result['sources'])}):")
                for i, source in enumerate(result['sources'], 1):
                    print(f"  {i}. {source[:100]}...")
            
            return result['conversation_id']
        else:
            print(f"\nError: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        print("\nError: Could not connect to server.")
        print("Make sure the server is running at http://localhost:8000")
        return None
    except Exception as e:
        print(f"\nError: {e}")
        return None

def test_health_check():
    """Test the health check endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/api/health")
        if response.status_code == 200:
            result = response.json()
            print("Health Check:")
            print(f"  Status: {result['status']}")
            print(f"  RAG Chatbot Available: {result['rag_chatbot_available']}")
            return True
        else:
            print(f"Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"Health check error: {e}")
        return False

def main():
    """Main function to run all tests"""
    print("="*60)
    print("Chat API Test Script")
    print("="*60)
    
    # Check if server is running
    print("\n1. Checking server health...")
    if not test_health_check():
        print("\nServer is not available. Please start the server first:")
        print("  python main.py")
        print("  or")
        print("  .\\start_server.ps1")
        return
    
    # Test individual questions
    print("\n2. Testing individual questions...")
    conversation_id = None
    
    for i, question in enumerate(EXAMPLE_QUESTIONS[:5], 1):  # Test first 5 questions
        print(f"\n--- Test {i}/{min(5, len(EXAMPLE_QUESTIONS))} ---")
        conversation_id = test_chat_api(question, conversation_id)
        time.sleep(1)  # Small delay between requests
    
    # Test conversation flow (follow-up questions)
    print("\n3. Testing conversation flow...")
    print("\n--- Starting a conversation ---")
    conv_id = test_chat_api("What is artificial intelligence?")
    time.sleep(1)
    
    if conv_id:
        print("\n--- Follow-up question ---")
        test_chat_api("Can you give me a simple example?", conv_id)
        time.sleep(1)
        
        print("\n--- Another follow-up ---")
        test_chat_api("How is it used in everyday life?", conv_id)
    
    print("\n" + "="*60)
    print("Testing complete!")
    print("="*60)
    print("\nTo test more questions, modify EXAMPLE_QUESTIONS in this file")
    print("or call test_chat_api() with your own questions.")

if __name__ == "__main__":
    main()
