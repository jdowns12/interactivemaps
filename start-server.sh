#!/bin/bash
# WEP Venue Maps - Local Network Server
# This script starts a local web server accessible on your network

PORT=8080
DIR="$(cd "$(dirname "$0")" && pwd)"

# Get local IP address
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
else
    # Linux
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

echo "======================================"
echo "  WEP Venue Maps - Local Server"
echo "======================================"
echo ""
echo "Starting server on port $PORT..."
echo ""
echo "Access locally at:"
echo "  http://localhost:$PORT"
echo ""
if [ -n "$LOCAL_IP" ]; then
    echo "Access on network at:"
    echo "  http://$LOCAL_IP:$PORT"
fi
echo ""
echo "Press Ctrl+C to stop the server"
echo "======================================"
echo ""

# Try Python 3 first, fall back to Python 2
if command -v python3 &> /dev/null; then
    cd "$DIR" && python3 -m http.server $PORT --bind 0.0.0.0
elif command -v python &> /dev/null; then
    cd "$DIR" && python -m SimpleHTTPServer $PORT
else
    echo "Error: Python not found. Please install Python to run the server."
    exit 1
fi
