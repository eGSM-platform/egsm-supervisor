var LOG = require('../egsm-common/auxiliary/logManager')
var AUX = require('../egsm-common/auxiliary/primitives')


module.id = 'RESOURCEMAN'

//Global Variables
var BROKERS = [] //List of brokers (and their credentials)
var DEFAULT_BROKER = undefined

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

function setDefaultBroker(default_broker) {
    var found = false
    if (default_broker) {
        BROKERS.forEach(item => {
            if (item.host == default_broker.host && item.port == default_broker.port) {
                DEFAULT_BROKER = item
                found = true
            }
        })
    }
    return found
}

function getDefaultBroker(){
    return DEFAULT_BROKER
}

module.exports = {
    registerBroker: registerBroker,
    setDefaultBroker: setDefaultBroker,
    getDefaultBroker:getDefaultBroker
}