var WebSocketServer = require('websocket').server;
var http = require('http');
const schedule = require('node-schedule');

var LOG = require('../egsm-common/auxiliary/logManager')
var MQTTCOMM = require('./mqttcommunication')

module.id = 'SOCKET'

//Front-end module keys
const MODULE_SYSTEM_INFORMATION = 'system_information'
const MODULE_OVERVIEW = 'overview'
const MODULE_WORKER_DETAIL = 'worker_detail'
const MODULE_ENGINES = 'process_search'


var server = http.createServer(function (request, response) {
    LOG.logSystem('DEBUG', 'Received request', module.id)
    response.writeHead(404);
    response.end();
});
server.listen(8080, function () {
    console.log(' Server is listening on port 8080');
});

wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    var connection = request.accept('data-connection', request.origin);
    console.log((new Date()) + ' Connection accepted.');

    const periodicUpdaterJob = schedule.scheduleJob(' */5 * * * * *', function () {

        //Update overview module
        console.log('Sending update');
        getSystemInformationModuleUpdate().then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })
        getOverviewModuleUpdate().then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })
    });


    connection.on('message', function (message) {
        //console.log('Received: ' + JSON.parse(message.utf8Data))
        messageHandler(message.utf8Data).then((data) => {
            console.log(JSON.stringify(data))
            connection.sendUTF(JSON.stringify(data))
        })

    });

    connection.on('close', function (reasonCode, description) {
        periodicUpdaterJob.cancel()
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');

    });
});

async function messageHandler(message) {
    var response = undefined
    var msgObj = JSON.parse(JSON.parse(message))

    if (msgObj['type'] == 'update_request') {
        switch (msgObj['module']) {
            case 'overview':
                return getOverviewModuleUpdate()
            case 'system_information':
                return getSystemInformationModuleUpdate()
            case 'worker_detail':
                return getWorkerEngineList(msgObj['payload']['worker_name'])
            case 'process_search':
                return getProcessEngineList(msgObj['payload']['process_instance_id'])
        }
    }
    //return promise
}

//MODULE_SYSTEM_INFORMATION
async function getSystemInformationModuleUpdate() {
    var promise = new Promise(async function (resolve, reject) {
        var workers = await MQTTCOMM.getWorkerList()
        var aggregators = await MQTTCOMM.getAggregatorList()
        await Promise.all([workers, aggregators])

        var response = {
            module: MODULE_SYSTEM_INFORMATION,
            payload: {
                system_up_time: process.uptime(),
                worker_number: workers.length,
                aggregator_number: aggregators.length,
            }
        }
        console.log('Response:' + response)
        console.log(JSON.stringify(workers))
        resolve(response)
    });
    return promise
}

async function getOverviewModuleUpdate() {
    var promise = new Promise(async function (resolve, reject) {
        var workers = await MQTTCOMM.getWorkerList()
        var aggregators = await MQTTCOMM.getAggregatorList()
        await Promise.all([workers, aggregators])

        var response = {
            module: MODULE_OVERVIEW,
            payload: {
                workers: workers,
                aggregators: aggregators,
            }
        }
        console.log('Response:' + response)
        console.log(JSON.stringify(workers))
        resolve(response)
    });
    return promise
}

async function getWorkerEngineList(workername) {
    var promise = new Promise(async function (resolve, reject) {
        var engines = await MQTTCOMM.getWorkerEngineList(workername)
        console.log("ENGINES:")
        console.log(engines)
        await Promise.all([engines])
        var response = {
            module: MODULE_WORKER_DETAIL,
            payload: {
                engines: engines,
            }
        }
        resolve(response)
    });
    return promise
}

async function getProcessEngineList(process_instance_id) {
    var promise = new Promise(async function (resolve, reject) {
        var engines = await MQTTCOMM.searchForProcess(process_instance_id)
        console.log("ENGINES:")
        console.log(engines)
        await Promise.all([engines])
        var response = {
            module: MODULE_ENGINES,
            payload: {
                engines: engines,
            }
        }
        resolve(response)
    });
    return promise
}