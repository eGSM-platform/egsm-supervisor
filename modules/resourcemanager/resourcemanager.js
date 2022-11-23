/**
 * Module intended to store and handle resources the supervisor needs to use
 */

var LOG = require('../egsm-common/auxiliary/logManager')
var PRIM = require('../egsm-common/auxiliary/primitives')

module.id = 'RESOURCEMAN'

//Global Variables
var BROKERS = [] //List of brokers (and their credentials)

/**
 * Adding a new MQTT broker to the collection
 * @param {string} host 
 * @param {string} port 
 * @param {string} username 
 * @param {string} password 
 * @returns 
 */
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

/**
 * Get all registered MQTT brokers
 * @returns List of registered MQTT brokers
 */
function getBrokers(){
    return BROKERS
}


module.exports = {
    registerBroker: registerBroker,
    getBrokers:getBrokers
}