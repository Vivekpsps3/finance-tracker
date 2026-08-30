from ollama import Client
client = Client(
  host='http://localhost:11434',
  headers={'x-some-header': 'some-value'}
)

# Send a message to the model
def get_chat_response(user_input):
    response = client.chat(model='gemma3:latest', messages=[
        {
            'role': 'user',
            'content': user_input,
        },
    ])
    return response['message']['content']

# Example usage
if __name__ == "__main__":
    user_input = "Hello, how are you?"
    print(get_chat_response(user_input))