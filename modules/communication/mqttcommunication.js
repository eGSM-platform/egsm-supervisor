var MQTT = require('../egsm-common/communication/mqttconnector')
var AUX = require('../egsm-common/auxiliary/auxiliary')
var LOG = require('../egsm-common/auxiliary/logManager')

//Topic definitions
const TOPIC_IN_WORKER = 'supervisor_woker_in'
const TOPIC_OUT_WORKER = 'supervisor_worker_out'

const TOPIC_IN_AGGREGATOR = 'supervisor_aggregator_in'
const TOPIC_OUT_AGGREGATOR = 'supervisor_aggregator_out'

var BROKER = undefined

const FREE_SLOT_WAITING_PERIOD = 500
const ENGINE_SEARCH_WAITING_PERIOD = 500
const ENGINE_PONG_WAITING_PERIOD = 500

const AGGREGATOR_PONG_WAITING_PERIOD = 500

var REQUEST_PROMISES = new Map() //Request id -> resolve references
var REQUEST_BUFFERS = new Map() //Request id -> Usage specific storage place (used only for specific type of requests)

module.id = 'MQTTCOMM'

/*Message body may contain:
-sender_type: WORKER/AGGREGATOR
-sender_id: <string>
-message_type: PONG/PING/NEW_WORKER/NEW_ENGINE_SLOT/NEW_ENGINE_SLOT_RESP/NEW_ENGINE/SEARCH
-request_id: <string> (optional if no response expected)
-payload: <string>
*/

/**
 * Message handler function for MQTT messages
 * It neglects the messages not intended to handle in this module
 */
function onMessageReceived(hostname, port, topic, message) {
    LOG.logSystem('DEBUG', 'onMessageReceived function called', module.id)
    var msgJson = JSON.parse(message.toString())
    if (topic == TOPIC_IN_WORKER) {
        switch (msgJson['message_type']) {
            case 'NEW_ENGINE_SLOT_RESP':
                LOG.logSystem('DEBUG', `NEW_ENGINE_SLOT_RESP message received, request_id: [${msgJson['request_id']}]`, module.id)
                //Here several messages are expected and only the fastest one will be handled
                //All the further messages will be neglected
                if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                    REQUEST_PROMISES.get(msgJson['request_id'])(msgJson['sender_id'])
                    REQUEST_PROMISES.delete(msgJson['request_id'])
                }
                break;
            case 'PONG':
                LOG.logSystem('DEBUG', `PONG engine message received, request_id: [${msgJson['request_id']}]`, module.id)
                if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                    if (REQUEST_BUFFERS.has(msgJson['request_id'])) {
                        var filteredMessage = {
                            worker: msgJson['sender_id'],
                            hostname: msgJson['payload']['hostname'],
                            port: msgJson['payload']['port']
                        }
                        REQUEST_BUFFERS.get(msgJson['request_id']).push(filteredMessage)
                    }
                }
                break;
            case 'SEARCH':
                LOG.logSystem('DEBUG', `SEARCH engine message received, request_id: [${msgJson['request_id']}]`, module.id)
                if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                    REQUEST_PROMISES.get(msgJson['request_id'])(msgJson)
                    REQUEST_PROMISES.delete(msgJson['request_id'])
                }
                break;
        }
    }
    else if (topic == TOPIC_IN_AGGREGATOR) {
        switch (msgJson['message_type']) {
            case 'PONG':
                LOG.logSystem('DEBUG', `PONG aggregator message received, request_id: [${msgJson['request_id']}]`, module.id)
        }
    }
    else {

    }
}

/**
 * Inits mqqt broker connection and subscribes to the necessary topics to start operation
 * @param {Broker} broker Broker the supervisor should use to reach out to the managed workers and aggregators
 */
function initBrokerConnection(broker) {
    BROKER = broker
    LOG.logSystem('DEBUG', `initBrokerConnection function called`, module.id)

    MQTT.init(onMessageReceived)
    MQTT.createConnection(BROKER.host, BROKER.port, BROKER.username, BROKER.password)
    MQTT.subscribeTopic(BROKER.host, BROKER.port, TOPIC_IN_WORKER)

    LOG.logSystem('DEBUG', `initBrokerConnection function ran successfully`, module.id)
}

/**
 * Helper function to perform waiting for responses
 * @param {Number} delay Delay period in millis 
 */
async function wait(delay) {
    await AUX.sleep(delay)
}

/**
 * Intended to find a free engine slot on any worker instance
 * @returns Returns with a promise whose value will be 'no_response' in case of no free slot found and 
 * it will contain the ID of a Worker with a free slot otherwise
 */
async function getFreeEngineSlot() {
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'NEW_ENGINE_SLOT'
    }
    MQTT.publishTopic(BROKER.host, BROKER.port, TOPIC_OUT_WORKER, JSON.stringify(message))

    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        wait(FREE_SLOT_WAITING_PERIOD).then(() => {
            resolve('no_response')
        })
    });
    return promise
}

/**
 * Creates a new engine on a random Worker which has at least one free engine slot
 * @param {String} engineid ID of the new engine
 * @param {Broker} broker Broker on which the engine has the necessary artifacts
 * @param {String} informal_model
 * @param {String} process_model 
 * @param {String} eventRouterConfig 
 */
function createNewEngine(engineid, broker, informal_model, process_model, eventRouterConfig) {
    LOG.logSystem('DEBUG', `createNewEngine function called with engine ID: [${engineid}]`, module.id)
    getFreeEngineSlot().then((value) => {
        if (value != 'no_response') {
            LOG.logSystem('DEBUG', `Free engine slot found on Worker: [${value}]`, module.id)
            var msgPayload = {
                "engine_id": engineid,
                "mqtt_broker": broker.host,
                "mqtt_port": broker.port,
                "mqtt_user": broker.username,
                "mqtt_password": broker.password,
                "informal_model": informal_model,
                "process_model": process_model,
                "event_router_config": eventRouterConfig
            }
            var requestId = 'random' //TODO UUID.v4();
            var message = {
                request_id: requestId,
                message_type: 'NEW_ENGINE',
                payload: msgPayload
            }
            MQTT.publishTopic(BROKER.host, BROKER.port, TOPIC_WORKER_STATIC + value, JSON.stringify(message))
        }
        else {
            LOG.logSystem('WARNING', `No free engine slot found`, module.id)
        }
    })
}

/**
 * Finds the location of a specified engine instance
 * @param {String} engineid Engine id of the engine intended to be found
 * @returns A PRomise, which contains the Worker ID, its hostname and RESP API port number, where the engine is placed,
 * If not found its value will be 'not_found' 
 */
async function searchForEngine(engineid) {
    LOG.logSystem('DEBUG', `Searching for Engine [${engineid}]`, module.id)
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'SEARCH',
        "payload": { "engine_id": engineid }
    }
    MQTT.publishTopic(BROKER.host, BROKER.port, TOPIC_OUT_WORKER, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        wait(ENGINE_SEARCH_WAITING_PERIOD).then(() => {
            resolve('not_found')
        })
    });
    return promise
}

/**
 * Returns the list of online Worker instances
 * @returns Returns a promise, which will contain the list of Workers after ENGINE_PONG_WAITING_PERIOD
 */
async function getWorkerList() {
    LOG.logSystem('DEBUG', `getWorkerList function called`, module.id)
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'PING'
    }
    MQTT.publishTopic(BROKER.host, BROKER.port, TOPIC_OUT_WORKER, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        REQUEST_BUFFERS.set(request_id, [])
        wait(ENGINE_PONG_WAITING_PERIOD).then(() => {
            LOG.logSystem('DEBUG', `getWorkerList waiting period elapsed`, module.id)
            var result = REQUEST_BUFFERS.get(request_id)
            REQUEST_PROMISES.delete(request_id)
            REQUEST_BUFFERS.delete(request_id)
            resolve(result)
        })
    });
    return promise
}


//Aggregator-related functions
function createNewMonitoringActivity() {
    //TODO
}

/**
 * Returns the list of online Aggregator instances
 * @returns Returns a promise, which will contain the list of Aggregator after AGGREGATOR_PONG_WAITING_PERIOD
 */
async function getAggregatorList() {
    LOG.logSystem('DEBUG', `getAggregatorList function called`, module.id)
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'PING'
    }
    MQTT.publishTopic(BROKER.host, BROKER.port, TOPIC_OUT_AGGREGATOR, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        REQUEST_BUFFERS.set(request_id, [])
        wait(AGGREGATOR_PONG_WAITING_PERIOD).then(() => {
            LOG.logSystem('DEBUG', `getAggregatorList waiting period elapsed`, module.id)
            var result = REQUEST_BUFFERS.get(request_id)
            REQUEST_PROMISES.delete(request_id)
            REQUEST_BUFFERS.delete(request_id)
            resolve(result)
        })
    });
    return promise
}


module.exports = {
    initBrokerConnection: initBrokerConnection,

    createNewEngine: createNewEngine,
    searchForEngine: searchForEngine,
    getWorkerList: getWorkerList,

    createNewMonitoringActivity: createNewMonitoringActivity,
    getAggregatorList: getAggregatorList
}