/**
 * Interface for the frontend application
 * The module starts a websocket server the frontend application can connect to, all communication is happening through this
 */
var UUID = require("uuid");
var WebSocketServer = require('websocket').server;
var http = require('http');
const schedule = require('node-schedule');

var LOG = require('../egsm-common/auxiliary/logManager');
var PROCESSLIB = require('../resourcemanager/processlibrary');
var MQTTCOMM = require('./mqttcommunication')
var DDB = require('../egsm-common/database/databaseconnector');
const { createNewJob } = require("./mqttcommunication");

module.id = 'SOCKET'

const SOCKET_PORT = 8080
const OVERVIEW_UPDATE_PERIOD = 5 //Update period in secs of Overview and System Information frontend modules

//Front-end module keys
const MODULE_SYSTEM_INFORMATION = 'system_information'
const MODULE_OVERVIEW = 'overview'
const MODULE_WORKER_DETAIL = 'worker_detail'
const MODULE_ENGINES = 'process_operation'
const MODULE_PROCESS_LIBRARY = 'process_library'
const MODULE_NEW_PROCESS_INSTANCE = 'new_process_instance'
const MODULE_ARTIFACTS = 'artifact_detail'
const MODULE_STAKEHOLDERS = 'stakeholder_detail'
const MODULE_NOTIFICATIONS = 'notifications'
const MODULE_NEW_PROCESS_GROUP = 'new_process_group'
const MODULE_AGGREGATORS = 'aggregators'

/**
 * The websocket server
 */
var sessions = new Map() //session_id -> session related data

var server = http.createServer(function (request, response) {
    LOG.logSystem('DEBUG', 'Received request', module.id)
    response.writeHead(404);
    response.end();
});
server.listen(SOCKET_PORT, function () {
    LOG.logSystem('DEBUG', `Socket Server is listening on port ${SOCKET_PORT}`, module.id)
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        LOG.logSystem('DEBUG', `Connection from origin ${request.origin} rejected`, module.id)
        return;
    }

    var connection = request.accept('data-connection', request.origin);
    LOG.logSystem('DEBUG', `Connection from origin ${request.origin} accepted`, module.id)
    //Object to store session data
    var sessionId = UUID.v4()
    sessions.set(sessionId, {
        connection: connection,
        subscriptions: new Set()
    })

    //Update System Information and Overview module periodically
    const periodicUpdaterJob = schedule.scheduleJob(` */${OVERVIEW_UPDATE_PERIOD} * * * * *`, function () {
        LOG.logSystem('DEBUG', `Sending update to Overview and System Information module`, module.id)
        getSystemInformationModuleUpdate().then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })
        getOverviewModuleUpdate().then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })
    });

    connection.on('message', function (message) {
        LOG.logSystem('DEBUG', `Message received`, module.id)
        messageHandler(message.utf8Data, sessionId).then((data) => {
            connection.sendUTF(JSON.stringify(data))
        })

    });

    connection.on('close', function (reasonCode, description) {
        periodicUpdaterJob.cancel()
        //Cancel session related subscriptions
        sessions.get(sessionId).subscriptions.forEach(subscription => {
            MQTTCOMM.unsubscribeNotificationTopic('notification/' + subscription)
        });
        sessions.delete(sessionId)

        LOG.logSystem('DEBUG', `Peer ${connection.remoteAddress} disconnected`, module.id)
    });
});

MQTTCOMM.EVENT_EMITTER.on('notification', (topic, message) => {
    console.log('NOTIFICATION')
    for (let [key, value] of sessions) {
        value.subscriptions.forEach(subscription => {
            if (subscription == topic.replace('notification/', '')) {
                console.log('send update')
                value.connection.sendUTF(JSON.stringify(message))
            }
        });
    }
});

/**
 * Main messagehandler function
 * Calls the necessary functions the execute the requests
 * @param {Object} message Message object from frontend 
 * @returns A promise to the response message
 */
async function messageHandler(message, sessionid) {
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
                if (msgObj['payload']['type'] == 'process_type_list') {
                    return getProcessTypeList()
                }
                else if (msgObj['payload']['type'] == 'get_process_group') {
                    return readProcessGroup(msgObj['payload']['process_goup_id'])
                }
            case MODULE_ARTIFACTS:
                if (msgObj['payload']['type'] == 'search') {
                    return getArtifact(msgObj['payload']['artifact_type'], msgObj['payload']['artifact_id'])
                }
            case MODULE_STAKEHOLDERS:
                return getStakeholder(msgObj['payload']['stakeholder_name'])
            case MODULE_NOTIFICATIONS:
                if (msgObj['payload']['type'] == 'get_stakeholder_list') {
                    return getStakeholderList()
                }
                else if (msgObj['payload']['type'] == 'get_past_notifications') {
                    return getPastNotifications(msgObj['payload']['stakeholders'])
                }
                else if (msgObj['payload']['type'] == 'subscribe_notifications') {
                    return setNotificationSubscriptions(msgObj['payload']['stakeholders'], sessionid)
                }
        }
    }
    else if (msgObj['type'] == 'command') {
        switch (msgObj['module']) {
            case MODULE_NEW_PROCESS_INSTANCE:
                return await createProcessInstance(msgObj['payload']['process_type'], msgObj['payload']['instance_name'], msgObj['payload']['bpmn_job_start'])
            //case MODULE_NEW_AGGREGATOR_INSTANCE:

            case MODULE_ENGINES:
                return deleteProcessInstance(msgObj['payload']['process_type'], msgObj['payload']['process_instance_id'])
            case MODULE_ARTIFACTS:
                if (msgObj['payload']['type'] == 'create') {
                    return createNewArtifact(msgObj['payload']['artifact'])
                }
                else if (msgObj['payload']['type'] == 'delete') {
                    //TODO
                }
            case MODULE_STAKEHOLDERS:
                if (msgObj['payload']['type'] == 'create') {
                    return createNewStakeholder(msgObj['payload']['stakeholder_name'])
                }
            case MODULE_NEW_PROCESS_GROUP:
                if (msgObj['payload']['type'] == 'create') {
                    return createNewProcessGroup(msgObj['payload']['group_id'], msgObj['payload']['rules'])
                }
            case MODULE_AGGREGATORS:
                if (msgObj['payload']['type'] == 'create') {
                    return createJobInstance(msgObj['payload']['job_id'], msgObj['payload']['job_definition'])
                }
        }
    }
}

/**
 * Handles update requests from MODULE_SYSTEM_INFORMATION
 * @returns Promise containing the response message
 */
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
        resolve(response)
    });
    return promise
}

/**
 * Handles update requests from MODULE_OVERVIEW
 * @returns Promise containing the response message
 */
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
        resolve(response)
    });
    return promise
}

/**
 * Returns the array of engines deployed on the Worker specified as argument
 * @param {String} workername 
 * @returns Promise will contain array of Engines (empty array in case of no engine)
 */
async function getWorkerEngineList(workername) {
    var promise = new Promise(async function (resolve, reject) {
        var engines = await MQTTCOMM.getWorkerEngineList(workername)
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

/**
 * Returns the array of engines related to the process specified by the argument
 * @param {*} process_instance_id Process instance ID (NOT ENGINE ID)
 * @returns  Promise will contain array of Engines (empty array in case of no engine)
 */
async function getProcessEngineList(process_instance_id) {
    var promise = new Promise(async function (resolve, reject) {
        var engines = await MQTTCOMM.searchForProcess(process_instance_id)
        await Promise.all([engines])
        var response = {
            module: MODULE_ENGINES,
            payload: {
                engines: engines
            }
        }
        resolve(response)
    });
    return promise
}

/**
 * Deletes all engines belonging to the specified process instance
 * @param {string} process_instance_id 
 * @returns Promise to the result of the operation
 */
async function deleteProcessInstance(process_type, process_instance_id) {
    var promise = new Promise(async function (resolve, reject) {
        MQTTCOMM.deleteProcess(process_instance_id).then((result) => {
            var response = {
                module: MODULE_ENGINES,
                payload: {
                    delete_result: result,
                }
            }
            MQTTCOMM.publishProcessLifecycleEvent('destructed', process_instance_id, process_type)
            resolve(response)
        })
    });
    return promise
}

/**
 * Get list of available Process Type definitions
 * @returns Promise to the array of Process types
 */
function getProcessTypeList() {
    var promise = new Promise(async function (resolve, reject) {
        var response = {
            module: MODULE_PROCESS_LIBRARY,
            payload: {
                type: 'process_type_list',
                process_types: PROCESSLIB.getProcessTypeList(),
            }
        }
        resolve(response)
    });
    return promise
}

function readProcessGroup(processgroupname) {
    var promise = new Promise(async function (resolve, reject) {
        DDB.readProcessGroup(processgroupname).then((processgroup) => {
            var response = {
                module: MODULE_PROCESS_LIBRARY,
                payload: {
                    type: 'get_process_group',
                    result: "not_found"
                }
            }
            if (processgroup) {
                response.payload.result = 'found'
                response.payload.process_group = processgroup
            }
            console.log(JSON.stringify(response))
            resolve(response)
        })
    });
    return promise
}

function getArtifact(artifact_type, artifact_id) {
    var promise = new Promise(async function (resolve, reject) {
        DDB.readArtifactDefinition(artifact_type, artifact_id).then((artifact) => {
            var response = {
                module: MODULE_ARTIFACTS,
                payload: {
                    type: 'search',
                    result: "not_found"
                }
            }
            if (artifact) {
                response.payload.result = 'found'
                response.payload.artifact = artifact
            }
            console.log(JSON.stringify(response))
            resolve(response)
        })
    });
    return promise
}

function getStakeholder(stakeholder_name) {
    var promise = new Promise(async function (resolve, reject) {
        DDB.readStakeholder(stakeholder_name).then((stakeholder) => {
            var response = {
                module: MODULE_STAKEHOLDERS,
                payload: {
                    type: 'search',
                    result: "not_found"
                }
            }
            if (stakeholder) {
                response.payload.result = 'found'
                response.payload.stakeholder = stakeholder
            }
            resolve(response)
        })
    });
    return promise
}

function getStakeholderList() {
    var promise = new Promise(async function (resolve, reject) {
        DDB.readAllStakeholder().then((stakeholderList) => {
            var response = {
                module: MODULE_NOTIFICATIONS,
                payload: {
                    type: 'stakeholder_list',
                    stakeholder_list: stakeholderList,
                    result: "ok"
                }
            }
            resolve(response)
        })
    });
    return promise
}

//TODO notifications are currently not logged into database
function getPastNotifications(stakeholders) {
    var promise = new Promise(async function (resolve, reject) {
        var promises = []
        //DDB.read


        DDB.readAllStakeholder().then((notification_list) => {
            var response = {
                module: MODULE_NOTIFICATIONS,
                payload: {
                    type: 'get_past_notifications',
                    notification_list: [],//notification_list,
                    result: "ok"
                }
            }
            resolve(response)
        })
    });
    return promise
}

function setNotificationSubscriptions(stakeholders, sessionid) {
    console.log(sessions)
    var promise = new Promise(async function (resolve, reject) {
        var newStakeholders = new Set(stakeholders)
        //unsubscribe from topics which has locally but not in stakeholders
        sessions.get(sessionid).subscriptions.forEach(element => {
            if (!newStakeholders.has(element)) {
                sessions.get(sessionid).subscriptions.delete(element)
                MQTTCOMM.unsubscribeNotificationTopic('notification/' + element)
            }
        });

        stakeholders.forEach(stakeholder => {
            if (!sessions.get(sessionid).subscriptions.has(stakeholder)) {
                sessions.get(sessionid).subscriptions.add(stakeholder)
                MQTTCOMM.subscribeNotificationTopic('notification/' + stakeholder)
            }
        });
        var response = {
            module: MODULE_NOTIFICATIONS,
            payload: {
                type: 'ok',
            }
        }
        resolve(response)
    });
    return promise
}

async function createNewArtifact(artifact,) {
    var promise = new Promise(async function (resolve, reject) {
        var response = {
            module: MODULE_ARTIFACTS,
            payload: {
                type: 'create',
            }
        }
        DDB.readArtifactDefinition(artifact.type, artifact.id).then((result) => {
            if (result != undefined) {
                response.payload.result = 'already_exists'
                resolve(response)
                return
            }
            else {
                DDB.writeNewArtifactDefinition(artifact.type, artifact.id, artifact.stakeholders, artifact.host, artifact.port).then((result) => {
                    console.log(result)
                    if (result == 'error') {
                        response.payload.result = 'backend_error'
                    }
                    else {
                        response.payload.result = 'created'
                    }
                    console.log(JSON.stringify(response))
                    resolve(response)
                })
            }
        })
    });
    return promise
}

async function createNewStakeholder(stakeholder_name) {
    var promise = new Promise(async function (resolve, reject) {
        var response = {
            module: MODULE_STAKEHOLDERS,
            payload: {
                type: 'create',
            }
        }
        DDB.readStakeholder(stakeholder_name).then((result) => {
            if (result != undefined) {
                response.payload.result = 'already_exists'
                resolve(response)
                return
            }
            else {
                DDB.writeNewStakeholder(stakeholder_name, '').then((result) => {
                    //console.log(result)
                    if (result == 'error') {
                        response.payload.result = 'backend_error'
                    }
                    else {
                        response.payload.result = 'created'
                    }
                    console.log(JSON.stringify(response))
                    resolve(response)
                })
            }
        })
    });
    return promise
}

async function createNewProcessGroup(group_id, rules) {
    var promise = new Promise(async function (resolve, reject) {
        var response = {
            module: MODULE_NEW_PROCESS_GROUP,
            payload: {
                type: 'create',
            }
        }
        DDB.readProcessGroup(group_id).then((result) => {
            if (result != undefined) {
                response.payload.result = 'already_exists'
                resolve(response)
                return
            }
            else {
                DDB.writeNewProcessGroup(group_id, JSON.stringify(rules)).then((result) => {
                    //console.log(result)
                    if (result == 'error') {
                        response.payload.result = 'backend_error'
                    }
                    else {
                        response.payload.result = 'created'
                    }
                    console.log(JSON.stringify(response))
                    resolve(response)
                })
            }
        })
    });
    return promise
}

/**
 * Creates a new Process Instance. It will create at least one eGSM engines on random Workers
 * If the process has multiple perspectives, it will create multiple eGSM engines (maybe not on the same Worker)
 * @param {String} process_type Type of the process (need to be defined in the library module in advance)
 * @param {String} instance_name Process instance name
 * @param {Boolean} bpmnJob True if creation of BPMN Model Job is required
 * @returns Promise will become 'ok' if the creation was successfull 'id_not_free' if the ID is already used
 */
async function createProcessInstance(process_type, instance_name, bpmn_job) {
    var promise = new Promise(async function (resolve, reject) {
        MQTTCOMM.searchForProcess(instance_name).then(async (result) => {
            var response = {
                module: MODULE_NEW_PROCESS_INSTANCE,
                payload: {
                    result: 'backend_error',
                }
            }
            if (result.length > 0) {
                response.payload.result = "id_not_free"
                resolve(response)
            }
            else {
                var processDetails = PROCESSLIB.getProcessType(process_type)
                //var promises = []
                var creation_results = []
                processDetails['perspectives'].forEach(async element => {
                    var engineName = process_type + '/' + instance_name + '__' + element['name']
                    creation_results.push(MQTTCOMM.createNewEngine(engineName, element['info_model'], element['egsm_model'], element['bindings'], [...processDetails.stakeholders]))
                });

                await Promise.all(creation_results).then(async (promise_array) => {
                    var aggregatedResult = true
                    promise_array.forEach(element => {
                        if (element != "created") {
                            aggregatedResult = false
                        }
                    });
                    var job_results = []
                    if (aggregatedResult && bpmn_job) {
                        console.log('create_job')
                        processDetails['perspectives'].forEach(async element => {
                            var jobId = process_type + '/' + instance_name + '__' + element['name'] + '/bpmn_job'
                            job_results.push(createJobInstance(jobId, {}))
                        });
                    }
                    await Promise.all(job_results).then((job_creation_results) => {
                        console.log(JSON.stringify(job_creation_results))
                        var jobAggregatedResult = true
                        job_creation_results.forEach(element => {
                            if (element.payload.result != "created") {
                                jobAggregatedResult = false
                            }
                        });
                        if (aggregatedResult && jobAggregatedResult) {
                            response.payload.result = "ok"
                            //Publish message to 'lifecycle' topic to notify aggregators about the new instnace
                            DDB.writeNewProcessInstance(process_type, instance_name, [...processDetails.stakeholders], Date.now() / 1000, 'localhost', 1883)
                            MQTTCOMM.publishProcessLifecycleEvent('created', instance_name, process_type, [...processDetails.stakeholders])
                            resolve(response)
                        }
                        //Engines are created, but the requested related jobs are not ok
                        else if (aggregatedResult && !jobAggregatedResult) {
                            response.payload.result = "engines_ok"
                            //Publish message to 'lifecycle' topic to notify aggregators about the new instnace
                            DDB.writeNewProcessInstance(process_type, instance_name, [...processDetails.stakeholders], Date.now() / 1000, 'localhost', 1883)
                            MQTTCOMM.publishProcessLifecycleEvent('created', instance_name, process_type, [...processDetails.stakeholders])
                            resolve(response)
                        }
                        else {
                            response.payload.result = "backend_error"
                            //Make sure we clean up in case any member engine has been created
                            deleteProcessInstance(process_type, instance_name).then(() => {
                                resolve(response)
                            })
                        }
                    })

                })
            }
        })
    })
    return promise
}

function createJobInstance(jobid, jobconfig) {
    var promise = new Promise(async function (resolve, reject) {
        MQTTCOMM.searchForJob(jobid).then(async (result) => {
            var response = {
                module: MODULE_NEW_PROCESS_INSTANCE,
                payload: {
                    type:'create',
                    result: 'backend_error',
                }
            }
            console.log('search result')
            if (result != 'not_found') {
                response.payload.result = "id_not_free"
                return resolve(response)
            }
            console.log('creation')
            jobconfig['id'] = jobid
            var result = await MQTTCOMM.createNewJob(jobconfig)
            console.log('created: ' + result)
            response.payload.result = result
            return resolve(response)


        })
    })
    return promise
}

// NOTE: Most functions of the module are intended to use internally only, although some functions are
// exposed for auxiliary modules (e.g.: autoconfig) to avoid code duplication
module.exports = {
    createProcessInstance: createProcessInstance
}