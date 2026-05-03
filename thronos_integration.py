"""
Thronos v3.6 Integration Module for ThronomedICE

Bridges the medice monitoring service to the Thronos v3.6 blockchain:
  - Verifies the Thronos node is reachable and synced
  - Provides chain health info for dashboards
  - Exposes /thronos/* status endpoints
"""
import os
import logging
from typing import Optional
from datetime import datetime

from fastapi import APIRouter
from web3 import Web3
try:
    from web3.middleware import ExtraDataToPOAMiddleware as geth_poa_middleware
except ImportError:
    from web3.middleware import geth_poa_middleware

logger = logging.getLogger(__name__)

THRONOS_RPC_URL = os.getenv("THRONOS_RPC_URL", "http://localhost:8545")
PRIVATE_KEY     = os.getenv("MEDICE_PRIVATE_KEY", "")
THRONOS_APP_KEY = os.getenv("APP_AI_KEY", "")
THRONOS_ADMIN   = os.getenv("ADMIN_SECRET", "")

router = APIRouter(prefix="/thronos", tags=["thronos"])


def _rpc_headers() -> dict:
    """Build auth headers for the Thronos node."""
    h = {}
    if THRONOS_APP_KEY:
        h["Authorization"] = f"Bearer {THRONOS_APP_KEY}"
        h["X-API-Key"] = THRONOS_APP_KEY
    if THRONOS_ADMIN:
        h["X-Admin-Secret"] = THRONOS_ADMIN
    return h


class ThronomedICEChainInfo:
    def __init__(self):
        self.w3: Optional[Web3] = None
        self._init()

    def _init(self):
        try:
            headers = _rpc_headers()
            self.w3 = Web3(Web3.HTTPProvider(
                THRONOS_RPC_URL,
                request_kwargs={"timeout": 5, "headers": headers} if headers else {"timeout": 5},
            ))
            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
            if self.w3.is_connected():
                logger.info("Thronos v3.6 connected | chain_id=%s | block=%s",
                            self.w3.eth.chain_id, self.w3.eth.block_number)
            else:
                logger.warning("Thronos node not reachable at %s", THRONOS_RPC_URL)
        except Exception as exc:
            logger.error("ThronomedICEChainInfo init error: %s", exc)
            self.w3 = None

    @property
    def is_connected(self) -> bool:
        try:
            return self.w3 is not None and self.w3.is_connected()
        except Exception:
            return False

    def get_status(self) -> dict:
        if not self.is_connected:
            return {"connected": False, "rpc": THRONOS_RPC_URL}
        try:
            return {
                "connected":      True,
                "rpc":            THRONOS_RPC_URL,
                "chain_id":       self.w3.eth.chain_id,
                "latest_block":   self.w3.eth.block_number,
                "gas_price_gwei": round(self.w3.eth.gas_price / 1e9, 4),
            }
        except Exception as exc:
            return {"connected": False, "error": str(exc)}

    def get_service_wallet_info(self) -> dict:
        if not self.is_connected or not PRIVATE_KEY:
            return {"available": False}
        try:
            acct    = self.w3.eth.account.from_key(PRIVATE_KEY)
            balance = self.w3.eth.get_balance(acct.address)
            return {
                "available":     True,
                "address":       acct.address,
                "balance_ether": round(self.w3.from_wei(balance, "ether"), 6),
                "has_funds":     balance > 0,
            }
        except Exception as exc:
            return {"available": False, "error": str(exc)}


_chain_info = ThronomedICEChainInfo()


@router.get("/status")
def chain_status():
    return {
        "timestamp":      datetime.utcnow().isoformat(),
        "node":           _chain_info.get_status(),
        "service_wallet": _chain_info.get_service_wallet_info(),
    }


@router.get("/block/{number}")
def get_block(number: int):
    if not _chain_info.is_connected:
        return {"error": "not connected"}
    try:
        blk = _chain_info.w3.eth.get_block(number)
        return {
            "number":    blk.number,
            "hash":      blk.hash.hex(),
            "timestamp": datetime.fromtimestamp(blk.timestamp).isoformat(),
            "tx_count":  len(blk.transactions),
        }
    except Exception as exc:
        return {"error": str(exc)}
