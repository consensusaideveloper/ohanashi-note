import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const UPLOAD_URL_EXPIRY_SECONDS = 900;
const DOWNLOAD_URL_EXPIRY_SECONDS = 3600;

interface R2Client {
  generateUploadUrl: (key: string, mimeType: string) => Promise<string>;
  generateDownloadUrl: (key: string) => Promise<string>;
  deleteObject: (key: string) => Promise<void>;
}

function createR2Client(): R2Client | null {
  const config = loadConfig();
  if (config.r2 === null) {
    logger.info("R2 not configured — audio storage disabled");
    return null;
  }

  const { accountId, accessKeyId, secretAccessKey, bucketName } = config.r2;
  logger.info("R2 configured", {
    accountId,
    bucketName,
    hasAccessKey: !!accessKeyId,
    hasSecretKey: !!secretAccessKey,
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return {
    async generateUploadUrl(key: string, mimeType: string): Promise<string> {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: mimeType,
      });
      return getSignedUrl(s3, command, {
        expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
      });
    },

    async generateDownloadUrl(key: string): Promise<string> {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      return getSignedUrl(s3, command, {
        expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
      });
    },

    async deleteObject(key: string): Promise<void> {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      await s3.send(command);
    },
  };
}

export const r2 = createR2Client();
