const supabase = require('../config/supabase');

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';

// Takes a base64 data URI (e.g. "data:image/png;base64,iVBOR...")
// Uploads to Supabase Storage and returns the public URL.
async function uploadPhoto(base64DataUri, fileName) {
  const matches = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image format — expected base64 data URI');

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const path = `${new Date().toISOString().slice(0, 10)}/${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Upload to a specific path with optional upsert (for profile photos / logos that replace themselves)
async function uploadFile(base64DataUri, filePath, { upsert = false } = {}) {
  const matches = base64DataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image format — expected base64 data URI');
  const mimeType = matches[1];
  const buffer   = Buffer.from(matches[2], 'base64');

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: mimeType, upsert });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

module.exports = { uploadPhoto, uploadFile };
