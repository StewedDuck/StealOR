require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const service = require('../src/services/torMatchingService');
let explanationMs = 0;
const original = service.refreshMatchingExplanations;
service.refreshMatchingExplanations = (...args) => { const start = Date.now(); const value = original(...args); explanationMs += Date.now() - start; return value; };
const { getMatchedTors } = require('../src/controllers/matchingController');
(async () => {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, monitorCommands: true, compressors: ['zlib'] });
    const commands = new Map();
    const client = mongoose.connection.getClient();
    client.on('commandStarted', event => commands.set(event.requestId, { name: event.commandName, collection: event.command.find || event.command.collection || event.command.update || event.command.aggregate }));
    client.on('commandSucceeded', event => { const command = commands.get(event.requestId); commands.delete(event.requestId); if (command) console.log(JSON.stringify({ database: command, elapsedMs: event.duration, bytes: require('mongodb').BSON.calculateObjectSize(event.reply) })); });
    const user = await User.findOne({ email: process.argv[2] }).select('_id').lean();
    console.log(JSON.stringify({ profileFound: !!user }));
    const started = Date.now();
    await getMatchedTors({ profileEmail: process.argv[2], query: { refresh: 'false' } }, {
        status(code) { this.statusCode = code; return this; },
        json(payload) {
            const rows = (payload.data || []).flatMap(row => row.mandatoryResults || []);
            console.log(JSON.stringify({ httpStatus: this.statusCode || 200, elapsedMs: Date.now() - started, explanationMs,
                mandatoryResults: rows.length, withConditionEvidence: rows.filter(row => row.conditionDetails?.length).length,
                nonThaiReasons: rows.filter(row => row.reason && !/[ก-๙]/.test(row.reason)).length }));
        },
    });
})().catch(error => { console.log(JSON.stringify({ failure: error.name })); process.exitCode = 1; }).finally(() => mongoose.disconnect());
