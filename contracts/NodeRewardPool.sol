// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title NodeRewardPool
 * @notice Epoch-based reward pool funded by 5% of block rewards.
 *
 * Distribution:
 *   5% -> Active node replicas (CHAIN_NODE, API_NODE_MEDICE, IOT_MINER) — equal share
 *   5% -> ASIC miners — proportional to hashrate
 *
 * Nodes must call heartbeat() every 24h to remain active.
 */
contract NodeRewardPool {

    enum NodeType { CHAIN_NODE, API_NODE_MEDICE, ASIC_MINER, IOT_MINER }

    struct NodeInfo {
        address  thrAddress;
        NodeType nodeType;
        uint256  registeredAt;
        uint256  lastHeartbeat;
        uint256  hashrate;
        bool     isActive;
        string   nodeId;
        uint256  totalEarned;
    }

    struct Epoch {
        uint256 startTime;
        uint256 endTime;
        uint256 nodePoolAmount;
        uint256 asicPoolAmount;
        uint256 totalActiveNodes;
        uint256 totalHashrate;
        bool    distributed;
    }

    address public owner;
    mapping(address => bool)    public authorizedServices;
    mapping(address => NodeInfo) public nodes;
    mapping(string  => address)  public nodeIdToAddress;
    address[] public registeredNodes;

    Epoch[]   public epochs;
    uint256   public currentEpochId;

    uint256 public constant EPOCH_DURATION   = 1 days;
    uint256 public constant HEARTBEAT_EXPIRY = 24 hours;

    mapping(address => uint256) public pendingRewards;

    event NodeRegistered(address indexed node, string nodeId, NodeType nodeType);
    event HeartbeatReceived(address indexed node, string nodeId);
    event HashrateUpdated(address indexed node, uint256 hashrate);
    event RewardDeposited(uint256 indexed epochId, uint256 nodeAmt, uint256 asicAmt);
    event EpochDistributed(uint256 indexed epochId, uint256 activeNodes, uint256 totalHashrate);
    event RewardClaimed(address indexed node, uint256 amount);
    event NodeDeactivated(address indexed node, string reason);
    event ServiceAuthorized(address service);

    modifier onlyOwner()   { require(msg.sender == owner, "NRP: not owner"); _; }
    modifier onlyService() { require(authorizedServices[msg.sender] || msg.sender == owner, "NRP: not authorized"); _; }

    constructor() {
        owner = msg.sender;
        authorizedServices[msg.sender] = true;
        _startNewEpoch();
    }

    function authorizeService(address svc) external onlyOwner {
        authorizedServices[svc] = true;
        emit ServiceAuthorized(svc);
    }

    function revokeService(address svc) external onlyOwner {
        authorizedServices[svc] = false;
    }

    function registerNode(string memory nodeId, NodeType nodeType, uint256 hashrate) external {
        require(nodeIdToAddress[nodeId] == address(0),  "NRP: nodeId taken");
        require(nodes[msg.sender].registeredAt == 0,    "NRP: address already registered");

        nodes[msg.sender] = NodeInfo({
            thrAddress:    msg.sender,
            nodeType:      nodeType,
            registeredAt:  block.timestamp,
            lastHeartbeat: block.timestamp,
            hashrate:      nodeType == NodeType.ASIC_MINER ? hashrate : 0,
            isActive:      true,
            nodeId:        nodeId,
            totalEarned:   0
        });
        nodeIdToAddress[nodeId] = msg.sender;
        registeredNodes.push(msg.sender);
        emit NodeRegistered(msg.sender, nodeId, nodeType);
    }

    function heartbeat(string memory nodeId) external {
        address nodeAddr = nodeIdToAddress[nodeId];
        require(nodeAddr == msg.sender || authorizedServices[msg.sender], "NRP: not node owner");
        _touch(nodeAddr);
        emit HeartbeatReceived(nodeAddr, nodeId);
    }

    function serviceHeartbeat(string memory nodeId) external onlyService {
        address nodeAddr = nodeIdToAddress[nodeId];
        require(nodeAddr != address(0), "NRP: unknown node");
        _touch(nodeAddr);
        emit HeartbeatReceived(nodeAddr, nodeId);
    }

    function updateHashrate(address node, uint256 newHashrate) external onlyService {
        require(nodes[node].nodeType == NodeType.ASIC_MINER, "NRP: not ASIC");
        nodes[node].hashrate = newHashrate;
        emit HashrateUpdated(node, newHashrate);
    }

    function depositRewards() external payable onlyService {
        require(msg.value > 0, "NRP: zero value");
        uint256 nodeAmt = msg.value / 2;
        uint256 asicAmt = msg.value - nodeAmt;
        epochs[currentEpochId].nodePoolAmount += nodeAmt;
        epochs[currentEpochId].asicPoolAmount += asicAmt;
        emit RewardDeposited(currentEpochId, nodeAmt, asicAmt);
    }

    function distributeEpoch(uint256 epochId) external {
        require(epochId < epochs.length, "NRP: bad epoch");
        Epoch storage epoch = epochs[epochId];
        require(!epoch.distributed,          "NRP: already distributed");
        require(block.timestamp >= epoch.endTime, "NRP: epoch not ended");

        _distributeNodePool(epochId);
        _distributeAsicPool(epochId);
        epoch.distributed = true;
        emit EpochDistributed(epochId, epoch.totalActiveNodes, epoch.totalHashrate);

        if (epochId == currentEpochId) _startNewEpoch();
    }

    function _distributeNodePool(uint256 epochId) internal {
        Epoch storage epoch = epochs[epochId];
        if (epoch.nodePoolAmount == 0) return;

        address[] memory active = new address[](registeredNodes.length);
        uint256 count;
        for (uint256 i; i < registeredNodes.length; i++) {
            NodeInfo storage n = nodes[registeredNodes[i]];
            if (!n.isActive || n.nodeType == NodeType.ASIC_MINER) continue;
            if (block.timestamp - n.lastHeartbeat > HEARTBEAT_EXPIRY) {
                n.isActive = false;
                emit NodeDeactivated(registeredNodes[i], "heartbeat expired");
                continue;
            }
            active[count++] = registeredNodes[i];
        }
        epoch.totalActiveNodes = count;
        if (count == 0) return;
        uint256 perNode = epoch.nodePoolAmount / count;
        for (uint256 i; i < count; i++) {
            pendingRewards[active[i]]    += perNode;
            nodes[active[i]].totalEarned += perNode;
        }
    }

    function _distributeAsicPool(uint256 epochId) internal {
        Epoch storage epoch = epochs[epochId];
        if (epoch.asicPoolAmount == 0) return;
        uint256 totalHash;
        for (uint256 i; i < registeredNodes.length; i++) {
            NodeInfo storage n = nodes[registeredNodes[i]];
            if (!n.isActive || n.nodeType != NodeType.ASIC_MINER) continue;
            if (block.timestamp - n.lastHeartbeat <= HEARTBEAT_EXPIRY) totalHash += n.hashrate;
        }
        epoch.totalHashrate = totalHash;
        if (totalHash == 0) return;
        for (uint256 i; i < registeredNodes.length; i++) {
            NodeInfo storage n = nodes[registeredNodes[i]];
            if (!n.isActive || n.nodeType != NodeType.ASIC_MINER || n.hashrate == 0) continue;
            if (block.timestamp - n.lastHeartbeat > HEARTBEAT_EXPIRY) continue;
            uint256 share = (epoch.asicPoolAmount * n.hashrate) / totalHash;
            pendingRewards[registeredNodes[i]]    += share;
            n.totalEarned                          += share;
        }
    }

    function claimRewards() external {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "NRP: nothing to claim");
        pendingRewards[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "NRP: transfer failed");
        emit RewardClaimed(msg.sender, amount);
    }

    function getActiveNodeCounts() external view
        returns (uint256 chainNodes, uint256 medicNodes, uint256 asics, uint256 iotMiners)
    {
        for (uint256 i; i < registeredNodes.length; i++) {
            NodeInfo storage n = nodes[registeredNodes[i]];
            if (!n.isActive || block.timestamp - n.lastHeartbeat > HEARTBEAT_EXPIRY) continue;
            if      (n.nodeType == NodeType.CHAIN_NODE)      chainNodes++;
            else if (n.nodeType == NodeType.API_NODE_MEDICE) medicNodes++;
            else if (n.nodeType == NodeType.ASIC_MINER)      asics++;
            else if (n.nodeType == NodeType.IOT_MINER)       iotMiners++;
        }
    }

    function getCurrentEpoch() external view returns (Epoch memory) { return epochs[currentEpochId]; }
    function getPendingReward(address node) external view returns (uint256) { return pendingRewards[node]; }
    function getNodeInfo(string memory nodeId) external view returns (NodeInfo memory) {
        return nodes[nodeIdToAddress[nodeId]];
    }

    function _touch(address nodeAddr) internal {
        NodeInfo storage n = nodes[nodeAddr];
        require(n.isActive, "NRP: node inactive");
        n.lastHeartbeat = block.timestamp;
    }

    function _startNewEpoch() internal {
        currentEpochId = epochs.length;
        epochs.push(Epoch({
            startTime:        block.timestamp,
            endTime:          block.timestamp + EPOCH_DURATION,
            nodePoolAmount:   0,
            asicPoolAmount:   0,
            totalActiveNodes: 0,
            totalHashrate:    0,
            distributed:      false
        }));
    }

    receive() external payable {}
}
