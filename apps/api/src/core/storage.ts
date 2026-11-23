// File storage for attachments (PLT-08): local disk by default, any S3-compatible bucket (AWS S3, MinIO, R2, Spaces) when S3_BUCKET is set.
//   S3_BUCKET, S3_REGION (default us-east-1), S3_ENDPOINT (for non-AWS), S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE=1 (MinIO)
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const DIR = process.env.UPLOAD_DIR ?? 'uploads';
const bucket = process.env.S3_BUCKET;
let client: S3Client | undefined;
const s3 = () => (client ??= new S3Client({ region: process.env.S3_REGION ?? 'us-east-1', endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1', credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' } : undefined }));
/** Keys are server-generated ("<companyId>/<uuid>.ext"); refuse anything that could leave the upload directory. */
const safe = (key: string) => { const k = normalize(key); if (k.startsWith('..') || k.includes(`..${sep}`) || k.startsWith(sep) || /^[a-z]:/i.test(k)) throw new Error('Invalid storage key'); return k; };

export const storage = {
  mode: bucket ? ('s3' as const) : ('local' as const),
  async put(key: string, body: Buffer, mime?: string) {
    key = safe(key);
    if (bucket) { await s3().send(new PutObjectCommand({ Bucket: bucket, Key: key.split(sep).join('/'), Body: body, ContentType: mime, ServerSideEncryption: process.env.S3_SSE ? (process.env.S3_SSE as any) : undefined })); return; }
    const p = join(DIR, key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, body);
  },
  async get(key: string): Promise<Buffer> {
    key = safe(key);
    if (bucket) { const r = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key.split(sep).join('/') })); return Buffer.from(await r.Body!.transformToByteArray()); }
    return readFile(join(DIR, key));
  },
  async del(key: string) {
    key = safe(key);
    if (bucket) { await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key.split(sep).join('/') })); return; }
    await rm(join(DIR, key), { force: true });
  },
};
