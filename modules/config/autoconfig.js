var fs = require('fs');

var RESOURCEMAN = require('../resourcemanager/resourcemanager')
var LOG = require('../egsm-common/auxiliary/logManager')
var AUX = require('../resourcemanager/primitives')

module.id = 'AUTOCONF'

function applyConfig(config) {
    //Add Brokers
    var brokers = config['configuration']['broker']
    for (var i in brokers) {
        if (!RESOURCEMAN.registerBroker(brokers[i]['host'][0], brokers[i]['port'][0], brokers[i]['username'][0], brokers[i]['password'][0])) {
            LOG.logSystem('FATAL', 'Could not perform initialization defined in config', module.id)
        }
    }

    //Wait for the requested number of Workers and Aggregators to register at Supervisor
    //It is necessary to add the engines
    (async () => {
        while (true) {
            LOG.logSystem('DEBUG', `Waiting for ${config['configuration']['engines-to-wait'] - RESOURCEMAN.getNumberofWorkers() || 0} more workers and ${config['configuration']['aggregator-to-wait'] - RESOURCEMAN.getNumberofAgents() || 0} more Aggregators to connect`, module.id)
            var workers_registered = RESOURCEMAN.getNumberofWorkers() >= config['configuration']['engines-to-wait']
            var aggregators_registered = RESOURCEMAN.getNumberofAgents() >= config['configuration']['aggregator-to-wait']
            if (workers_registered && aggregators_registered) {
                break
            }
            await AUX.sleep(1000);
        }
    })().then(function () {
        //Add Engines
        LOG.logSystem('DEBUG', `${RESOURCEMAN.getNumberofWorkers()} Workers and ${RESOURCEMAN.getNumberofAgents()} Aggregators connected to Supervisor`, module.id)
        var engines = config['configuration']['engine']
        for (var engine in engines) {
            var engineid = engines[engine]['engine_id'][0]
            var brokers = engines[engine]['broker']
            var default_broker_host = engines[engine]['default_broker_host'][0]
            var default_broker_port = engines[engine]['default_broker_port'][0]
            var info_model = fs.createReadStream(engines[engine]['info_model'][0], 'utf8')
            var process_model = fs.createReadStream(engines[engine]['process_model'][0], 'utf8')
            var event_router_config = fs.createReadStream(engines[engine]['event_router_config'][0], 'utf8')
            var brokerObjects = []
            var default_broker
            for (var k in RESOURCEMAN.getBrokers()) {
                if (default_broker_host == RESOURCEMAN.getBrokers()[k].host && default_broker_port == RESOURCEMAN.getBrokers()[k].port) {
                    default_broker = RESOURCEMAN.getBrokers()[k]
                }
            }
            for (var i in brokers) {
                for (var k in RESOURCEMAN.getBrokers()) {
                    if (brokers[i]['host'][0] == RESOURCEMAN.getBrokers()[k].host && brokers[i]['port'][0] == RESOURCEMAN.getBrokers()[k].port) {
                        brokerObjects.push(RESOURCEMAN.getBrokers()[k])
                    }
                }
            }
            LOG.logSystem(`DEBUG`, `Engine read from config file with ID: [${engineid}]`, module.id)
            if (!RESOURCEMAN.registerEngine(engineid, brokerObjects, default_broker, info_model, process_model, event_router_config)) {
                LOG.logSystem('FATAL', 'Could not perform initialization defined in config', module.id)
            }
        }
        var aggregators = config['configuration']['aggregator']
        //TODO: Add aggregators here
    })
}

module.exports = {
    applyConfig:applyConfig
}