
var fs = require('fs');
var xml2js = require('xml2js');
//var Client = require('node-rest-client').Client;
//var client = new Client();

var ROUTER = require('./modules/communication/routes')
var LOG = require('./modules/egsm-common/auxiliary/logManager')
var AUTOCONFIG = require('./modules/config/autoconfig')


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
        })
    } catch (err) {
        LOG.logSystem('FATAL', `Error while reading initialization file: ${err}`, module.id)
        return
    }
}
else if (process.argv.length <= 3) {
    LOG.logSystem('DEBUG', 'Supervisor is starting without initialization file', module.id)
}
else if (process.argv.length > 3) {
    LOG.logSystem('FATAL', 'Too many arguments! Shutting down...', module.id)
    return
}


//Apply definitions in configuration files (if exists)
//Will block until the defined number of Workers and Aggregators connect
if (typeof config != 'undefined') {
    LOG.logSystem('DEBUG', 'Applying configurations', module.id)
    AUTOCONFIG.applyConfig(config)
}

process.on('SIGINT', () => {
    LOG.logSystem('DEBUG', 'SIGINT signal caught. Shutting down supervisor...', module.id)
});
