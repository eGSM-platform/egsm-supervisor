var fs = require('fs')
var xml2js = require('xml2js');

var LOG = require('../egsm-common/auxiliary/logManager')
var parseString = xml2js.parseString;

module.id = 'PROCESSLIB'

const LIBRARY_FOLDER = './process_library/'
var PROCESS_TYPE_NUMBER = 0

var PROCESS_TYPES = new Map()


/**
 * Loads all Proccess Types from the LIBRARY_FOLDER
 */
function loadProcessTypes() {
    LOG.logSystem('DEBUG', 'Loading Process Library', module.id)
    var index = 1
    while (true) {
        var folder = LIBRARY_FOLDER + 'process_' + index.toString()
        if (fs.existsSync(folder)) {
            LOG.logSystem('DEBUG', `Directory exists! - ${folder}`, module.id)

            try {
                const config_file = fs.readFileSync(folder + '/process.xml', 'utf8');
                LOG.logSystem('DEBUG', 'Initialization file read', module.id)

                parseString(config_file, function (err, process_config) {
                    if (err) {
                        LOG.logSystem('FATAL', `Error while parsing initialization file: ${err}`, module.id)
                    }
                    LOG.logSystem('DEBUG', 'Applying configurations', module.id)
                    var process_config = process_config['process-type']

                    //Extracting and storing process details
                    if (PROCESS_TYPES.has(process_config['name'][0])) {
                        LOG.logSystem('FATAL', `Cannot defined 2 process types with the same name [${process_config['name'][0]}]`, module.id)
                    }
                    var name = process_config['name'][0]
                    var description = process_config['description'][0]
                    var bpmn_model = fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + process_config['bpmn-model'][0]['model'][0], 'utf8');
                    var perspectives = []

                    //Iterating through perspectives
                    process_config['perspective'].forEach(element => {
                        perspectives.push({
                            name: element['name'][0],
                            egsm_model: fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['egsm-model'][0], 'utf8'),
                            info_model: fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['info-model'][0], 'utf8'),
                            bindings: fs.readFileSync(LIBRARY_FOLDER + 'process_' + index.toString() + "/" + element['bindings'][0], 'utf8'),
                        })
                    });
                    var currentProcess = {
                        name: name,
                        description: description,
                        bpmn_model: bpmn_model,
                        perspectives: perspectives
                    }
                    PROCESS_TYPES.set(name, currentProcess)
                })
            } catch (err) {
                LOG.logSystem('FATAL', `Error while reading initialization file: ${err}`, module.id)
            }

            PROCESS_TYPE_NUMBER += 1
            index += 1
            continue
        }
        break
    }
    LOG.logSystem('DEBUG', 'Process Library loaded', module.id)
}

/**
 * 
 * @returns A list of available Process types, containing their names and description
 */
function getProcessTypeList() {
    var result = []
    for (let [key, value] of PROCESS_TYPES) {
        result.push({
            process_type_name: key,
            description: PROCESS_TYPES.get(key)['description']
        })
    }
    return result
}

/**
 * Gets a Process Type definition from the module specified by process_type_name
 * @param {*} process_type_name ID of the Process Type
 * @returns Returns an object containing all relevant data to the Process Type
 */
function getProcessType(process_type_name) {
    if (PROCESS_TYPES.has(process_type_name)) {
        return PROCESS_TYPES.get(process_type_name)
    }
    return 'not_found'
}

loadProcessTypes()

module.exports = {
    loadProcessTypes: loadProcessTypes,
    getProcessTypeList: getProcessTypeList,
    getProcessType: getProcessType,
}