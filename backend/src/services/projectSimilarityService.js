const { withAIConcurrency } = require('./matchingCache');
const { createVertexAIClient } = require('./vertexAIService');
const { getVertexConfig } = require('../config/vertex');
const { DATA_BOUNDARY, parseAIJson, thaiReason } = require('./aiPromptPolicy');

async function compareProjectType(requirementText, projects, options = {}) {
    if (!requirementText || !projects?.length) {
        return { status: 'unknown', reason: 'ข้อมูลข้อกำหนดหรือผลงานที่ผ่านมาไม่เพียงพอ', matchedProject: null, confidence: 0 };
    }
    const config = options.config || getVertexConfig();
    const client = options.client || createVertexAIClient(config);
    const controller = new AbortController();
    let timer;
    try {
        const response = await Promise.race([
            client.models.generateContent({
                model: options.model || config.model,
                contents: JSON.stringify({
                    requirement: requirementText,
                    projects: projects.map((p, index) => ({ index, projectName: p.projectName || '', projectType: p.projectType || '' })),
                }),
                config: {
                    systemInstruction: `${DATA_BOUNDARY}
Compare reported past software projects with the required type of work.
Use only the explicitly reported project name and projectType to compare project scope.
A name can identify the reported domain; it does not prove technologies, hands-on skills,
contract existence, dates, value, team size, certifications, or verified completion.
A broad label alone is not proof of a specialized domain. Similar purpose is not sufficient.
Return pass only with a specific project whose reported scope clearly supports the requirement.
Return fail only when the supplied evidence clearly establishes an unrelated scope;
otherwise return unknown. Never treat a missing statement as proof of failure.
Copy an explicit zero-based project index. Use -1 when no project supports the decision.
Write reason in Thai, keeping technical names in English. Return JSON only.`,
                    temperature: 0,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'OBJECT', properties: {
                            status: { type: 'STRING', enum: ['pass', 'fail', 'unknown'] },
                            matchedProjectIndex: { type: 'INTEGER' }, reason: { type: 'STRING' }, confidence: { type: 'NUMBER' },
                        }, required: ['status', 'matchedProjectIndex', 'reason', 'confidence'],
                    },
                    maxOutputTokens: 2048,
                    ...(String(options.model || config.model).startsWith('gemini-2.5-flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
                    abortSignal: controller.signal,
                    httpOptions: { timeout: options.timeoutMs || 45000, retryOptions: { attempts: 1 } },
                },
            }),
            new Promise((_, reject) => {
                timer = setTimeout(() => { controller.abort(); reject(new Error('Project AI deadline exceeded')); }, options.timeoutMs || 45000);
            }),
        ]);
        const result = parseAIJson(response);
        const index = result.matchedProjectIndex;
        const validIndex = Number.isInteger(index) && index >= 0 && index < projects.length;
        if (!['pass', 'fail', 'unknown'].includes(result.status) || !Number.isInteger(index) ||
            (index !== -1 && !validIndex) || (['pass', 'fail'].includes(result.status) && !validIndex) ||
            !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
            throw new Error('Invalid project similarity response');
        }
        return {
            status: result.status,
            matchedProject: validIndex ? projects[index].projectName : null,
            reason: thaiReason(result.reason, result.status === 'pass' ? 'ขอบเขตของผลงานที่รายงานสอดคล้องกับประเภทงานที่กำหนด' : result.status === 'fail' ? 'หลักฐานที่รายงานแสดงว่าขอบเขตผลงานไม่สอดคล้องกับประเภทงานที่กำหนด' : 'ยังไม่พบหลักฐานยืนยันว่าขอบเขตผลงานสอดคล้องกับประเภทงานที่กำหนด'),
            confidence: result.confidence,
        };
    } finally { clearTimeout(timer); }
}
module.exports = { compareProjectType: (...args) => withAIConcurrency(() => compareProjectType(...args)) };
