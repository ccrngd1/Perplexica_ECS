#!/bin/sh

#keep container running for debugging
#sleep infinity

npm i
npm install -g next

#next start -p 80

#echo "start sleep command"

# Enable full stack traces and detailed error reporting
export NODE_OPTIONS="--enable-source-maps --trace-warnings --trace-uncaught"

# Start the server with better error output
node server.js