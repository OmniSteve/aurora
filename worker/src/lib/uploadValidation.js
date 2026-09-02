import { ValidationError } from './http.js';

// Shared between the admin (public bucket) and anonymous (private bucket)
// upload routes -- both accept only images, both cap size the same way.
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, per migration/MEDIA.md's suggested cap

export async function readValidatedUpload(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    throw new ValidationError('Expected multipart/form-data with a "file" field.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new ValidationError('No file was uploaded.');

  const ext = ALLOWED_TYPES.get(file.type);
  if (!ext) throw new ValidationError('Only JPEG, PNG, WebP or GIF images are allowed.');
  if (file.size === 0) throw new ValidationError('The uploaded file is empty.');
  if (file.size > MAX_BYTES) throw new ValidationError('Images must be 10 MB or smaller.');

  return { file, ext, contentType: file.type };
}
