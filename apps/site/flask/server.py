from flask import Flask, request
from flask_socketio import SocketIO, emit
import logging
import os

# Custom imports
from src import llm
from src import crypto

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Store client session data
client_sessions = {}

# Generate Server ECC Key Pair
server_private_key = crypto.generate_ecc_key()
server_public_key = server_private_key.public_key()

# Export the public key in raw format
server_public_key_bytes = crypto.export_public_key(server_public_key)

@socketio.on("connect")
def handle_connect():
    logger.info(f"Client connected: {request.sid}")
    client_sessions[request.sid] = {"shared_key": None}

@socketio.on("disconnect")
def handle_disconnect():
    logger.info(f"Client disconnected: {request.sid}")
    if request.sid in client_sessions:
        del client_sessions[request.sid]

@socketio.on("exchange_keys")
def exchange_keys(client_public_key_hex):
    """Handles public key exchange over WebSocket"""
    try:
        logger.info(f"Received client public key: {client_public_key_hex[:20]}...")
        
        # Import client public key
        client_public_key = crypto.import_public_key(bytes.fromhex(client_public_key_hex))
        
        # Compute shared secret
        derived_key = crypto.compute_shared_secret(server_private_key, client_public_key)
        
        # Store the shared key in the client's session
        client_sessions[request.sid]["shared_key"] = derived_key
        
        # Send server public key to client
        logger.info("Sending server public key to client")
        emit("server_public_key", server_public_key_bytes.hex())
        
    except Exception as e:
        logger.error(f"Error in key exchange: {str(e)}")
        emit("error", {"message": "Key exchange failed"})

@socketio.on("encrypt_message")
def encrypt_message(data):
    """Encrypts messages sent by clients"""
    try:
        logger.info("Received encrypt_message request")
        plaintext = data["message"]
        shared_key = bytes.fromhex(data["shared_key"])
        
        # Encrypt using the crypto module
        iv, tag, ciphertext = crypto.encrypt_message(shared_key, plaintext)
        
        logger.info("Message encrypted successfully")
        
        # Send the encrypted message back to the client
        result = {
            "iv": iv.hex(),
            "ciphertext": ciphertext.hex(), 
            "tag": tag.hex()
        }
        emit("encrypted_message", result)
        
    except Exception as e:
        logger.error(f"Error encrypting message: {str(e)}")
        emit("error", {"message": f"Encryption failed: {str(e)}"})

@socketio.on("decrypt_message")
def decrypt_message(data):
    """Decrypts messages for clients"""
    try:
        shared_key = bytes.fromhex(data["shared_key"])
        iv = bytes.fromhex(data["iv"])
        ciphertext = bytes.fromhex(data["ciphertext"])
        tag = bytes.fromhex(data["tag"])
        
        # Decrypt using the crypto module
        decrypted_message = crypto.decrypt_message(shared_key, iv, tag, ciphertext)
        
        emit("decrypted_message", {"text": llm.get_chat_response(decrypted_message.decode())})
        
    except Exception as e:
        logger.error(f"Error decrypting message: {str(e)}")
        emit("error", {"message": f"Decryption failed: {str(e)}"})

if __name__ == "__main__":
    logger.info("Starting ECDH server on port 5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
