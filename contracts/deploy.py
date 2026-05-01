"""Deploy FeverHistory.sol and NodeRewardPool.sol to the Thronos chain.

Usage:
    export THRONOS_RPC_URL=http://your-node:8545
    export DEPLOYER_PRIVATE_KEY=0x...
    python deploy.py

Prerequisites:
    solc --abi --bin FeverHistory.sol -o build/
    solc --abi --bin NodeRewardPool.sol -o build/
"""
import os
import json
from pathlib import Path
from web3 import Web3
from web3.middleware import geth_poa_middleware

RPC_URL     = os.environ["THRONOS_RPC_URL"]
PRIVATE_KEY = os.environ["DEPLOYER_PRIVATE_KEY"]

BUILD_DIR = Path(__file__).parent / "build"


def deploy_contract(w3, acct, name: str) -> str:
    abi      = json.loads((BUILD_DIR / f"{name}.abi").read_text())
    bytecode = (BUILD_DIR / f"{name}.bin").read_text().strip()
    Contract = w3.eth.contract(abi=abi, bytecode=bytecode)
    tx = Contract.constructor().build_transaction({
        "from":     acct.address,
        "nonce":    w3.eth.get_transaction_count(acct.address),
        "gas":      3_000_000,
        "gasPrice": w3.eth.gas_price,
    })
    signed  = acct.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    print(f"[{name}] Tx sent: {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    addr    = receipt.contractAddress
    print(f"[{name}] Deployed at: {addr}")
    return addr


def deploy():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    w3.middleware_onion.inject(geth_poa_middleware, layer=0)
    assert w3.is_connected(), "Cannot connect to node"

    acct = w3.eth.account.from_key(PRIVATE_KEY)
    print(f"Deploying from: {acct.address}")
    print(f"Balance: {w3.from_wei(w3.eth.get_balance(acct.address), 'ether')} THR")

    fever_addr = deploy_contract(w3, acct, "FeverHistory")
    pool_addr  = deploy_contract(w3, acct, "NodeRewardPool")

    print("\n── Set these in Railway / .env ──────────────────────")
    print(f"FEVER_CONTRACT_ADDRESS   = {fever_addr}")
    print(f"NODE_REWARD_POOL_ADDRESS = {pool_addr}")

    return fever_addr, pool_addr


if __name__ == "__main__":
    deploy()
