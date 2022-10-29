var fs = require('fs');

var RESOURCEMAN = require('../resourcemanager/resourcemanager')
var LOG = require('../egsm-common/auxiliary/logManager')
var AUX = require('../egsm-common/auxiliary/auxiliary')

module.id = 'AUTOCONF'

function applyConfig(config) {
    //Add Brokers
    var brokers = config['configuration']['broker']
    for (var i in brokers) {
        if (!RESOURCEMAN.registerBroker(brokers[i]['host'][0], brokers[i]['port'][0], brokers[i]['username'][0], brokers[i]['password'][0])) {
            LOG.logSystem('FATAL', 'Could not perform initialization defined in config', module.id)
        }
    }
    var default_broker = config['configuration']['default-broker'][0]
    default_broker = {
        host: default_broker.host[0],
        port: default_broker.port[0]
    }
    if (!RESOURCEMAN.setDefaultBroker(default_broker)) {
        LOG.logSystem('FATAL', 'Could not perform initialization defined in config', module.id)
    }
}

module.exports = {
    applyConfig: applyConfig
}