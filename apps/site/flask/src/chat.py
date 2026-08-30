import requests
import json
import time
import sys
import asyncio
import aiohttp


class GitHubCopilotChat:
    MODELS = [
        'gpt-4o',
        'o1',
        'gemini-2.0-flash-001',
        'claude-3.5-sonnet',
        'claude-3.7-sonnet',
        'claude-3.7-sonnet-thought',
        'o3-mini'
    ]

    def __init__(self, model="claude-3.7-sonnet", token_file='.copilot_token'):
        self.model = model
        self.token_file = token_file
        self.token = None
        self.messages = []
        
    def setup(self):
        resp = requests.post('https://github.com/login/device/code', headers={
                'accept': 'application/json',
                'editor-version': 'Neovim/0.6.1',
                'editor-plugin-version': 'copilot.vim/1.16.0',
                'content-type': 'application/json',
                'user-agent': 'GithubCopilot/1.155.0',
                'accept-encoding': 'gzip,deflate,br'
            }, data='{"client_id":"Iv1.b507a08c87ecfe98","scope":"read:user"}')

        resp_json = resp.json()
        device_code = resp_json.get('device_code')
        user_code = resp_json.get('user_code')
        verification_uri = resp_json.get('verification_uri')

        print(f'Please visit {verification_uri} and enter code {user_code} to authenticate.')

        while True:
            time.sleep(5)
            resp = requests.post('https://github.com/login/oauth/access_token', headers={
                'accept': 'application/json',
                'editor-version': 'Neovim/0.6.1',
                'editor-plugin-version': 'copilot.vim/1.16.0',
                'content-type': 'application/json',
                'user-agent': 'GithubCopilot/1.155.0',
                'accept-encoding': 'gzip,deflate,br'
                }, data=f'{{"client_id":"Iv1.b507a08c87ecfe98","device_code":"{device_code}","grant_type":"urn:ietf:params:oauth:grant-type:device_code"}}')

            resp_json = resp.json()
            access_token = resp_json.get('access_token')

            if access_token:
                break

        with open(self.token_file, 'w') as f:
            f.write(access_token)

        print('Authentication success!')

    def get_token(self):
        while True:
            try:
                with open(self.token_file, 'r') as f:
                    access_token = f.read()
                    break
            except FileNotFoundError:
                self.setup()
                
        resp = requests.get('https://api.github.com/copilot_internal/v2/token', headers={
            'authorization': f'token {access_token}',
            'editor-version': 'Neovim/0.6.1',
            'editor-plugin-version': 'copilot.vim/1.16.0',
            'user-agent': 'GithubCopilot/1.155.0'
        })

        resp_json = resp.json()
        self.token = resp_json.get('token')

    async def chat(self, message):
        if self.token is None:
            self.get_token()

        if type(message) == str:
            self.messages.append({
                "content": str(message),
                "role": "user"
            })
        else:
            self.messages = message

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    'https://api.githubcopilot.com/chat/completions',
                    headers={
                        'authorization': f'Bearer {self.token}',
                        'Editor-Version': 'vscode/1.80.1',
                    },
                    json={
                        'intent': False,
                        'model': self.model,
                        'temperature': 0,
                        'top_p': 1,
                        'n': 1,
                        'stream': True,
                        'messages': self.messages
                    }
                ) as resp:
                    result = ''
                    async for line in resp.content:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: {'):
                            json_completion = json.loads(line_text[6:])
                            try:
                                completion = json_completion.get('choices')[0].get('delta').get('content')
                                if completion:
                                    result += completion
                                else:
                                    result += '\n'
                            except:
                                pass
                    
                    self.messages.append({
                        "content": result,
                        "role": "assistant"
                    })
                    
                    if result == '':
                        print(resp.status)
                        print(await resp.text())
                    return result
        except Exception as e:
            print(f"Error in chat: {e}")
            return ''

    def chat_sync(self, message):
        if self.token is None:
            self.get_token()

        if type(message) == str:
            self.messages.append({
                "content": str(message),
                "role": "user"
            })
        else:
            self.messages = message

        try:
            resp = requests.post('https://api.githubcopilot.com/chat/completions', headers={
                    'authorization': f'Bearer {self.token}',
                    'Editor-Version': 'vscode/1.80.1',
                }, json={
                    'intent': False,
                    'model': self.model,
                    'temperature': 0,
                    'top_p': 1,
                    'n': 1,
                    'stream': True,
                    'messages': self.messages
                })
        except requests.exceptions.ConnectionError:
            return ''

        result = ''

        resp_text = resp.text.split('\n')
        for line in resp_text:
            if line.startswith('data: {'):
                json_completion = json.loads(line[6:])
                try:
                    completion = json_completion.get('choices')[0].get('delta').get('content')
                    if completion:
                        result += completion
                    else:
                        result += '\n'
                except:
                    pass

        self.messages.append({
            "content": result,
            "role": "assistant"
        })
        
        if result == '':
            print(resp.status_code)
            print(resp.text)
        return result

    def get_models_list(self):
        return self.MODELS
    
    def set_model(self, model):
        if model in self.MODELS:
            self.model = model
            return True
        return False
    
    def clear_conversation(self):
        self.messages = []


def main():
    async def run_chat():
        chat_bot = GitHubCopilotChat()
        while True:
            user_input = input('>>> ')
            response = await chat_bot.chat(user_input)
            print(response)
    
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(run_chat())


if __name__ == '__main__':
    main()
