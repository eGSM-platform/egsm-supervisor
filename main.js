
var fs = require('fs');
var xml2js = require('xml2js');

var ROUTER = require('./modules/communication/routes')
var LOG = require('./modules/egsm-common/auxiliary/logManager')
var AUTOCONFIG = require('./modules/config/autoconfig')
var RESOURCEMAN = require('./modules/resourcemanager/resourcemanager')
var MQTTCOMM = require('./modules/communication/mqttcommunication')
var PRIM = require('./modules/egsm-common/auxiliary/primitives')


module.id = 'MAIN'

var config = undefined
var parseString = xml2js.parseString;

LOG.logSystem('DEBUG', 'Supervisor started', module.id)
if (process.argv.length == 3) {
    LOG.logSystem('DEBUG', 'Supervisor starting with initialization file', module.id)
    try {
        const data = fs.readFileSync(process.argv[2], 'utf8');
        LOG.logSystem('DEBUG', 'Initialization file read', module.id)

        parseString(data, function (err, result) {
            if (err) {
                LOG.logSystem('FATAL', `Error while parsing initialization file: ${err}`, module.id)
            }
            config = result
            LOG.logSystem('DEBUG', 'Applying configurations', module.id)
            AUTOCONFIG.applyConfig(config)
        })
    } catch (err) {
        LOG.logSystem('FATAL', `Error while reading initialization file: ${err}`, module.id)
        return
    }
}
else if (process.argv.length <= 3) {
    LOG.logSystem('DEBUG', 'Supervisor is starting without initialization file', module.id)
    LOG.logSystem('DEBUG', 'Applying default MQTT broker settings', module.id)
    if (!RESOURCEMAN.registerBroker('localhost', 1883, '', '')) {
        LOG.logSystem('FATAL', 'Could not perform default config', module.id)
    }

}
else if (process.argv.length > 3) {
    LOG.logSystem('FATAL', 'Too many arguments! Shutting down...', module.id)
    return
}

RESOURCEMAN.getBrokers().forEach(element => {
    MQTTCOMM.initBrokerConnection(element)
});

process.on('SIGINT', () => {
    LOG.logSystem('DEBUG', 'SIGINT signal caught. Shutting down supervisor...', module.id)
});


/*try {
    const informal = fs.readFileSync('./data/infoModel_vm.xsd', 'utf8');
    const process = fs.readFileSync('./data/egsm_vm.xml', 'utf8');
    const eventr = fs.readFileSync('./data/binding_vm.xml', 'utf8');
    var broker = new PRIM.Broker('localhost', 1883, '', '')
    MQTTCOMM.createNewEngine('engine1', broker, informal, process, eventr)
} catch (err) {
    console.error(err);
}*/

/*MQTTCOMM.searchForEngine('engine1').then((result)=>{
    console.log('final: ' + JSON.stringify(result))
})*/

MQTTCOMM.getAggregatorList().then((result)=>{
    console.log(result)
})
