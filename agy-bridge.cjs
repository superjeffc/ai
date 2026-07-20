const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.PORT || 8000;
const HOST = '127.0.0.1';
const SECRET_TOKEN = process.env.API_SECRET || '';
const AGY_PATH = '/home/superjeffreyc_cs/.local/bin/agy';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/execute') {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${SECRET_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { systemPrompt, userPrompt } = data;
        
        if (!userPrompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing userPrompt' }));
          return;
        }

        // Construct combined prompt
        let combinedPrompt = '';
        if (systemPrompt) {
          combinedPrompt += `System Instructions:\n${systemPrompt}\n\n`;
        }
        combinedPrompt += `User Input:\n${userPrompt}`;

        // Set response headers to support chunked streaming
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked'
        });

        // Create temporary directory for sandbox
        let tempDir = null;
        try {
          tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-sandbox-'));
        } catch (dirErr) {
          console.error('Failed to create temporary directory for sandbox:', dirErr);
        }

        // Create temporary secure HOME profile to prevent non-workspace file access
        let secureHome = null;
        try {
          secureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-home-'));
          const secureConfigDir = path.join(secureHome, '.gemini', 'antigravity-cli');
          fs.mkdirSync(secureConfigDir, { recursive: true });

          const realConfigDir = '/home/superjeffreyc_cs/.gemini/antigravity-cli';
          
          // Copy or symlink credentials and installation ID
          try {
            fs.symlinkSync(
              path.join(realConfigDir, 'antigravity-oauth-token'),
              path.join(secureConfigDir, 'antigravity-oauth-token')
            );
          } catch (err) {
            fs.copyFileSync(
              path.join(realConfigDir, 'antigravity-oauth-token'),
              path.join(secureConfigDir, 'antigravity-oauth-token')
            );
          }

          try {
            fs.symlinkSync(
              path.join(realConfigDir, 'installation_id'),
              path.join(secureConfigDir, 'installation_id')
            );
          } catch (err) {
            fs.copyFileSync(
              path.join(realConfigDir, 'installation_id'),
              path.join(secureConfigDir, 'installation_id')
            );
          }

          // Write settings.json forcing allowNonWorkspaceAccess to false
          fs.writeFileSync(
            path.join(secureConfigDir, 'settings.json'),
            JSON.stringify({ allowNonWorkspaceAccess: false })
          );
        } catch (homeErr) {
          console.error('Failed to initialize secure HOME profile:', homeErr);
        }

        const cleanup = () => {
          if (tempDir) {
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
              console.log(`Cleaned up sandbox directory: ${tempDir}`);
              tempDir = null;
            } catch (rmErr) {
              console.error(`Failed to clean up sandbox directory ${tempDir}:`, rmErr);
            }
          }
          if (secureHome) {
            try {
              fs.rmSync(secureHome, { recursive: true, force: true });
              console.log(`Cleaned up secure home directory: ${secureHome}`);
              secureHome = null;
            } catch (rmErr) {
              console.error(`Failed to clean up secure home directory ${secureHome}:`, rmErr);
            }
          }
        };

        // Fail closed: reject request if the secure sandboxed environment could not be fully initialized
        if (!tempDir || !secureHome) {
          console.error('Failed to initialize secure execution environment (tempDir or secureHome is missing).');
          res.write('[Error: Failed to initialize secure execution environment]');
          cleanup();
          res.end();
          return;
        }

        try {
          // Spawn agy process with sandbox flag, set CWD to empty directory, and override HOME
          console.log(`Executing AGY command for request...`);
          const agyArgs = ['--sandbox', '--print', combinedPrompt];
          const spawnOptions = {
            cwd: tempDir,
            env: {
              ...process.env,
              HOME: secureHome
            }
          };
          const agy = spawn(AGY_PATH, agyArgs, spawnOptions);

          agy.stdout.on('data', (chunk) => {
            res.write(chunk);
          });

          agy.stderr.on('data', (chunk) => {
            console.error(`agy stderr: ${chunk}`);
          });

          agy.on('close', (code) => {
            console.log(`agy process completed with code ${code}`);
            cleanup();
            res.end();
          });

          agy.on('error', (err) => {
            console.error('Failed to start agy process:', err);
            res.write(`\n[Error: Failed to execute agy CLI: ${err.message}]`);
            cleanup();
            res.end();
          });
        } catch (spawnErr) {
          console.error('Synchronous error spawning agy process:', spawnErr);
          res.write(`\n[Error: Failed to spawn agy CLI: ${spawnErr.message}]`);
          cleanup();
          res.end();
        }

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Bridge server listening on http://${HOST}:${PORT}`);
});
