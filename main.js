
var fs = require('fs');
var xml2js = require('xml2js');

var LOG = require('./modules/egsm-common/auxiliary/logManager')
var AUTOCONFIG = require('./modules/config/autoconfig')
var RESOURCEMAN = require('./modules/resourcemanager/resourcemanager')
var MQTTCOMM = require('./modules/communication/mqttcommunication')
var PRIM = require('./modules/egsm-common/auxiliary/primitives')
var SOCKET = require('./modules/communication/socketserver')
var LIBRARY = require('./modules/resourcemanager/processlibrary')
var DBCONFIG = require('./modules/egsm-common/database/databaseconfig')

module.id = 'MAIN'

var config = undefined
var parseString = xml2js.parseString;

DBCONFIG.initDatabaseConnection()
//DBCONFIG.initTables()

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
            AUTOCONFIG.applyBasicConfig(config)
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

//NOTE: Multi-Broker supervising is not supported yet, so only the first broker passed as argument in this function,
//all further brokers are neglected to avoid unforeseen issues
MQTTCOMM.initBrokerConnection(RESOURCEMAN.getBrokers()[0])

if(config){
    AUTOCONFIG.applyAdvancedConfig(config)
}

process.on('SIGINT', () => {
    LOG.logSystem('DEBUG', 'SIGINT signal caught. Shutting down supervisor...', module.id)
    process.exit()
});
