var WebSocketServer = require('websocket').server;
var http = require('http');
const schedule = require('node-schedule');

var LOG = require('../egsm-common/auxiliary/logManager');
var PROCESSLIB = require('../resourcemanager/processlibrary');
var MQTTCOMM = require('./mqttcommunication')

module.id = 'SOCKET'

//Front-end module keys
const MODULE_SYSTEM_INFORMATION = 'system_information'
const MODULE_OVERVIEW = 'overview'
const MODULE_WORKER_DETAIL = 'worker_detail'
const MODULE_ENGINES = 'process_search'
const MODULE_PROCESS_LIBRARY = 'process_library'
const MODULE_NEW_PROCESS_INSTANCE = 'new_process_instance'


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
            case MODULE_OVERVIEW:
                return getOverviewModuleUpdate()
            case MODULE_SYSTEM_INFORMATION:
                return getSystemInformationModuleUpdate()
            case MODULE_WORKER_DETAIL:
                return getWorkerEngineList(msgObj['payload']['worker_name'])
            case MODULE_ENGINES:
                return getProcessEngineList(msgObj['payload']['process_instance_id'])
            case MODULE_PROCESS_LIBRARY:
                return getProcessTypeList()
        }
    }
    else if (msgObj['type'] == 'command') {
        switch (msgObj['module']) {
            case MODULE_NEW_PROCESS_INSTANCE:
                return createProcessInstance(msgObj['payload']['process_type'], msgObj['payload']['instance_name'])
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

function getProcessTypeList() {
    var promise = new Promise(async function (resolve, reject) {
        var response = {
            module: MODULE_PROCESS_LIBRARY,
            payload: {
                process_types: PROCESSLIB.getProcessTypeList(),
            }
        }
        resolve(response)
    });
    return promise
}

async function createProcessInstance(process_type, instance_name, bpmnJob = false) {
    var promise = new Promise(async function (resolve, reject) {
        MQTTCOMM.searchForProcess(instance_name).then((result) => {
            console.log("RESULT")
            console.log(result)
            if (result.length > 0) {
                var response = {
                    module: MODULE_NEW_PROCESS_INSTANCE,
                    payload: {
                        result: 'id_not_free',
                    }
                }
                resolve(response)
            }
            else {
                var processDetails = PROCESSLIB.getProcessType(process_type)
                processDetails['perspectives'].forEach(element => {
                    var engineName = process_type + '__' + instance_name + '__' + element['name']
                    MQTTCOMM.createNewEngine(engineName, element['info_model'], element['egsm_model'], element['bindings'])
                    console.log('engine_created')
                });

                if (bpmnJob) {
                    //TODO: Initiate BPMN job here
                }
                var response = {
                    module: MODULE_NEW_PROCESS_INSTANCE,
                    payload: {
                        result: 'ok',
                    }
                }
                resolve(response)
            }
        })

    })
    return promise
}

module.exports = {
    createProcessInstance: createProcessInstance
}