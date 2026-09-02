import { ValidationError } from './http.js';

export async function parseJsonBody(request, schema) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }
  return result.data;
}
