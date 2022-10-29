var MQTT = require('../egsm-common/communication/mqttconnector')
var AUX = require('../egsm-common/auxiliary/auxiliary')

//Topic definitions
const TOPIC_IN_WORKER = 'supervisor_woker_in'
const TOPIC_OUT_WORKER = 'supervisor_worker_out'

const TOPIC_IN_AGGREGATOR = 'supervisor_aggregator_in'
const TOPIC_OUT_AGGREGATOR = 'supervisor_aggregator_out'

var MQTT_HOST = undefined
var MQTT_PORT = undefined;
var MQTT_USER = undefined;
var MQTT_USER_PW = undefined

const FREE_SLOT_WAITING_PERIOD = 2500
const ENGINE_SEARCH_WAITING_PERIOD = 2500
const ENGINE_PONG_WAITING_PERIOD = 2500

const AGGREGATOR_PONG_WAITING_PERIOD = 2500

var REQUEST_PROMISES = new Map() //Request id -> resolve references
var REQUEST_BUFFERS = new Map() //Request id -> Usage specific storage place (used only for specific type of requests)

/*Message body contains:
-sender_type: WORKER/AGGREGATOR
-sender_id: <string>
-message_type: PONG/PING/NEW_WORKER/NEW_ENGINE_SLOT/NEW_ENGINE_SLOT_RESP/NEW_ENGINE/SEARCH
-request_id: <string> (optional if no response expected)
-payload: <string>
*/
function onMessageReceived(hostname, port, topic, message) {
    var msgJson = JSON.parse(message.toString())
    if (topic == TOPIC_IN_WORKER) {
        switch (msgJson['message_type']) {
            case 'NEW_ENGINE_SLOT_RESP':
                //Here several messages are expected and only the fastest one will be handled
                //All the further messages will be neglected
                if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                    REQUEST_PROMISES.get(msgJson['request_id'])(msgJson['sender_id'])
                    REQUEST_PROMISES.delete(msgJson['request_id'])
                }
                break;
            case 'PONG':
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

        }
    }
    else {

    }
}

function initBrokerConnection(broker) {
    MQTT_HOST = broker.host
    MQTT_PORT = broker.port
    MQTT_USER = broker.username
    MQTT_USER_PW = broker.password

    MQTT.init(onMessageReceived)
    MQTT.createConnection(MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_USER_PW)
    MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, TOPIC_IN_WORKER)
}

async function wait(delay) {
    await AUX.sleep(delay)
}

async function getFreeEngineSlot() {
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'NEW_ENGINE_SLOT'
    }
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_OUT_WORKER, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        wait(FREE_SLOT_WAITING_PERIOD).then(() => {
            resolve('no_response')
        })
    });
    return promise
}

function createNewEngine(engineid, broker, informal_model, process_model, eventRouterConfig) {
    getFreeEngineSlot().then((value) => {
        if (value != 'no_response') {
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
            MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_WORKER_STATIC + value, JSON.stringify(message))
        }
        else {
            console.log('no free slot')
        }
    })
}

async function searchForEngine(engineid) {
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'SEARCH',
        "payload": { "engine_id": engineid }
    }
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_OUT_WORKER, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        wait(ENGINE_SEARCH_WAITING_PERIOD).then(() => {
            resolve('not_found')
        })
    });
    return promise
}

async function getWorkerList() {
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'PING'
    }
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_OUT_WORKER, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        REQUEST_BUFFERS.set(request_id, [])
        wait(ENGINE_PONG_WAITING_PERIOD).then(() => {
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

async function getAggregatorList() {
    var request_id = 'random' //TODO UUID.v4();
    var message = {
        "request_id": request_id,
        "message_type": 'PING'
    }
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_OUT_AGGREGATOR, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)
        REQUEST_BUFFERS.set(request_id, [])
        wait(AGGREGATOR_PONG_WAITING_PERIOD).then(() => {
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