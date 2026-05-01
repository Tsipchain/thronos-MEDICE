# thronos-MEDICE

**ThronomedICE** — Decentralized child fever & vital signs monitoring, built on the Thronos blockchain.

## Architecture

```
[ESP32-S3 Wristband]
    │  BLE (every 5 min)
    ▼
[React Native App]  ──HTTPS──►  [FastAPI Service]  (3 Railway replicas)
                                      │
                    ┌─────────────────┼──────────────────────┐
                    ▼                 ▼                      ▼
              [Redis]         [TimescaleDB]        [Thronos Chain]
           (fever state)    (10-yr history)      (FeverHistory.sol)
                                      │
                                [Hospital API]  (guardian-controlled access)
```

## Components

| Path | Description |
|------|-------------|
| `main.py` | FastAPI app — readings, fever lifecycle, FCM alerts |
| `vital_analyzer.py` | Redis-backed temp + SpO2 + BPM state machine |
| `blockchain.py` | Web3 client for FeverHistory.sol |
| `hospital_api.py` | Hospital read access with guardian consent |
| `node_heartbeat.py` | On-chain node registration & reward claiming |
| `contracts/FeverHistory.sol` | Immutable fever records on Thronos |
| `contracts/NodeRewardPool.sol` | 5% block reward pool for nodes/ASICs |
| `firmware/` | ESP32-S3 Arduino firmware (MLX90614 + MAX30102) |
| `mobile/` | React Native app (BLE + FCM) |
| `nginx/` | Production load balancer config |

## Quick Start

```bash
cp .env.example .env
# fill in THRONOS_RPC_URL, MEDICE_PRIVATE_KEY, etc.
docker-compose up -d
```

## Production Deploy (Railway)

```bash
# Deploy contracts first
cd contracts && python deploy.py
# Set FEVER_CONTRACT_ADDRESS in Railway dashboard
# Push to main → Railway auto-deploys 3 replicas
```

## Reward Pool

MEDICE API replicas participate in the Thronos `NodeRewardPool` (5% of block rewards).
Run `node_heartbeat.py` on each replica to register, send heartbeats, and claim THR rewards.
