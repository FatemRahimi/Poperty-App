#!/bin/bash

# Kill any process using port 5050
echo "Checking for processes using port 5050..."
lsof -ti:5050 | xargs kill -9 2>/dev/null
 
# Start the server
echo "Starting server..."
npm start 