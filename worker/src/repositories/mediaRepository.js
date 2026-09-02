// Thin R2 wrapper shared by the admin (public bucket) and anonymous
// (private bucket) upload routes -- see routes/adminMedia.js and
// routes/uploads.js for the validation, key scheme and access control that
// sit on top of this.
export function createMediaRepository(bucket) {
  return {
    put: (key, body, options) => bucket.put(key, body, options),
    get: (key) => bucket.get(key),
    delete: (key) => bucket.delete(key),
  };
}
