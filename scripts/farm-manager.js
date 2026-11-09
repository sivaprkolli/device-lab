#!/usr/bin/env node
/**
 * farm-manager.js
 * Reads farm.json and starts hub, a specific node, or the full farm.
 *
 * Usage:
 *   node scripts/farm-manager.js hub               — start hub
 *   node scripts/farm-manager.js node <node-id>    — start one node
 *   node scripts/farm-manager.js all               — start hub + all enabled nodes
 *   node scripts/farm-manager.js list              — list all hub/node configs
 *   node scripts/farm-manager.js generate          — write Appium config files only
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

// ── Resolve paths relative to the project root (one level up from scripts/) ──
const ROOT        = path.resolve(__dirname, '..');
const FARM_CONFIG = path.join(ROOT, 'farm.json');
const CONFIGS_DIR = path.join(ROOT, 'configs');
const LOGS_DIR    = path.join(ROOT, 'logs');

// ── Load & validate farm.json ────────────────────────────────────────────────
function loadFarm() {
  if (!fs.existsSync(FARM_CONFIG)) {
    die(`farm.json not found at ${FARM_CONFIG}`);
  }
  let farm;
  try {
    farm = JSON.parse(fs.readFileSync(FARM_CONFIG, 'utf8'));
  } catch (e) {
    die(`Failed to parse farm.json: ${e.message}`);
  }
  if (!farm.hub)   die('farm.json is missing a "hub" section.');
  if (!farm.nodes) die('farm.json is missing a "nodes" section.');
  return farm;
}

// ── Config file generators ───────────────────────────────────────────────────

/**
 * Build the Appium JSON config object for the hub.
 *
 * Equivalent CLI: appium server -ka 800 --use-plugins=device-farm
 *                   -pa /wd/hub --plugin-device-farm-platform=both
 *                   [--plugin-device-farm-enable-authentication]
 */
function buildHubConfig(hub) {
  return {
    server: {
      port: hub.port,
      'base-path': hub.basePath || '/wd/hub',
      'keep-alive-timeout': hub.keepAlive || 800,
      plugin: {
        'device-farm': {
          platform: hub.platform || 'both'
        }
      }
    }
  };
}

/**
 * Build the Appium JSON config object for a node.
 * Points back at the hub's host:port so the node self-registers on startup.
 *
 * Equivalent CLI: appium server -ka 800 --use-plugins=device-farm
 *                   -pa /wd/hub --plugin-device-farm-platform=android
 *                   --plugin-device-farm-hub=http://<hub-host>:<hub-port>
 */
function buildNodeConfig(node, hub) {
  const hubUrl = `http://${hub.host}:${hub.port}`;
  const deviceFarm = {
    platform: node.platform,
    hub: hubUrl
  };

  // Point xcuitest driver at the pre-signed WDA on this machine
  if (node.wdaPath) {
    deviceFarm['pre-build-wda-path'] = node.wdaPath;
  }

  return {
    server: {
      port: node.port,
      'base-path': node.basePath || '/wd/hub',
      'keep-alive-timeout': node.keepAlive || 800,
      plugin: {
        'device-farm': deviceFarm
      }
    }
  };
}

/**
 * Write a JSON config to configs/<id>-config.json and return the file path.
 */
function writeConfig(id, configObj) {
  fs.mkdirSync(CONFIGS_DIR, { recursive: true });
  const filePath = path.join(CONFIGS_DIR, `${id}-config.json`);
  fs.writeFileSync(filePath, JSON.stringify(configObj, null, 2) + '\n');
  return filePath;
}

// ── Appium launcher ──────────────────────────────────────────────────────────

/**
 * Spawn `appium server` with the device-farm plugin and a generated config.
 * Logs are written to the log file defined in farm.json; stdout is also piped
 * to the terminal when running in foreground (single-role) mode.
 *
 * Returns the child process.
 */
function startAppium(role, configFile, logFile, extraArgs = []) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const absLogFile  = path.join(ROOT, logFile);
  const absConfig   = configFile;
  const logStream   = fs.createWriteStream(absLogFile, { flags: 'a' });

  // base-path, port, platform, hub are all in the config file.
  // extraArgs handles CLI-only flags like --plugin-device-farm-enable-authentication
  const args = [
    'server',
    '--keep-alive-timeout', '800',
    '--use-plugins=device-farm',
    '--config', absConfig,
    ...extraArgs
  ];

  log(`[${role}] Starting: appium ${args.join(' ')}`);
  log(`[${role}] Log file: ${absLogFile}`);

  const child = spawn('appium', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  // Tee output to log file + stdout
  const prefix = `[${role}] `;
  child.stdout.on('data', (d) => {
    const lines = d.toString().split('\n');
    lines.forEach(line => {
      if (line) {
        process.stdout.write(prefix + line + '\n');
        logStream.write(line + '\n');
      }
    });
  });
  child.stderr.on('data', (d) => {
    const lines = d.toString().split('\n');
    lines.forEach(line => {
      if (line) {
        process.stderr.write(prefix + line + '\n');
        logStream.write('[ERR] ' + line + '\n');
      }
    });
  });

  child.on('close', (code) => {
    log(`[${role}] Appium exited with code ${code}`);
    logStream.end();
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      die(`"appium" command not found. Install it with: npm install -g appium`);
    }
    die(`[${role}] Failed to start: ${err.message}`);
  });

  return child;
}

// ── Actions ──────────────────────────────────────────────────────────────────

function actionList(farm) {
  console.log('\n=== Hub ===');
  console.log(`  id       : ${farm.hub.id}`);
  console.log(`  host     : ${farm.hub.host}`);
  console.log(`  port     : ${farm.hub.port}`);
  console.log(`  platform : ${farm.hub.platform}`);
  console.log(`  dashboard: http://${farm.hub.host}:${farm.hub.port}/device-farm`);

  console.log('\n=== Nodes ===');
  farm.nodes.forEach(n => {
    const status = n.enabled === false ? '(disabled)' : '(enabled)';
    console.log(`  [${n.id}] ${status}`);
    console.log(`    host     : ${n.host}`);
    console.log(`    port     : ${n.port}`);
    console.log(`    platform : ${n.platform}`);
    if (n.comment) console.log(`    note     : ${n.comment}`);
  });
  console.log('');
}

function actionGenerate(farm) {
  // Hub config
  const hubCfgObj  = buildHubConfig(farm.hub);
  const hubCfgFile = writeConfig(farm.hub.id || 'hub', hubCfgObj);
  log(`Generated hub config  → ${hubCfgFile}`);

  // Node configs
  farm.nodes.forEach(node => {
    const nodeCfgObj  = buildNodeConfig(node, farm.hub);
    const nodeCfgFile = writeConfig(node.id, nodeCfgObj);
    log(`Generated node config → ${nodeCfgFile}  [${node.id}]`);
  });
}

function actionHub(farm) {
  const hubCfgObj  = buildHubConfig(farm.hub);
  const hubCfgFile = writeConfig(farm.hub.id || 'hub', hubCfgObj);
  log(`Hub config written → ${hubCfgFile}`);

  freePort(farm.hub.port).then(() => {
    const extraArgs = farm.hub.enableAuthentication
      ? ['--plugin-device-farm-enable-authentication']
      : [];
    const child = startAppium(
      'hub',
      hubCfgFile,
      farm.hub.logFile || 'logs/hub.log',
      extraArgs
    );
    log(`Hub started (PID ${child.pid}). Dashboard → http://${farm.hub.host}:${farm.hub.port}/device-farm`);
    handleSignals([child]);
  });
}

function actionNode(farm, nodeId) {
  let node;

  if (!nodeId) {
    // Auto-select the first enabled node when only one exists
    const enabled = farm.nodes.filter(n => n.enabled !== false);
    if (enabled.length === 0) {
      die('No enabled nodes found in farm.json.');
    }
    if (enabled.length > 1) {
      die(`Multiple nodes found — specify one:\n${enabled.map(n => `  ./start-node.sh ${n.id}`).join('\n')}`);
    }
    node = enabled[0];
    log(`Auto-selected node "${node.id}"`);
  } else {
    node = farm.nodes.find(n => n.id === nodeId);
    if (!node) die(`Node "${nodeId}" not found in farm.json. Run "list" to see available nodes.`);
    if (node.enabled === false) {
      die(`Node "${nodeId}" is disabled in farm.json. Set "enabled": true to use it.`);
    }
  }

  const nodeCfgObj  = buildNodeConfig(node, farm.hub);
  const nodeCfgFile = writeConfig(node.id, nodeCfgObj);
  log(`Node config written → ${nodeCfgFile}`);

  const extraArgs = [];
  if (node.apiKey) extraArgs.push(`--plugin-device-farm-access-key=${node.apiKey}`);
  if (node.token)  extraArgs.push(`--plugin-device-farm-token=${node.token}`);

  freePort(node.port)
    .then(() => waitForHub(farm.hub))
    .then(() => {
      const child = startAppium(
        node.id,
        nodeCfgFile,
        node.logFile || `logs/${node.id}.log`,
        extraArgs
      );
      log(`Node "${node.id}" started (PID ${child.pid}). Registered hub → http://${farm.hub.host}:${farm.hub.port}`);
      handleSignals([child]);
    })
    .catch(die);
}

function actionAll(farm) {
  const children = [];

  // Start hub
  const hubCfgObj  = buildHubConfig(farm.hub);
  const hubCfgFile = writeConfig(farm.hub.id || 'hub', hubCfgObj);
  log(`Hub config written → ${hubCfgFile}`);
  const hubChild = startAppium(
    'hub',
    hubCfgFile,
    farm.hub.logFile || 'logs/hub.log'
  );
  log(`Hub started (PID ${hubChild.pid}). Dashboard → http://${farm.hub.host}:${farm.hub.port}/device-farm`);
  children.push(hubChild);

  const enabledNodes = farm.nodes.filter(n => n.enabled !== false);
  if (enabledNodes.length === 0) {
    log('No enabled nodes found in farm.json.');
    handleSignals(children);
    return;
  }

  // Wait for hub to be reachable before spawning nodes
  waitForHub(farm.hub).then(() => {
    process.stdout.write('\n'); // newline after the "retrying…" progress line
    const portFrees = enabledNodes.map(node => freePort(node.port));
    Promise.all(portFrees).then(() => {
      enabledNodes.forEach(node => {
        const nodeCfgObj  = buildNodeConfig(node, farm.hub);
        const nodeCfgFile = writeConfig(node.id, nodeCfgObj);
        log(`Node config written → ${nodeCfgFile}`);
        const nodeChild = startAppium(
          node.id,
          nodeCfgFile,
          node.logFile || `logs/${node.id}.log`
        );
        log(`Node "${node.id}" started (PID ${nodeChild.pid})`);
        children.push(nodeChild);
      });
      handleSignals(children);
    });
  }).catch(die);
}

// ── Port cleanup ─────────────────────────────────────────────────────────────

/**
 * Check if a port is in use and kill the occupying process if so.
 * Uses `lsof` (available on macOS/Linux).
 */
function freePort(port) {
  return new Promise((resolve) => {
    const lsof = spawn('lsof', ['-ti', `:${port}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let pids = '';
    lsof.stdout.on('data', d => { pids += d.toString(); });
    lsof.on('close', () => {
      const pidList = pids.trim().split('\n').filter(Boolean);
      if (pidList.length === 0) {
        resolve(); // port already free
        return;
      }
      log(`Port ${port} is in use by PID(s) ${pidList.join(', ')} — killing…`);
      const kill = spawn('kill', ['-9', ...pidList], { stdio: 'ignore' });
      kill.on('close', () => {
        // Give the OS a moment to release the port
        setTimeout(resolve, 500);
      });
    });
  });
}

// ── Hub health-check ─────────────────────────────────────────────────────────

/**
 * Poll the hub's /device-farm endpoint until it responds with HTTP 200
 * (or any non-connection-refused response), then resolve.
 * Rejects after `maxWaitMs` milliseconds.
 */
function waitForHub(hub, { intervalMs = 2000, maxWaitMs = 120000 } = {}) {
  const url      = `http://${hub.host}:${hub.port}/device-farm`;
  const protocol = hub.port === 443 ? https : http;
  const deadline = Date.now() + maxWaitMs;
  let   attempt  = 0;

  log(`Waiting for hub to be ready at ${url} …`);

  return new Promise((resolve, reject) => {
    function probe() {
      attempt++;
      const req = protocol.get(url, { timeout: 3000 }, (res) => {
        res.resume(); // drain the response
        log(`Hub is up! (HTTP ${res.statusCode} after ${attempt} attempt(s))`);
        resolve();
      });

      req.on('error', (err) => {
        if (Date.now() >= deadline) {
          reject(new Error(`Hub at ${url} did not become ready within ${maxWaitMs / 1000}s. Last error: ${err.message}`));
          return;
        }
        process.stdout.write(`\r[farm-manager] Hub not ready yet (attempt ${attempt}) — retrying in ${intervalMs / 1000}s…  `);
        setTimeout(probe, intervalMs);
      });

      req.on('timeout', () => {
        req.destroy();
      });
    }
    probe();
  });
}

// ── Utilities ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[farm-manager] ${msg}`);
}

function die(msg) {
  console.error(`\n[farm-manager] ERROR: ${msg}\n`);
  process.exit(1);
}

/** Gracefully stop all child processes on Ctrl-C / SIGTERM. */
function handleSignals(children) {
  const shutdown = (signal) => {
    log(`Received ${signal}. Stopping all processes…`);
    children.forEach(c => {
      try { c.kill('SIGTERM'); } catch (_) { /* already dead */ }
    });
    process.exit(0);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ── Entry point ──────────────────────────────────────────────────────────────

const [,, action, ...rest] = process.argv;

if (!action) {
  console.log(`
Usage:
  node scripts/farm-manager.js hub               Start the hub
  node scripts/farm-manager.js node <node-id>    Start a specific node
  node scripts/farm-manager.js all               Start hub + all enabled nodes
  node scripts/farm-manager.js list              List hub/node configuration
  node scripts/farm-manager.js generate          Write Appium config files only
`);
  process.exit(0);
}

const farm = loadFarm();

switch (action) {
  case 'list':     actionList(farm);             break;
  case 'generate': actionGenerate(farm);         break;
  case 'hub':      actionHub(farm);              break;
  case 'node':     actionNode(farm, rest[0]);    break;
  case 'all':      actionAll(farm);              break;
  default:
    die(`Unknown action "${action}". Run without arguments to see usage.`);
}
