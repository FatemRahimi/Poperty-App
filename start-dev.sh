#!/bin/bash

# Kill any processes using ports 3000 and 5050
echo "Checking for processes using ports 3000 and 5050..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5050 | xargs kill -9 2>/dev/null

# Start both client and server
echo "Starting development environment..."
concurrently "cd server && npm start" "cd client && npm start" 