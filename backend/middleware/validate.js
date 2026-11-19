function validate(schema, source = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      const error = new Error('Request validation failed.');
      error.status = 400;
      error.code = 'VALIDATION_ERROR';
      error.details = result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }));
      return next(error);
    }
    if (source === 'query') request.validatedQuery = result.data;
    else request[source] = result.data;
    return next();
  };
}

module.exports = { validate };
