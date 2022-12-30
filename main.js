
var fs = require('fs');
var xml2js = require('xml2js');

var LOG = require('./modules/egsm-common/auxiliary/logManager')
var AUTOCONFIG = require('./modules/config/autoconfig')
var MQTTCOMM = require('./modules/communication/mqttcommunication')
var SOCKET = require('./modules/communication/socketserver')
var LIBRARY = require('./modules/resourcemanager/processlibrary')
var DBCONFIG = require('./modules/egsm-common/database/databaseconfig');
const { Broker } = require('./modules/egsm-common/auxiliary/primitives');

module.id = 'MAIN'

var config = undefined
var BROKER = undefined
var defaultBroker = new Broker('localhost', 1883, '', '')
var parseString = xml2js.parseString;

DBCONFIG.initDatabaseConnection('localhost',9000,'local','fakeMyKeyId','fakeSecretAccessKey')

//DBCONFIG.deleteTables()
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
            BROKER = AUTOCONFIG.parseConnectionConfig(config) || defaultBroker
        })
    } catch (err) {
        LOG.logSystem('FATAL', `Error while reading initialization file: ${err}`, module.id)
        return
    }
}
else if (process.argv.length <= 3) {
    LOG.logSystem('DEBUG', 'Supervisor is starting without initialization file', module.id)
    LOG.logSystem('DEBUG', 'Applying default MQTT broker settings', module.id)
    BROKER = defaultBroker
}
else if (process.argv.length > 3) {
    LOG.logSystem('FATAL', 'Too many arguments! Shutting down...', module.id)
    return
}

MQTTCOMM.initBrokerConnection(BROKER)

if (config) {
    AUTOCONFIG.applyAdvancedConfig(config)
}

process.on('SIGINT', () => {
    LOG.logSystem('DEBUG', 'SIGINT signal caught. Shutting down supervisor...', module.id)
    process.exit()
});
