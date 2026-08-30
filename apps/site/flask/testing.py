from openai import OpenAI

api_key = "TEST"

client = OpenAI(
  base_url = "http://127.0.0.1:8085",
  api_key = api_key
)


# client = OpenAI(
#   base_url = "http://192.168.0.181:8085",
#   api_key = api_key
# )

# Get available models
try:
    models = client.models.list()
    print("Available models:")
    for model in models.data:
        print(f"- {model.id}")
except Exception as e:
    print(f"Error fetching models: {e}")

completion = client.chat.completions.create(
  model="gpt-4o",
  messages=[{"role":"system","content":"detailed thinking on"},{"role":"user","content":"Test."}],
  temperature=0.6,
  top_p=0.7,
  max_tokens=4096,
  frequency_penalty=0,
  presence_penalty=0,
  stream=False
)

print("Completion response:")
print(completion)

for chunk in completion:
  if chunk.choices[0].delta.content is not None:
    print(chunk.choices[0].delta.content, end="")