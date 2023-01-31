# Supervisor Application for eGSM Monitoring Platform
eGSM Monitoring Platform is a microservice-based, distributed business process monitoring platform. Its operation is based on Engine Workers and Aggregator Agents.
This application is intended to support the operation of the eGSM Platform by providing an interface to the system. The supervisor deploys a WebSocket server, which allows
the appropriate browser application to connect to it to send commands and retrieve information about the system.

## Requirements
The eGSM Monitoring Platform requires:
1. MQTT broker using at least MQTT v5.0
2. DynamoDB database (cloud or locally deployed)

## Usage
1. Clone repository
2. Run `git submodule update --init`
3. Run `npm install package.json` and make sure all libraries have been installed successfully
4. If necessary, update the content of `config.xml`, which defines the network address of the MQTT broker and the database
5. Before deploying any application of the platform, the database has to be populated with the necessary tables, which can be done by running `node db-init-tables`
6. Run `node main.js`
7. The application is now running