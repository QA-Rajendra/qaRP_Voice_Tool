const { z } = require('zod');

const suggestionList = z.array(z.string().trim().min(1).max(1000)).max(15);

const QaSuggestionsSchema = z.object({
  reproductionSteps: suggestionList,
  positiveScenarios: suggestionList,
  negativeScenarios: suggestionList,
  boundaryScenarios: suggestionList,
  regressionCases: suggestionList,
}).strict();

module.exports = { QaSuggestionsSchema };
