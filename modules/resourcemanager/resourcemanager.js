var LOG = require('../auxiliary/logger')
var AUX = require('../auxiliary/auxiliary')


module.id = 'RESOURCEMAN'

//Global Variables
var BROKERS = [] //List of brokers (and their credentials)
var AGENTS = [] //List of aggregators
var WORKERS = new Map() //Worker id -> Worker object
var ENGINES = new Map() //Engine id -> Engine object

function registerBroker(host, port, username, password) {
    LOG.logSystem('DEBUG', `registerBroker function called [${host}]:[${port}]`, module.id)
    BROKERS.forEach(item => {
        if (item.host == host && item.port == port) {
            LOG.logSystem('WARNING', `Broker [${host}]:[${port}] is already defined`, module.id)
            return true
        }
    })
    BROKERS.push(AUX.Broker(host, port, username, password))
    LOG.logSystem('DEBUG', `Broker [${host}]:[${port}] succesfully registered`, module.id)
    return true
}

function registerWorker(workerid, capacity, host, port) {
    LOG.logSystem('DEBUG', 'registerWorker function called', module.id)
    if (WORKERS.has(workerid)) {
        LOG.logSystem('WARNING', `Worker [${workerid}] is already defined`, module.id)
        return false
    }
    WORKERS.set(workerid, AUX.Worker(workerid, capacity, host, port))
    LOG.logSystem('DEBUG', `Worker [${workerid}] succesfully registered`, module.id)
    return true
}

function deregisterWorker(workerid) {
    LOG.logSystem('DEBUG', `deregisterWorker function called for [${workerid}]`, module.id)
    if (!WORKERS.has(workerid)) {
        LOG.logSystem('WARNING', `Worker [${workerid}] is not known, could not deregister`, module.id)
        return false
    }
    if (WORKERS.get(workerid).engines.length != 0) {
        LOG.logSystem('WARNING', `Worker [${workerid}] requested its deregistration, but it still has engine(s) assigned`, module.id)
    }
    WORKERS.delete(workerid)
    LOG.logSystem('DEBUG', `Worker [${workerid}] deregistered`, module.id)
    return true
}

function registerEngine(engineid, brokers, default_broker, informal_model, process_model, eventRouterConfig) {
    LOG.logSystem('DEBUG', `registerEngine function called for [${engineid}]`, module.id)
    if (ENGINES.has(engineid)) {
        LOG.logSystem('WARNING', `Engine [${engineid}] is already registered`, module.id)
        return false
    }

    LOG.logSystem('DEBUG', `Searching for free worker slot for [${engineid}]`, module.id)
    for (let [key, value] of WORKERS) {
        if (value.capacity > value.engines.length) {
            LOG.logSystem('DEBUG', `Engine [${engineid}] is now assigned to Worker [${key}]`, module.id)
            var newEngine = AUX.Engine(engineid, brokers, default_broker)
            value.addEngine(newEngine, informal_model, process_model, eventRouterConfig)
            ENGINES.set(engineid, newEngine)
            LOG.logSystem('DEBUG', `Engine [${engineid}] initialized and created on Worker [${key}]`, module.id)
            resourceCheck()
            return true
        }
    }
    LOG.logSystem('ERROR', `Could not find free worker slot for Engine [${engineid}]`, module.id)
    resourceCheck()
    return false
}

function deregisterEngine(engineid) {
    LOG.logSystem('DEBUG', 'deregisterEngine function called', module.id)
    if (!ENGINES.has(engineid)) {
        LOG.logSystem('WARNING', `Engine [${engineid}] is not registered, cannot be deleted`, module.id)
        return false
    }

    for (const [key, value] of WORKERS) {
        for (var item in value.engines) {
            if (value.engines[item].engineid == engineid) {
                if (value.removeEngine(ENGINES.get(engineid))) {
                    ENGINES.delete(engineid)
                    LOG.logSystem('DEBUG', `Engine [${engineid}] removed from Worker [${key}]`, module.id)
                    return true
                }
                return false
            }
        }
    }
    return false
}

function registerAgent(agentid, host, port) {
    LOG.logSystem('DEBUG', 'registerAgent function called', module.id)
    if (AGENTS.indexOf(agentid) != -1) {
        LOG.logSystem('WARNING', `Agent [${agentid}] is already registered`, module.id)
        return false
    }
    AGENTS.push(AUX.Agent(agentid, host, port))
    LOG.logSystem('DEBUG', `Agnet [${agentid}] succesfully initialized`, module.id)
    return true
}

//TODO
function deregisterAgent(agentid) {
    return
}

function resourceCheck() {
    //TODO: Iterate through all the workers and if ([free slots]/[number of slots] * 100 > new-worker-spawn-load) then
    //call requestNewWorker() to spawn a new Worker instance 
}

function requestNewWorker() {
    //TODO: Orders systen to spawn a new Worker instance
}

function getNumberofWorkers() {
    return WORKERS.size
}

function getNumberofAgents() {
    return AGENTS.length
}

function getBrokers() {
    return BROKERS
}

function isWorkerExists(workerid) {
    return WORKERS.has(workerid)
}

function isAgentExists(agentid) {
    return AGENTS.has(agentid)
}

module.exports = {
    registerBroker: registerBroker,
    registerWorker: registerWorker,
    deregisterWorker: deregisterWorker,
    registerEngine: registerEngine,
    deregisterEngine: deregisterEngine,
    registerAgent: registerAgent,
    deregisterAgent:deregisterAgent,


    getNumberofWorkers: getNumberofWorkers,
    getNumberofAgents: getNumberofAgents,
    getBrokers: getBrokers,
    isWorkerExists: isWorkerExists,
    isAgentExists: isAgentExists,
}