# Mobile Device Farm — Hub & Node Manager

Manages an [Appium Device Farm](https://devicefarm.org/remote-execution/) cluster
(hub + nodes) from a single `farm.json` configuration file.

---

## Quick start

### 1. Install Appium and the device-farm plugin

```bash
npm install -g appium
appium plugin install --source=npm appium-device-farm
```

### 2. Edit `farm.json`

```json
{
  "hub": {
    "host": "localhost",
    "port": 31337,
    "platform": "both"
  },
  "nodes": [
    {
      "id": "node-android-1",
      "host": "localhost",
      "port": 4723,
      "platform": "android",
      "enabled": true
    }
  ]
}
```

### 3. Start

| Goal | Command |
|------|---------|
| Start hub only | `./start-hub.sh` or `npm run hub` |
| Start one node | `./start-node.sh node-android-1` |
| Start everything | `./start-farm.sh` or `npm run farm` |
| List config | `npm run list` |
| Write config files only | `npm run generate` |

---

## How it works

```
farm.json
   │
   ├─► farm-manager.js generates configs/hub-config.json
   │                              configs/<node-id>-config.json
   │
   └─► spawns: appium server --use-plugins=device-farm --config <file>
```

- **Hub** — accepts WebDriver requests from your test runner and routes them to nodes.
  Dashboard at `http://<hub-host>:<hub-port>/device-farm`.
- **Node** — runs on each device host; points back at the hub via `"hub": "<url>"`.
  The hub auto-discovers all registered nodes.

---

## farm.json reference

### Hub fields

| Field | Default | Description |
|-------|---------|-------------|
| `host` | `localhost` | Hub hostname/IP |
| `port` | `31337` | Hub Appium port |
| `platform` | `"both"` | `"android"`, `"ios"`, or `"both"` |
| `keepAlive` | `800` | Keep-alive timeout (seconds) |
| `basePath` | `"/wd/hub"` | Appium base path |
| `logFile` | `"logs/hub.log"` | Log output file |

### Node fields

| Field | Default | Description |
|-------|---------|-------------|
| `id` | — | Unique node identifier |
| `host` | — | Node machine hostname/IP |
| `port` | — | Appium port on node machine |
| `platform` | — | `"android"` or `"ios"` |
| `enabled` | `true` | Set `false` to skip this node |
| `keepAlive` | `800` | Keep-alive timeout |
| `basePath` | `"/wd/hub"` | Appium base path |
| `logFile` | `"logs/<id>.log"` | Log output file |

---

## Adding a remote node

1. Add an entry to `farm.json` with the remote machine's IP:
   ```json
   {
     "id": "node-remote-1",
     "host": "192.168.1.100",
     "port": 4723,
     "platform": "android",
     "enabled": true
   }
   ```
2. On the remote machine, check out this repo and run:
   ```bash
   ./start-node.sh node-remote-1
   ```
   The generated config will point it at the hub automatically.

---

## Point your tests at the hub

```
http://<hub-host>:<hub-port>/wd/hub
```

Example capability:
```json
{
  "appium:automationName": "UiAutomator2",
  "platformName": "Android"
}
```
