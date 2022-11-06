var LOG = require('../egsm-common/auxiliary/logManager')
var PRIM = require('../egsm-common/auxiliary/primitives')


module.id = 'RESOURCEMAN'

//Global Variables
var BROKERS = [] //List of brokers (and their credentials)

function registerBroker(host, port, username, password) {
    LOG.logSystem('DEBUG', `registerBroker function called [${host}]:[${port}]`, module.id)
    BROKERS.forEach(item => {
        if (item.host == host && item.port == port) {
            LOG.logSystem('WARNING', `Broker [${host}]:[${port}] is already defined`, module.id)
            return true
        }
    })
    BROKERS.push(PRIM.Broker(host, port, username, password))
    LOG.logSystem('DEBUG', `Broker [${host}]:[${port}] succesfully registered`, module.id)
    return true
}

function getBrokers(){
    return BROKERS
}


module.exports = {
    registerBroker: registerBroker,
    getBrokers:getBrokers
}