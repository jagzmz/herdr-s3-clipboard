export async function uploadImage(config, image, objectKey, {
  createClient = createS3Client,
  loadCommands = loadS3Commands,
  signObjectUrl = createPresignedGetUrl,
} = {}) {
  const { GetObjectCommand, PutObjectCommand } = await loadCommands();
  const client = await createClient(config);

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: image.body,
      ContentLength: image.size,
      ContentType: image.contentType,
      ...(config.cacheControl ? { CacheControl: config.cacheControl } : {}),
    });
    await client.send(command);

    if (config.urlMode === "presigned") {
      // Await inside the try so the presigner finishes before finally destroys
      // the client's request handler.
      return await signObjectUrl(client, config, objectKey, GetObjectCommand);
    }

    return undefined;
  } finally {
    client.destroy();
  }
}

export async function checkBucketAccess(config) {
  const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
  const client = await createS3Client(config);

  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } finally {
    client.destroy();
  }
}

async function createS3Client(config) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const clientOptions = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
    },
  };

  if (config.endpoint) clientOptions.endpoint = config.endpoint;
  return new S3Client(clientOptions);
}

function loadS3Commands() {
  return import("@aws-sdk/client-s3");
}

export async function createPresignedGetUrl(client, config, objectKey, GetObjectCommandClass) {
  const { GetObjectCommand } = GetObjectCommandClass
    ? { GetObjectCommand: GetObjectCommandClass }
    : await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { expiresIn: config.presignExpiresIn },
  );
}
