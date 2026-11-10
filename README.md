# Mobile Device Farm — Hub & Node Manager

Manages an [Appium Device Farm](https://devicefarm.org/remote-execution/) cluster
(hub + nodes) from a single `farm.json` configuration file.

---

## Setup overview

```
Hub machine (172.16.3.33)          Node machine (172.16.2.69)
─────────────────────────          ──────────────────────────
./start-hub.sh                     ./start-node.sh  (or npm run node)
      │                                    │
      │  ◄── node registers itself ────────┘
      │
dashboard: http://172.16.3.33:31337/device-farm
```

---

## Prerequisites

Install on **both** machines:

```bash
npm install -g appium
appium plugin install --source=npm appium-device-farm
```

Install go-ios for iOS support on **both** machines:

```bash
npm install -g go-ios
```

---

## Step 1 — Configure farm.json

Edit `farm.json` with your actual IPs and credentials:

```json
{
  "hub": {
    "id": "hub",
    "host": "172.16.3.33",
    "port": 31337,
    "platform": "both",
    "enableAuthentication": true,
    "logFile": "logs/hub.log",
    "keepAlive": 800,
    "basePath": "/wd/hub"
  },
  "nodes": [
    {
      "id": "node-1",
      "host": "172.16.2.69",
      "port": 4723,
      "platform": "both",
      "apiKey": "<access-key-from-hub-dashboard>",
      "token": "<token-from-hub-dashboard>",
      "wdaPath": "/Users/<username>/Desktop/MobileDeviceFarm/wda/wda-resign.ipa",
      "logFile": "logs/node-1.log",
      "keepAlive": 800,
      "basePath": "/wd/hub",
      "enabled": true
    }
  ]
}
```

> `farm.json` is the only file you edit. Never edit files inside `configs/` — they are auto-generated.

---

## Step 2 — iOS device setup (node machine only)

> Skip this section if you are using Android devices only.

### 2a. Start the go-ios tunnel (iOS 17+ required)

Open a **dedicated terminal** on the node machine and keep it running:

```bash
sudo ios tunnel start
```

For userspace mode (no sudo):
```bash
ENABLE_GO_IOS_AGENT=user ios tunnel start
```

### 2b. Install the signed WDA on the iPhone

Place your `wda-resign.ipa` in the `wda/` folder of this project, then install it on the device:

```bash
ios install \
  --path=/Users/shivak/Desktop/MobileDeviceFarm/wda/wda-resign.ipa \
  --udid=<your-device-udid>
```

Find the UDID with:
```bash
ios list
```

Verify WDA is installed:
```bash
ios apps --udid=<your-device-udid> | grep wda
```

---

## Step 3 — Copy project to hub machine

Run this from the node machine to sync the project:

```bash
rsync -av --exclude='configs/' --exclude='logs/' \
  /Users/shivak/Desktop/MobileDeviceFarm/ \
  shivak@172.16.3.33:/Users/shivak/Desktop/MobileDeviceFarm/
```

---

## Step 4 — Start the hub (hub machine)

SSH into the hub machine and start it:

```bash
ssh shivak@172.16.3.33 \
  "cd /Users/shivak/Desktop/MobileDeviceFarm && ./start-hub.sh"
```

Hub dashboard → `http://172.16.3.33:31337/device-farm`

### Get API key and token from the hub dashboard

1. Open `http://172.16.3.33:31337/device-farm` in a browser
2. Log in (default: `admin` / `admin` — **change this immediately**)
3. Click your profile name in the header
4. Go to **API Tokens** tab → click **Generate Token**
5. Copy the **Access Key** and **Token**
6. Paste them into `farm.json` under the node's `apiKey` and `token` fields

---

## Step 5 — Start the node (node machine)

```bash
npm run node
```

Or with explicit node id:
```bash
./start-node.sh node-1
```

The node will:
1. Free port 4723 if a stale process is holding it
2. Wait until the hub at `172.16.3.33:31337` is reachable
3. Start Appium, authenticate with the hub, and register all connected devices

---

## All commands

| Goal | Command |
|------|---------|
| Start hub | `./start-hub.sh` or `npm run hub` |
| Start node | `npm run node` or `./start-node.sh node-1` |
| Start hub + all nodes | `./start-farm.sh` or `npm run farm` |
| List config | `npm run list` |
| Regenerate config files only | `npm run generate` |

---

## How it works

```
farm.json
   │
   ├─► farm-manager.js generates configs/hub-config.json
   │                              configs/node-1-config.json
   │
   └─► spawns: appium server --use-plugins=device-farm --config <file>
                              [--plugin-device-farm-access-key=...]
                              [--plugin-device-farm-token=...]
                              [--plugin-device-farm-pre-build-wda-path=...]
```

- **Hub** — accepts WebDriver requests from your test runner and routes them to nodes.
- **Node** — detects all connected Android/iOS devices, registers them with the hub every 30s.
- **farm.json** — single source of truth. Change IPs, ports, credentials here only.

---

## farm.json reference

### Hub fields

| Field | Default | Description |
|-------|---------|-------------|
| `host` | — | Hub machine IP or hostname |
| `port` | `31337` | Appium port |
| `platform` | `"both"` | `"android"`, `"ios"`, or `"both"` |
| `enableAuthentication` | `false` | Enable hub authentication |
| `keepAlive` | `800` | Keep-alive timeout (seconds) |
| `basePath` | `"/wd/hub"` | Appium base path |
| `logFile` | `"logs/hub.log"` | Log file path |

### Node fields

| Field | Default | Description |
|-------|---------|-------------|
| `id` | — | Unique identifier |
| `host` | — | Node machine IP |
| `port` | `4723` | Appium port |
| `platform` | `"both"` | `"android"`, `"ios"`, or `"both"` |
| `apiKey` | — | Access key from hub dashboard (required when auth enabled) |
| `token` | — | Token from hub dashboard (required when auth enabled) |
| `wdaPath` | — | Absolute path to `wda-resign.ipa` on the node machine |
| `enabled` | `true` | Set `false` to skip this node |
| `keepAlive` | `800` | Keep-alive timeout |
| `basePath` | `"/wd/hub"` | Appium base path |
| `logFile` | `"logs/<id>.log"` | Log file path |

---

## Adding more node machines

1. Add an entry in `farm.json`:
   ```json
   {
     "id": "node-2",
     "host": "192.168.1.101",
     "port": 4723,
     "platform": "both",
     "apiKey": "<access-key>",
     "token": "<token>",
     "enabled": true
   }
   ```
2. Copy the project to that machine:
   ```bash
   rsync -av --exclude='configs/' --exclude='logs/' \
     /Users/shivak/Desktop/MobileDeviceFarm/ \
     user@192.168.1.101:/Users/user/Desktop/MobileDeviceFarm/
   ```
3. On that machine, run: `npm run node`

---

## Point your tests at the hub

```
http://172.16.3.33:31337/wd/hub
```

Example capabilities:

**Android**
```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "df:accesskey": "<access-key>",
  "df:token": "<token>"
}
```

**iOS**
```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "df:accesskey": "<access-key>",
  "df:token": "<token>"
}
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ECONNREFUSED 172.16.3.33:31337` | Hub not running | Start hub first: `./start-hub.sh` |
| `EADDRINUSE 0.0.0.0:4723` | Stale Appium on port | farm-manager auto-kills it on next start |
| `401 Unauthorized` | Missing or wrong API key/token | Re-generate token from hub dashboard |
| `ADDITIONAL PROPERTY not expected` | Property only valid as CLI arg | Update `farm.json` only, not `configs/` files |
| `Did not find test app for WDA` | WDA not installed on iPhone | Run `ios install --path=wda-resign.ipa --udid=<udid>` |
| `go-ios agent is not running` | iOS tunnel not started | Run `sudo ios tunnel start` in a separate terminal |
| `connect ECONNREFUSED <node-ip>:5xxxx` | WDA not responding | Install WDA on device and start tunnel |
