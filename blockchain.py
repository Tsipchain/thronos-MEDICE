import hashlib
import json
import logging
import os
from datetime import datetime
from typing import Optional
from urllib import request, error

logger = logging.getLogger(__name__)

THRONOS_CHAIN_MODE = os.getenv("THRONOS_CHAIN_MODE", "thronos_native").strip().lower()
THRONOS_NATIVE_API_URL = os.getenv("THRONOS_NATIVE_API_URL", "https://api.thronoschain.org")
THRONOS_ANCHOR_PATH = os.getenv("THRONOS_ANCHOR_PATH", "/medice/events")
THRONOS_NATIVE_NODE_ID = os.getenv("THRONOS_NATIVE_NODE_ID", "medice-node")
THRONOS_NATIVE_API_KEY = os.getenv("THRONOS_NATIVE_API_KEY", "")

THRONOS_RPC_URL = os.getenv("THRONOS_RPC_URL", "")
PRIVATE_KEY = os.getenv("MEDICE_PRIVATE_KEY", "")
CONTRACT_ADDRESS = os.getenv("FEVER_CONTRACT_ADDRESS", "")

OFFLINE_QUEUE_FILE = "/medice/offline_anchor_queue.jsonl"

FEVER_ABI = json.loads('['
    '{"inputs":[{"internalType":"string","name":"_patientId","type":"string"},{"internalType":"uint256","name":"_temperature","type":"uint256"},{"internalType":"uint256","name":"_timestamp","type":"uint256"},{"internalType":"bool","name":"_antipyreticGiven","type":"bool"}],"name":"recordFeverEvent","outputs":[],"stateMutability":"nonpayable","type":"function"},'
    '{"inputs":[{"internalType":"string","name":"_patientId","type":"string"},{"internalType":"uint256","name":"_feverIndex","type":"uint256"}],"name":"closeFeverEvent","outputs":[],"stateMutability":"nonpayable","type":"function"},'
    '{"inputs":[{"internalType":"string","name":"_patientId","type":"string"}],"name":"getFeverHistory","outputs":[{"components":[{"internalType":"uint256","name":"startTime","type":"uint256"},{"internalType":"uint256","name":"endTime","type":"uint256"},{"internalType":"uint256","name":"peakTemp","type":"uint256"},{"internalType":"bool","name":"antipyreticGiven","type":"bool"},{"internalType":"bool","name":"isClosed","type":"bool"}],"internalType":"struct FeverHistory.FeverEvent[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},'
    '{"inputs":[{"internalType":"string","name":"_patientId","type":"string"},{"internalType":"address","name":"_hospital","type":"address"},{"internalType":"bool","name":"_grant","type":"bool"}],"name":"setHospitalAccess","outputs":[],"stateMutability":"nonpayable","type":"function"}'
']')


def _canonical_json(data: dict) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _patient_ref(patient_id: str) -> str:
    return _sha256_hex(f"thronos-medice:patient:{patient_id}")


class BlockchainService:
    def __init__(self):
        self.mode = THRONOS_CHAIN_MODE
        self.w3 = None
        self.contract = None
        self.account = None
        self._connected = False
        if self.mode == "evm":
            self._connect_evm()
        elif self.mode == "offline_replica":
            self._connected = True
        elif self.mode == "thronos_native":
            self._connected = bool(THRONOS_NATIVE_API_URL.strip())
        else:
            logger.warning("Unknown THRONOS_CHAIN_MODE=%s; blockchain disabled", self.mode)

    def _connect_evm(self):
        try:
            from web3 import Web3
            try:
                from web3.middleware import ExtraDataToPOAMiddleware as poa_middleware
            except ImportError:
                from web3.middleware import geth_poa_middleware as poa_middleware

            provider = Web3.HTTPProvider(THRONOS_RPC_URL, request_kwargs={"timeout": 10})
            self.w3 = Web3(provider)
            self.w3.middleware_onion.inject(poa_middleware, layer=0)
            if not self.w3.is_connected():
                logger.warning("Thronos EVM RPC unreachable - blockchain features disabled")
                return
            self._connected = True
            if PRIVATE_KEY:
                self.account = self.w3.eth.account.from_key(PRIVATE_KEY)
            if CONTRACT_ADDRESS:
                self.contract = self.w3.eth.contract(
                    address=Web3.to_checksum_address(CONTRACT_ADDRESS),
                    abi=FEVER_ABI,
                )
        except Exception as exc:
            logger.warning("EVM blockchain init failed: %s", exc)

    def _native_anchor_url(self) -> str:
        return THRONOS_NATIVE_API_URL.rstrip("/") + "/" + THRONOS_ANCHOR_PATH.lstrip("/")

    def _send_native(self, payload: dict) -> Optional[str]:
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "X-Node-ID": THRONOS_NATIVE_NODE_ID,
        }
        if THRONOS_NATIVE_API_KEY:
            headers["X-API-Key"] = THRONOS_NATIVE_API_KEY
        req = request.Request(self._native_anchor_url(), data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8")) if resp.readable() else {}
            for key in ("tx_hash", "tx_id", "hash", "block_hash", "id"):
                if data.get(key):
                    return str(data[key])
            return None
        except (error.URLError, error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            logger.warning("Thronos native anchor unavailable: %s", exc)
            return None

    def _enqueue_offline(self, payload: dict, payload_hash: str) -> str:
        os.makedirs("/medice", exist_ok=True)
        record = {
            "created_at": datetime.utcnow().isoformat(),
            "sync_status": "pending",
            "payload_hash": payload_hash,
            "payload": payload,
        }
        with open(OFFLINE_QUEUE_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return f"offline:{payload_hash}"

    async def record_fever_event(self, patient_id: str, temperature: float, ts: datetime) -> Optional[str]:
        ts_unix = int(ts.timestamp())
        clinical_payload = {
            "temp_x100": int(temperature * 100),
            "timestamp": ts_unix,
            "patient_ref": _patient_ref(patient_id),
        }
        payload_hash = _sha256_hex(_canonical_json(clinical_payload))
        payload = {
            "app": "thronos-medice",
            "type": "fever_event_start",
            "patient_ref": _patient_ref(patient_id),
            "timestamp": ts_unix,
            "payload_hash": payload_hash,
            "metadata": {"temp_x100": int(temperature * 100)},
            "node_id": THRONOS_NATIVE_NODE_ID,
        }
        if self.mode == "offline_replica":
            return self._enqueue_offline(payload, payload_hash)
        if self.mode == "thronos_native":
            return self._send_native(payload)
        if self.mode == "evm":
            return self._record_fever_event_evm(patient_id, temperature, ts)
        return None

    async def close_fever_event(self, patient_id: str, index: int) -> Optional[str]:
        ts_unix = int(datetime.utcnow().timestamp())
        event_payload = {
            "event_index": index,
            "timestamp": ts_unix,
            "patient_ref": _patient_ref(patient_id),
        }
        payload_hash = _sha256_hex(_canonical_json(event_payload))
        payload = {
            "app": "thronos-medice",
            "type": "fever_event_end",
            "patient_ref": _patient_ref(patient_id),
            "event_index": index,
            "timestamp": ts_unix,
            "payload_hash": payload_hash,
            "node_id": THRONOS_NATIVE_NODE_ID,
        }
        if self.mode == "offline_replica":
            return self._enqueue_offline(payload, payload_hash)
        if self.mode == "thronos_native":
            return self._send_native(payload)
        if self.mode == "evm":
            return self._close_fever_event_evm(patient_id, index)
        return None

    def _ready_evm(self) -> bool:
        return self._connected and self.contract is not None and self.account is not None and self.w3 is not None

    def _tx_base(self) -> dict:
        return {
            "from": self.account.address,
            "nonce": self.w3.eth.get_transaction_count(self.account.address),
            "gas": 200000,
            "gasPrice": self.w3.eth.gas_price,
        }

    def _sign_and_send(self, tx: dict) -> str:
        signed = self.account.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        return receipt.transactionHash.hex()

    def _record_fever_event_evm(self, patient_id: str, temperature: float, ts: datetime) -> Optional[str]:
        if not self._ready_evm():
            return None
        try:
            tx = self.contract.functions.recordFeverEvent(
                patient_id, int(temperature * 100), int(ts.timestamp()), False
            ).build_transaction(self._tx_base())
            return self._sign_and_send(tx)
        except Exception as exc:
            logger.error("record_fever_event failed: %s", exc)
            return None

    def _close_fever_event_evm(self, patient_id: str, index: int) -> Optional[str]:
        if not self._ready_evm():
            return None
        try:
            tx = self.contract.functions.closeFeverEvent(patient_id, index).build_transaction(self._tx_base())
            return self._sign_and_send(tx)
        except Exception as exc:
            logger.error("close_fever_event failed: %s", exc)
            return None

    async def get_fever_history(self, patient_id: str) -> list:
        if self.mode != "evm" or not self._ready_evm():
            return []
        try:
            events = self.contract.functions.getFeverHistory(patient_id).call()
            return [
                {
                    "start_time": datetime.fromtimestamp(e[0]).isoformat() if e[0] else None,
                    "end_time": datetime.fromtimestamp(e[1]).isoformat() if e[1] else None,
                    "peak_temp": e[2] / 100.0,
                    "antipyretic_given": e[3],
                    "is_closed": e[4],
                }
                for e in events
            ]
        except Exception as exc:
            logger.error("get_fever_history failed: %s", exc)
            return []

    @property
    def is_connected(self) -> bool:
        return self._connected


_svc = BlockchainService()


def get_status() -> dict:
    return {
        "mode": THRONOS_CHAIN_MODE,
        "connected": _svc.is_connected,
        "native_api_configured": bool(THRONOS_NATIVE_API_URL.strip()),
        "anchor_path": THRONOS_ANCHOR_PATH,
        "offline_queue_enabled": THRONOS_CHAIN_MODE == "offline_replica",
        "rpc_url_configured": bool(THRONOS_RPC_URL),
        "contract_configured": bool(CONTRACT_ADDRESS),
        "account_configured": bool(PRIVATE_KEY),
    }


async def record_fever_start(patient_id: str, temp_x100: int, ts_unix: int) -> Optional[str]:
    return await _svc.record_fever_event(patient_id, temp_x100 / 100, datetime.fromtimestamp(ts_unix))


async def record_fever_end(patient_id: str, index: int) -> Optional[str]:
    return await _svc.close_fever_event(patient_id, index)


async def get_fever_history(patient_id: str) -> list:
    return await _svc.get_fever_history(patient_id)
