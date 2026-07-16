export const STORAGE_PROVIDER_CHOICES = [
  { name: "Cloudflare R2", value: "r2", description: "Managed S3-compatible object storage from Cloudflare." },
  { name: "AWS S3", value: "aws", description: "Amazon's native S3 object storage service." },
  { name: "Backblaze B2", value: "backblaze", description: "Managed object storage with an S3-compatible API." },
  { name: "DigitalOcean Spaces", value: "digitalocean", description: "Managed S3-compatible storage with optional CDN support." },
  { name: "Wasabi", value: "wasabi", description: "Managed S3-compatible hot cloud storage." },
  { name: "MinIO", value: "minio", description: "Self-hosted S3-compatible object storage." },
  { name: "Another S3-compatible service", value: "other", description: "Use a provider that supplies an S3 endpoint and access keys." },
];

const PROVIDER_GUIDES = {
  r2: {
    name: "Cloudflare R2",
    setupProvider: "r2",
    defaults: {},
    steps: [
      "Create or sign in to a Cloudflare account and enable R2.",
      "Create an R2 bucket.",
      "Create an R2 API token with Object Read & Write access for that bucket.",
      "Copy the Access Key ID and Secret Access Key when Cloudflare displays them.",
    ],
    links: [
      ["R2 S3 quick start", "https://developers.cloudflare.com/r2/get-started/s3/"],
      ["R2 API credentials", "https://developers.cloudflare.com/r2/api/tokens/"],
    ],
    requiredValues: ["account ID", "bucket name", "Access Key ID", "Secret Access Key"],
  },
  aws: {
    name: "AWS S3",
    setupProvider: "aws",
    defaults: {},
    steps: [
      "Create or sign in to an AWS account.",
      "Create a general-purpose S3 bucket and note its AWS Region.",
      "Create least-privileged programmatic credentials that can write to the bucket.",
      "Do not create or use access keys for the AWS account root user.",
    ],
    links: [
      ["Create an S3 bucket", "https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html"],
      ["Manage IAM access keys", "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html"],
    ],
    requiredValues: ["AWS Region", "bucket name", "Access Key ID", "Secret Access Key"],
  },
  backblaze: {
    name: "Backblaze B2",
    setupProvider: "generic",
    defaults: { endpoint: "", region: "" },
    steps: [
      "Create or sign in to a Backblaze account and enable B2 Cloud Storage.",
      "Create a bucket and copy its S3 endpoint and region.",
      "Create an application key with permission to list the bucket and write files.",
      "Use the keyID as the Access Key ID and applicationKey as the Secret Access Key.",
    ],
    links: [
      ["Backblaze integration setup", "https://www.backblaze.com/docs/en/cloud-storage-get-started-with-a-backblaze-integration"],
      ["S3-compatible application keys", "https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys"],
    ],
    requiredValues: ["S3 endpoint", "region", "bucket name", "keyID", "applicationKey"],
  },
  digitalocean: {
    name: "DigitalOcean Spaces",
    setupProvider: "generic",
    defaults: { endpoint: "", region: "" },
    steps: [
      "Create or sign in to a DigitalOcean account.",
      "Create a Spaces bucket and note its region.",
      "Create a Spaces access key with read/write access to the bucket.",
      "Use https://<region>.digitaloceanspaces.com as the S3 endpoint.",
    ],
    links: [
      ["Spaces quick start", "https://docs.digitalocean.com/products/spaces/getting-started/quickstart/"],
      ["Spaces keys", "https://docs.digitalocean.com/products/spaces/reference/api/spaces-keys/"],
    ],
    requiredValues: ["Spaces endpoint", "region", "bucket name", "Access Key ID", "Secret Access Key"],
  },
  wasabi: {
    name: "Wasabi",
    setupProvider: "generic",
    defaults: { endpoint: "", region: "" },
    steps: [
      "Create or sign in to a Wasabi account.",
      "Create a bucket and note its region and service endpoint.",
      "Create an access key for a user with permission to write to the bucket.",
      "Copy the Access Key and Secret Key when Wasabi displays them.",
    ],
    links: [
      ["Wasabi account setup", "https://docs.wasabi.com/docs/signing-up-for-wasabi/"],
      ["Create a Wasabi access key", "https://docs.wasabi.com/docs/creating-a-new-access-key"],
    ],
    requiredValues: ["service endpoint", "region", "bucket name", "Access Key", "Secret Key"],
  },
  minio: {
    name: "MinIO",
    setupProvider: "minio",
    defaults: { endpoint: "" },
    steps: [
      "Install or connect to a MinIO deployment.",
      "Create a bucket through the MinIO Console or mc command-line client.",
      "Create an access key whose user or policy can write to that bucket.",
      "Copy the deployment URL, Access Key, and Secret Key.",
    ],
    links: [
      ["Install MinIO", "https://min.io/docs/minio/linux/operations/installation.html"],
      ["Create a MinIO access key", "https://min.io/docs/minio/linux/reference/minio-mc-admin/mc-admin-accesskey-create.html"],
    ],
    requiredValues: ["MinIO endpoint URL", "bucket name", "Access Key", "Secret Key"],
  },
  other: {
    name: "another S3-compatible service",
    setupProvider: "generic",
    defaults: { endpoint: "", region: "" },
    steps: [
      "Choose a storage provider that documents support for the S3 API.",
      "Create a bucket and credentials with permission to upload objects.",
      "Find the provider's S3 endpoint and signing region in its documentation.",
      "Keep the endpoint at account or service level; do not append the bucket name.",
    ],
    links: [],
    requiredValues: ["S3 endpoint", "region", "bucket name", "Access Key ID", "Secret Access Key"],
  },
};

export function getProviderGuide(providerId) {
  const guide = PROVIDER_GUIDES[providerId];
  if (!guide) throw new Error(`Unknown storage provider guide: ${providerId}`);
  return guide;
}

export function formatProviderGuide(providerId) {
  const guide = getProviderGuide(providerId);
  const lines = ["", `${guide.name} setup`, ""];

  for (const [index, step] of guide.steps.entries()) {
    lines.push(`  ${index + 1}. ${step}`);
  }

  if (guide.links.length > 0) {
    lines.push("", "Official guides:");
    for (const [label, url] of guide.links) lines.push(`  ${label}: ${url}`);
  }

  lines.push("", "Keep these values ready:");
  for (const value of guide.requiredValues) lines.push(`  - ${value}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}
