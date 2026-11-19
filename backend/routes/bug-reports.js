const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rate-limit');
const { BugReportSchema, FIELD_DEFINITIONS, createEmptyReport, getFormDefinition, STATUSES, SEVERITIES } = require('../schemas/bug-report.schema');
const { GenerateRequestSchema } = require('../schemas/generation.schema');
const { getDatabase } = require('../db/connection');
const { createRepository } = require('../db/bug-report-repository');
const { createBugReportService } = require('../services/bug-report-service');
const { createQaIntelligenceService } = require('../services/qa-intelligence-service');
const { EXPORT_FIELDS, reportToCsv, selectReportFields } = require('../services/export-service');

const ListReportsQuerySchema = z.object({
  search: z.string().max(200).default(''),
  status: z.union([z.literal(''), z.enum(STATUSES)]).default(''),
  severity: z.union([z.literal(''), z.enum(SEVERITIES)]).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const ReportIdParamsSchema = z.object({ id: z.string().trim().min(1).max(100) }).strict();
const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'pdf']),
  fields: z.string().max(1500).optional(),
}).strict().transform(({ format, fields }) => ({
  format,
  fields: fields === undefined ? EXPORT_FIELDS : [...new Set(fields.split(','))],
})).pipe(z.object({
  format: z.enum(['json', 'csv', 'pdf']),
  fields: z.array(z.string().refine((field) => Object.hasOwn(FIELD_DEFINITIONS, field), 'Unknown report field.'))
    .min(1).max(EXPORT_FIELDS.length),
}).strict());

const ConfirmedSaveRequestSchema = z.object({
  confirmed: z.literal(true),
  report: BugReportSchema,
}).strict();

function createBugReportsRouter({
  repository,
  generationService = createBugReportService(),
  qaSuggestionsService = createQaIntelligenceService(),
} = {}) {
  const router = express.Router();
  let repositoryPromise;
  const getRepository = async () => {
    if (repository) return repository;
    if (!repositoryPromise) repositoryPromise = getDatabase().then((database) => createRepository(database));
    return repositoryPromise;
  };

  router.get('/schema', (_request, response) => response.json({ fields: getFormDefinition(), emptyReport: createEmptyReport() }));

  router.get('/',
    validate(ListReportsQuerySchema, 'query'),
    async (request, response) => response.json(await (await getRepository()).list(request.validatedQuery)),
  );

  router.get('/:id/export',
    validate(ReportIdParamsSchema, 'params'),
    validate(ExportQuerySchema, 'query'),
    async (request, response) => {
      const report = await (await getRepository()).getById(request.params.id);
      if (!report) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        error.code = 'REPORT_NOT_FOUND';
        throw error;
      }
      const { format, fields } = request.validatedQuery;
      if (format === 'pdf') {
        const error = new Error('Direct PDF generation is unavailable. Use Print / Save as PDF from an opened report.');
        error.status = 501;
        error.code = 'PDF_EXPORT_UNAVAILABLE';
        throw error;
      }
      const filenameId = report.reportId.replace(/[^a-zA-Z0-9_-]/g, '_');
      response.set('Cache-Control', 'no-store').attachment(`${filenameId}.${format}`);
      if (format === 'json') {
        response.type('application/json; charset=utf-8')
          .send(JSON.stringify(selectReportFields(report, fields), null, 2));
      } else {
        response.type('text/csv; charset=utf-8').send(reportToCsv(report, fields));
      }
    },
  );

  router.get('/:id',
    validate(ReportIdParamsSchema, 'params'),
    async (request, response) => {
      const report = await (await getRepository()).getById(request.params.id);
      if (!report) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        error.code = 'REPORT_NOT_FOUND';
        throw error;
      }
      response.json({ report });
    },
  );

  router.post('/generate',
    createRateLimiter({ windowMs: 5 * 60_000, max: 8, message: 'Too many generation requests. Please wait a few minutes.' }),
    validate(GenerateRequestSchema),
    async (request, response) => {
      const result = await generationService.generateReport(request.body);
      response.json(result);
    },
  );

  router.post('/',
    validate(ConfirmedSaveRequestSchema),
    async (request, response) => {
      const saved = await (await getRepository()).create(request.body.report);
      response.status(201).json({ report: saved });
    },
  );

  router.put('/:id',
    validate(ReportIdParamsSchema, 'params'),
    validate(BugReportSchema),
    async (request, response) => {
      const report = await (await getRepository()).update(request.params.id, request.body);
      if (!report) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        error.code = 'REPORT_NOT_FOUND';
        throw error;
      }
      response.json({ report });
    },
  );

  router.post('/:id/qa-suggestions',
    validate(ReportIdParamsSchema, 'params'),
    async (request, _response, next) => {
      const report = await (await getRepository()).getById(request.params.id);
      if (!report) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        error.code = 'REPORT_NOT_FOUND';
        throw error;
      }
      request.qaReport = report;
      next();
    },
    createRateLimiter({ windowMs: 5 * 60_000, max: 6, message: 'Too many QA suggestion requests. Please wait a few minutes.' }),
    async (request, response) => response.json(await qaSuggestionsService.generateSuggestions(request.qaReport)),
  );

  router.delete('/:id',
    validate(ReportIdParamsSchema, 'params'),
    async (request, response) => {
      const deleted = await (await getRepository()).delete(request.params.id);
      if (!deleted) {
        const error = new Error('Bug report was not found.');
        error.status = 404;
        error.code = 'REPORT_NOT_FOUND';
        throw error;
      }
      response.json({ deleted: true });
    },
  );
  return router;
}

module.exports = {
  createBugReportsRouter,
  ConfirmedSaveRequestSchema,
  ListReportsQuerySchema,
  ReportIdParamsSchema,
  ExportQuerySchema,
};
