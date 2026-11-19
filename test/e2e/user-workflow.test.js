const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../backend/server');
const { createMemoryDatabase } = require('../../backend/db/connection');
const { createRepository } = require('../../backend/db/bug-report-repository');
const { createEmptyReport } = require('../../backend/schemas/bug-report.schema');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function generatedReport() {
  const report = {
    ...createEmptyReport(),
    bugTitle: 'Login button does not respond after valid credentials.',
    summary: 'The Login button does not respond after valid credentials are entered.',
    bugType: 'Functional',
    reproductionSteps: ['Enter valid credentials.', 'Click Login.'],
    expectedResult: 'The user is redirected to the dashboard.',
    actualResult: 'Nothing happens after Login is clicked.',
    severity: { value: 'Major', suggested: true, reason: 'A core user flow is blocked.' },
    priority: { value: 'High', suggested: true, reason: 'The user cannot sign in.' },
    confirmedFacts: ['The Login button does nothing after credentials are entered.'],
    assumptionsAndMissingInformation: { assumptions: [], missingInfo: ['Browser and device were not provided.'] },
  };
  return {
    report,
    confirmedFacts: report.confirmedFacts,
    assumptions: [],
    missingInfo: report.assumptionsAndMissingInformation.missingInfo,
    clarifyingQuestions: [],
  };
}

test('typed Marathi intake completes clarification, report save/edit, search, export, and screenshot rejection', async () => {
  const database = await createMemoryDatabase();
  const repository = createRepository(database);
  const clarificationInputs = [];
  const generationInputs = [];
  const app = createApp({
    repository,
    clarificationService: {
      clarify: async (input) => {
        clarificationInputs.push(input);
        const answered = input.messages.some((message) => message.role === 'user');
        return answered
          ? { cleanDescription: `${input.description} Chrome Android`, readyToGenerate: true, clarifyingQuestions: [] }
          : { cleanDescription: input.description, readyToGenerate: false, clarifyingQuestions: ['Which browser and device did you use?'] };
      },
    },
    generationService: { generateReport: async (input) => { generationInputs.push(input); return generatedReport(); } },
    qaSuggestionsService: { generateSuggestions: async () => ({
      label: 'AI suggestion',
      suggestions: {
        reproductionSteps: ['Enter valid credentials.', 'Click Login.'],
        positiveScenarios: ['Valid credentials allow sign in.'],
        negativeScenarios: ['Invalid credentials show an error.'],
        boundaryScenarios: ['Submit with an empty password.'],
        regressionCases: ['The dashboard remains reachable after sign in.'],
      },
    }) },
  });

  await withServer(app, async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    const homeText = await home.text();
    const appScript = await (await fetch(`${baseUrl}/app.js`)).text();
    assert.equal(home.status, 200);
    assert.match(homeText, /Bug report library/);
    assert.match(homeText, /Download JSON/);
    assert.match(homeText, /Download CSV/);
    assert.match(homeText, /Print \/ Save as PDF/);
    assert.match(homeText, /Generate QA suggestions/);
    assert.doesNotMatch(appScript, /GEMINI_API_KEY/);
    if (process.env.GEMINI_API_KEY) assert.ok(!appScript.includes(process.env.GEMINI_API_KEY), 'Permanent key appeared in the browser script.');

    const description = 'लॉगिन पेजवर वैध माहिती टाकल्यानंतर लॉगिन बटन काम करत नाही.';
    const initialClarification = await fetch(`${baseUrl}/api/bug-reports/clarify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, messages: [] }),
    });
    const firstTurn = await initialClarification.json();
    assert.equal(initialClarification.status, 200);
    assert.equal(firstTurn.readyToGenerate, false);
    assert.equal(firstTurn.clarifyingQuestions.length, 1);

    const answeredClarification = await fetch(`${baseUrl}/api/bug-reports/clarify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, messages: [
        { role: 'assistant', content: firstTurn.clarifyingQuestions[0] },
        { role: 'user', content: 'Chrome on Android.' },
      ] }),
    });
    const secondTurn = await answeredClarification.json();
    assert.equal(answeredClarification.status, 200);
    assert.equal(secondTurn.readyToGenerate, true);

    const generated = await fetch(`${baseUrl}/api/bug-reports/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: secondTurn.cleanDescription, language: 'mr', clarifications: [
        { question: firstTurn.clarifyingQuestions[0], answer: 'Chrome on Android.' },
      ] }),
    });
    const draft = await generated.json();
    assert.equal(generated.status, 200);
    assert.equal(generationInputs[0].language, 'mr');
    assert.match(generationInputs[0].description, /लॉगिन/);
    assert.equal(draft.report.reportId, '');
    assert.equal(repository.list({}).total, 0);

    const savedResponse = await fetch(`${baseUrl}/api/bug-reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true, report: draft.report }),
    });
    const saved = await savedResponse.json();
    assert.equal(savedResponse.status, 201);
    assert.match(saved.report.reportId, /^BUG-/);

    const editedReport = { ...saved.report, bugTitle: 'Login button still does not respond on Android.' };
    const update = await fetch(`${baseUrl}/api/bug-reports/${saved.report.reportId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editedReport),
    });
    assert.equal(update.status, 200);

    const search = await fetch(`${baseUrl}/api/bug-reports?search=still%20does%20not%20respond&status=New&page=1`);
    const results = await search.json();
    assert.equal(search.status, 200);
    assert.equal(results.total, 1);
    assert.equal(results.reports[0].reportId, saved.report.reportId);

    const jsonExport = await fetch(`${baseUrl}/api/bug-reports/${saved.report.reportId}/export?format=json&fields=reportId,bugTitle,status`);
    const exportBody = await jsonExport.json();
    assert.deepEqual(Object.keys(exportBody), ['reportId', 'bugTitle', 'status']);
    assert.equal(exportBody.bugTitle, editedReport.bugTitle);
    const csvExport = await fetch(`${baseUrl}/api/bug-reports/${saved.report.reportId}/export?format=csv&fields=bugTitle`);
    assert.match(await csvExport.text(), /Bug Title/);

    const qaSuggestions = await fetch(`${baseUrl}/api/bug-reports/${saved.report.reportId}/qa-suggestions`, { method: 'POST' });
    const qa = await qaSuggestions.json();
    assert.equal(qaSuggestions.status, 200);
    assert.equal(qa.label, 'AI suggestion');
    assert.ok(qa.suggestions.negativeScenarios.length);

    const invalidImage = new FormData();
    invalidImage.append('image', new Blob(['not an image'], { type: 'image/png' }), 'bad.png');
    const badScreenshot = await fetch(`${baseUrl}/api/attachments`, { method: 'POST', body: invalidImage });
    assert.equal(badScreenshot.status, 415);
    assert.equal((await badScreenshot.json()).error.code, 'INVALID_IMAGE_CONTENT');

    assert.equal(clarificationInputs.length, 2);
  });

  database.close();
});
