var fs = require('fs');

var RESOURCEMAN = require('../resourcemanager/resourcemanager')
var SOCKET = require('../communication/socketserver')
var LOG = require('../egsm-common/auxiliary/logManager')
var AUX = require('../egsm-common/auxiliary/auxiliary')

module.id = 'AUTOCONF'

var PROCESS_CREATION_TIMEOUT = 200

function applyBasicConfig(config) {
    //Add Brokers
    var brokers = config['configuration']['broker']
    for (var i in brokers) {
        if (!RESOURCEMAN.registerBroker(brokers[i]['host'][0], brokers[i]['port'][0], brokers[i]['username'][0], brokers[i]['password'][0])) {
            LOG.logSystem('FATAL', 'Could not perform initialization defined in config', module.id)
        }
    }
}

async function applyAdvancedConfig(config) {
    //Add predefined Process Instances
    LOG.logSystem('DEBUG', 'Creating predefined Process Instances', module.id)
    var processes = config['configuration']['processes'][0]['process']
    for (var i in processes) {
        var processType = processes[i]['type-name'][0]
        var instanceNamePrefix = processes[i]['instance-name-prefix'][0]
        var quantity = Number(processes[i]['quantity'][0]) || 1
        var bpmnJob = processes[i]['bpmn-job'][0] || false
        for (var index = 0; index < quantity; index++) {
            var instanceName = instanceNamePrefix + (index + 1).toString()
            console.log(index)
            await SOCKET.createProcessInstance(processType, instanceName, bpmnJob)
        }

        if (bpmnJob) {
            //TODO: Create BPMN job here
        }
    }
}

module.exports = {
    applyBasicConfig: applyBasicConfig,
    applyAdvancedConfig: applyAdvancedConfig
}