// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FeverHistory
 * @notice Stores immutable fever events for patients on the Thronos blockchain.
 *         Guardians control their child's data; hospitals get read access only
 *         when the guardian explicitly grants it.
 */
contract FeverHistory {

    struct FeverEvent {
        uint256 startTime;
        uint256 endTime;
        uint256 peakTemp;           // temperature * 100 (38.50°C -> 3850)
        bool    antipyreticGiven;
        bool    isClosed;
    }

    address public owner;
    mapping(address => bool)   public authorizedServices;
    mapping(string => FeverEvent[])                  private _feverHistory;
    mapping(string => address)                       private _guardian;
    mapping(string => mapping(address => bool))      private _hospitalAccess;

    event PatientRegistered(string indexed patientId, address guardian);
    event FeverRecorded(string indexed patientId, uint256 temperature, uint256 timestamp);
    event FeverClosed(string indexed patientId, uint256 index, uint256 endTime);
    event AntipyreticMarked(string indexed patientId, uint256 index);
    event HospitalAccessChanged(string indexed patientId, address hospital, bool granted);
    event ServiceAuthorized(address service);
    event ServiceRevoked(address service);

    modifier onlyOwner() {
        require(msg.sender == owner, "FeverHistory: not owner");
        _;
    }
    modifier onlyService() {
        require(authorizedServices[msg.sender] || msg.sender == owner,
                "FeverHistory: not authorized service");
        _;
    }
    modifier onlyGuardianOrService(string memory patientId) {
        require(
            _guardian[patientId] == msg.sender ||
            authorizedServices[msg.sender]     ||
            msg.sender == owner,
            "FeverHistory: caller not guardian or service"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedServices[msg.sender] = true;
        emit ServiceAuthorized(msg.sender);
    }

    function authorizeService(address service) external onlyOwner {
        authorizedServices[service] = true;
        emit ServiceAuthorized(service);
    }

    function revokeService(address service) external onlyOwner {
        authorizedServices[service] = false;
        emit ServiceRevoked(service);
    }

    function registerPatient(string memory patientId, address guardian) external onlyService {
        require(_guardian[patientId] == address(0), "FeverHistory: already registered");
        require(guardian != address(0), "FeverHistory: zero guardian");
        _guardian[patientId] = guardian;
        emit PatientRegistered(patientId, guardian);
    }

    function recordFeverEvent(
        string  memory patientId,
        uint256 temperature,
        uint256 timestamp,
        bool    antipyreticGiven
    ) external onlyService {
        require(temperature >= 3800, "FeverHistory: below fever threshold");
        _feverHistory[patientId].push(FeverEvent({
            startTime:        timestamp,
            endTime:          0,
            peakTemp:         temperature,
            antipyreticGiven: antipyreticGiven,
            isClosed:         false
        }));
        emit FeverRecorded(patientId, temperature, timestamp);
    }

    function updatePeakTemp(string memory patientId, uint256 index, uint256 newPeakTemp)
        external onlyService
    {
        FeverEvent storage ev = _getOpen(patientId, index);
        if (newPeakTemp > ev.peakTemp) ev.peakTemp = newPeakTemp;
    }

    function closeFeverEvent(string memory patientId, uint256 index) external onlyService {
        FeverEvent storage ev = _getOpen(patientId, index);
        ev.endTime  = block.timestamp;
        ev.isClosed = true;
        emit FeverClosed(patientId, index, block.timestamp);
    }

    function markAntipyreticGiven(string memory patientId, uint256 index) external onlyService {
        _feverHistory[patientId][index].antipyreticGiven = true;
        emit AntipyreticMarked(patientId, index);
    }

    function setHospitalAccess(string memory patientId, address hospital, bool grant)
        external onlyGuardianOrService(patientId)
    {
        _hospitalAccess[patientId][hospital] = grant;
        emit HospitalAccessChanged(patientId, hospital, grant);
    }

    function getFeverHistory(string memory patientId)
        external view returns (FeverEvent[] memory)
    {
        require(
            _guardian[patientId]                == msg.sender ||
            _hospitalAccess[patientId][msg.sender]            ||
            authorizedServices[msg.sender]                    ||
            msg.sender == owner,
            "FeverHistory: no read access"
        );
        return _feverHistory[patientId];
    }

    function getFeverCount(string memory patientId) external view returns (uint256) {
        return _feverHistory[patientId].length;
    }

    function hasHospitalAccess(string memory patientId, address hospital)
        external view returns (bool)
    {
        return _hospitalAccess[patientId][hospital];
    }

    function guardianOf(string memory patientId) external view returns (address) {
        return _guardian[patientId];
    }

    function _getOpen(string memory patientId, uint256 index)
        internal view returns (FeverEvent storage)
    {
        require(index < _feverHistory[patientId].length, "FeverHistory: bad index");
        FeverEvent storage ev = _feverHistory[patientId][index];
        require(!ev.isClosed, "FeverHistory: event already closed");
        return ev;
    }
}
