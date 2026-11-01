require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Tor = require('../src/models/Tor');
const { analyzeTor } = require('../src/services/torAnalyzer');
const { getVertexConfig } = require('../src/config/vertex');
const { createVertexAIClient } = require('../src/services/vertexAIService');
(async () => {
 await mongoose.connect(process.env.MONGODB_URI);
 const tor = await Tor.findById(process.argv[2]).lean();
 const config = getVertexConfig(), base = createVertexAIClient(config);
 const client = { models: { generateContent: async args => {
  const response = await base.models.generateContent(args);
  try { const data = JSON.parse(response.text); console.log(JSON.stringify({
   relevance: data.projectRelevance?.map(item => ({ index: item.ownerRequirementIndex, keys: Object.keys(item), sourceMatches: tor.requirements.map(row => row.description.trim() === item.sourceText?.trim()) })),
  })); } catch {}
  return response;
 } } };
 try { const result = await analyzeTor(tor, 'internal', { config, client }); console.log(JSON.stringify({ success: true, criteria: result.projectRelevance.length })); }
 catch (error) { console.log(JSON.stringify({ success: false, reason: /^(Invalid owner|Incomplete owner|Invalid AI|Incomplete AI)/.test(error.message) ? error.message : 'Analysis unavailable' })); }
})().finally(() => mongoose.disconnect());
