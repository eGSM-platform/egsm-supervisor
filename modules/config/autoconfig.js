/**
 * Module to handle file-defined configurations
 * The module functions need an object as argument (parsed XML, or JSON) and it 
 * executes all necessary configuration-related operation (creating resources, new process etc.) 
 */

var SOCKET = require('../communication/socketserver')
var LOG = require('../egsm-common/auxiliary/logManager')
const { Broker, ConnectionConfig } = require('../egsm-common/auxiliary/primitives')

module.id = 'AUTOCONF'

function parseConnectionConfig(config) {
    var broker = config['configuration'].broker[0] || undefined
    if(broker != undefined){
        return new ConnectionConfig(new Broker(broker.host[0],broker.port[0],broker.username[0],broker.password[0]))
    }
    return undefined
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
    parseConnectionConfig: parseConnectionConfig,
    applyAdvancedConfig: applyAdvancedConfig
}