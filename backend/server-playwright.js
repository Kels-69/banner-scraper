const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Store active scraping sessions
const sessions = new Map();

// Location mapping
const LOCATIONS = {
  1: 'US',
  2: 'UK',
  3: 'CA',
  4: 'AU',
  5: 'DE',
  6: 'FR',
  7: 'JP',
  8: 'BR',
  9: 'IN',
  10: 'SG'
};

/**
 * POST /api/scrape
 * Start a new scraping session
 * Body: { url, location (1-10), headless (true/false) }
 */
app.post('/api/scrape', async (req, res) => {
  const { url, location = 1, headless = true } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Validate location
  if (!LOCATIONS[location]) {
    return res.status(400).json({ error: 'Invalid location (must be 1-10)' });
  }

  const sessionId = Date.now().toString();
  const session = {
    id: sessionId,
    url,
    location: LOCATIONS[location],
    headless,
    status: 'running',
    progress: [],
    results: null,
    error: null,
    startTime: new Date()
  };

  sessions.set(sessionId, session);

  // Start Python scraper in background
  const pythonScript = path.join(__dirname, '../execution/scrape_api.py');
  const args = [
    pythonScript,
    '--url', url,
    '--location', location.toString(),
    '--headless', headless ? 'true' : 'false',
    '--json'
  ];

  console.log(`[${sessionId}] Starting scrape: ${url} (${LOCATIONS[location]})`);

  const pythonProcess = spawn('python', args, {
    cwd: path.join(__dirname, '..')
  });

  let outputBuffer = '';
  let errorBuffer = '';

  pythonProcess.stdout.on('data', (data) => {
    const output = data.toString();
    outputBuffer += output;

    // Parse progress updates (lines starting with [*], [+], [-])
    const lines = output.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      if (line.match(/^\[[\*\+\-]\]/)) {
        session.progress.push({
          timestamp: new Date(),
          message: line
        });
      }
    });
  });

  pythonProcess.stderr.on('data', (data) => {
    errorBuffer += data.toString();
    console.error(`[${sessionId}] Error: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[${sessionId}] Process closed with code ${code}`);

    if (code === 0) {
      try {
        // Find the JSON output (last occurrence of valid JSON object)
        const lines = outputBuffer.split('\n');
        let jsonStr = null;

        // Look for JSON starting from the end (most recent output)
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{')) {
            // Try to parse from this line onwards
            const remainingLines = lines.slice(i).join('\n');
            try {
              const parsed = JSON.parse(remainingLines);
              if (parsed.homepage !== undefined) {
                jsonStr = remainingLines;
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }

        if (jsonStr) {
          session.results = JSON.parse(jsonStr);
          session.status = 'completed';
          console.log(`[${sessionId}] Completed: ${session.results.homepage?.length || 0} homepage + ${session.results.promotions?.length || 0} promo banners`);
        } else {
          session.status = 'error';
          session.error = 'No valid JSON results found in output';
          console.error(`[${sessionId}] Output: ${outputBuffer.substring(0, 500)}`);
        }
      } catch (err) {
        session.status = 'error';
        session.error = 'Failed to parse results: ' + err.message;
        console.error(`[${sessionId}] Parse error:`, err);
      }
    } else {
      session.status = 'error';
      session.error = errorBuffer || `Python script exited with code ${code}`;
      console.error(`[${sessionId}] Failed with code ${code}`);
      console.error(`[${sessionId}] Error output: ${errorBuffer}`);
    }
  });

  // Return session ID immediately
  res.json({
    success: true,
    sessionId,
    message: 'Scraping started'
  });
});

/**
 * GET /api/scrape/:sessionId
 * Get status and results of a scraping session
 */
app.get('/api/scrape/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    id: session.id,
    url: session.url,
    location: session.location,
    status: session.status,
    progress: session.progress,
    results: session.results,
    error: session.error,
    duration: session.status === 'completed'
      ? new Date() - session.startTime
      : null
  });
});

/**
 * GET /api/locations
 * Get available location options
 */
app.get('/api/locations', (req, res) => {
  res.json(Object.entries(LOCATIONS).map(([id, code]) => ({
    id: parseInt(id),
    code,
    name: getLocationName(code)
  })));
});

function getLocationName(code) {
  const names = {
    'US': 'United States',
    'UK': 'United Kingdom',
    'CA': 'Canada',
    'AU': 'Australia',
    'DE': 'Germany',
    'FR': 'France',
    'JP': 'Japan',
    'BR': 'Brazil',
    'IN': 'India',
    'SG': 'Singapore'
  };
  return names[code] || code;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    timestamp: new Date()
  });
});

// Serve frontend (use v2 by default)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index-v2.html'));
});

app.listen(PORT, () => {
  console.log(`✓ Banner Scraper API running on http://localhost:${PORT}`);
  console.log(`✓ Frontend available at http://localhost:${PORT}`);
  console.log(`✓ Using Playwright stealth scraper with Oxylabs proxy`);
});
