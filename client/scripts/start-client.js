const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function killProcessOnPort(port) {
  try {
    // For macOS/Linux
    const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN | awk '{print $2}'`);
    if (stdout.trim()) {
      console.log(`Found process using port ${port}, killing it...`);
      await execAsync(`kill -9 ${stdout.trim()}`);
      console.log('Process killed successfully');
    }
  } catch (error) {
    // If no process is found, that's fine
    console.log(`No process found on port ${port}`);
  }
}

async function startClient() {
  const port = process.env.PORT || 3000;
  
  try {
    // Kill any existing process on the port
    await killProcessOnPort(port);
    
    // Start the client
    console.log(`Starting client on port ${port}...`);
    require('react-scripts/scripts/start');
  } catch (error) {
    console.error('Error starting client:', error);
    process.exit(1);
  }
}

startClient(); 