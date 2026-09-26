/**
 * Download public rice drought/heat guidance and index it in an xAI collection.
 *   npx tsx scripts/build-knowledge.ts
 *
 * Uses XAI_API_KEY for file upload and XAI_MANAGEMENT_API_KEY for the collection.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isRecord, loadEnv, readJson, repoRoot, writeJson } from "./pipeline";

const FARM_ID = "cn-rice-2022";
const COLLECTION_NAME = "orbital-agronomist-rice-stress";
const FILES_URL = "https://api.x.ai/v1/files";
const COLLECTIONS_URL = "https://management-api.x.ai/v1/collections";
const MAX_BYTES = 48 * 1024 * 1024;

type DocumentSpec = {
  title: string;
  publisher: "IRRI" | "FAO";
  url: string;
  file: string;
};

const DOCUMENTS: DocumentSpec[] = [
  {
    title: "Drought",
    publisher: "IRRI",
    url: "http://www.knowledgebank.irri.org/decision-tools/rice-doctor/rice-doctor-fact-sheets/item/drought",
    file: "irri-drought.html",
  },
  {
    title: "Water management",
    publisher: "IRRI",
    url: "http://www.knowledgebank.irri.org/step-by-step-production/growth/water-management",
    file: "irri-water-management.html",
  },
  {
    title: "Rice feels the heat",
    publisher: "IRRI",
    url: "https://ricetoday.irri.org/rice-feels-the-heat/",
    file: "irri-rice-feels-the-heat.html",
  },
  {
    title: "Extreme heat and agriculture",
    publisher: "FAO",
    url: "https://openknowledge.fao.org/server/api/core/bitstreams/246cffd9-90e9-4d98-ab4c-2fec7a9a13fd/content",
    file: "fao-extreme-heat-and-agriculture.pdf",
  },
];

type SavedDocument = DocumentSpec & { fileId?: string };

const knowledgeDir = path.join(repoRoot, "data", "knowledge");
const sourcesPath = path.join(knowledgeDir, "sources.json");
const configPath = path.join(repoRoot, "data", "farms.config.json");

async function main() {
  loadEnv();
  const apiKey = process.env.XAI_API_KEY;
  const managementKey = process.env.XAI_MANAGEMENT_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY must be set in .env.local");
  if (!managementKey) throw new Error("XAI_MANAGEMENT_API_KEY must be set in .env.local");

  await mkdir(knowledgeDir, { recursive: true });
  for (const doc of DOCUMENTS) {
    await downloadDocument(doc);
  }

  const saved = await readSaved();
  const collectionId = await ensureCollection(managementKey);
  for (const doc of DOCUMENTS) {
    const previous = saved.find((item) => item.file === doc.file);
    const fileId = previous?.fileId || (await uploadAndAttach(apiKey, managementKey, collectionId, doc));
    const index = saved.findIndex((item) => item.file === doc.file);
    const next: SavedDocument = { ...doc, fileId };
    if (index >= 0) saved[index] = next;
    else saved.push(next);
    await writeJson(sourcesPath, { documents: saved });
    await waitUntilProcessed(managementKey, collectionId, fileId, doc.file);
  }

  await saveCollectionId(collectionId);
  console.log(`collection ${collectionId}`);
  console.log(`sources ${path.relative(repoRoot, sourcesPath)}`);
}

async function downloadDocument(doc: DocumentSpec): Promise<void> {
  const destination = path.join(knowledgeDir, doc.file);
  console.log(`download ${doc.file}`);
  const response = await fetch(doc.url, {
    headers: {
      "User-Agent": "OrbitalAgronomist/1.0 (literature grounding; research)",
      Accept: doc.file.endsWith(".pdf") ? "application/pdf,*/*" : "text/html,*/*",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`${doc.url} returned ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 500) throw new Error(`${doc.file} was only ${bytes.byteLength} bytes`);
  if (bytes.byteLength > MAX_BYTES) throw new Error(`${doc.file} exceeds 48 MB`);
  if (doc.file.endsWith(".pdf") && !bytes.subarray(0, 5).toString("utf8").includes("%PDF")) {
    throw new Error(`${doc.file} is not a PDF`);
  }
  const body = doc.file.endsWith(".html") ? Buffer.from(sourceBanner(doc) + bytes.toString("utf8"), "utf8") : bytes;
  await writeFile(destination, body);
}

function sourceBanner(doc: DocumentSpec): string {
  const org =
    doc.publisher === "IRRI"
      ? "International Rice Research Institute (IRRI)"
      : "Food and Agriculture Organization of the United Nations (FAO)";
  return `<p>Source: ${org}. Title: ${doc.title}. URL: ${doc.url}</p>\n`;
}

async function readSaved(): Promise<SavedDocument[]> {
  try {
    const parsed = await readJson(sourcesPath);
    if (!isRecord(parsed) || !Array.isArray(parsed.documents)) return [];
    return parsed.documents.filter(isSavedDocument);
  } catch {
    return [];
  }
}

function isSavedDocument(value: unknown): value is SavedDocument {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    (value.publisher === "IRRI" || value.publisher === "FAO") &&
    typeof value.url === "string" &&
    typeof value.file === "string"
  );
}

async function ensureCollection(managementKey: string): Promise<string> {
  const existing = await readCollectionId();
  if (existing) {
    console.log(`reuse collection ${existing}`);
    return existing;
  }
  const response = await fetch(COLLECTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collection_name: COLLECTION_NAME,
      collection_description:
        "Public IRRI and FAO guidance on rice under drought and heat stress.",
      field_definitions: [
        { key: "title", required: false, inject_into_chunk: true },
        { key: "publisher", required: false, inject_into_chunk: true },
        { key: "url", required: false, inject_into_chunk: true },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`create collection ${response.status}: ${text.slice(0, 400)}`);
  const body = JSON.parse(text) as { collection_id?: string };
  if (!body.collection_id) throw new Error("create collection did not return collection_id");
  await saveCollectionId(body.collection_id);
  console.log(`created collection ${body.collection_id}`);
  return body.collection_id;
}

async function uploadAndAttach(
  apiKey: string,
  managementKey: string,
  collectionId: string,
  doc: DocumentSpec,
): Promise<string> {
  const bytes = await readFile(path.join(knowledgeDir, doc.file));
  const form = new FormData();
  form.append("purpose", "assistants");
  form.append("file", new Blob([bytes], { type: mimeFor(doc.file) }), doc.file);
  const uploaded = await fetch(FILES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const uploadedText = await uploaded.text();
  if (!uploaded.ok) throw new Error(`upload ${doc.file} ${uploaded.status}: ${uploadedText.slice(0, 400)}`);
  const file = JSON.parse(uploadedText) as { id?: string };
  if (!file.id) throw new Error(`upload ${doc.file} did not return an id`);

  const attached = await fetch(`${COLLECTIONS_URL}/${collectionId}/documents/${file.id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: { title: doc.title, publisher: doc.publisher, url: doc.url },
    }),
  });
  const attachedText = await attached.text();
  if (!attached.ok && attached.status !== 409) {
    throw new Error(`add ${doc.file} ${attached.status}: ${attachedText.slice(0, 400)}`);
  }
  console.log(`indexed ${doc.file} ${file.id}`);
  return file.id;
}

async function waitUntilProcessed(
  managementKey: string,
  collectionId: string,
  fileId: string,
  file: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 40; attempt++) {
    const response = await fetch(`${COLLECTIONS_URL}/${collectionId}/documents/${fileId}`, {
      headers: { Authorization: `Bearer ${managementKey}` },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`status ${file} ${response.status}: ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as unknown;
    const status = findStatus(body);
    if (status && /fail|error/i.test(status) && !/processed/i.test(status)) {
      throw new Error(`${file} ${status}`);
    }
    if (status && /processed|ready|indexed|succeeded/i.test(status) && !/processing/i.test(status)) {
      console.log(`${file} ${status}`);
      return;
    }
    if (attempt === 1 || attempt % 5 === 0) console.log(`${file} waiting (${status ?? "no status"})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`${file} was not ready after 2 minutes`);
}

function findStatus(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of ["status", "processing_status", "document_status", "index_status"]) {
    if (typeof value[key] === "string") return value[key];
  }
  for (const nested of Object.values(value)) {
    if (isRecord(nested)) {
      const found = findStatus(nested);
      if (found) return found;
    }
  }
  return undefined;
}

function mimeFor(file: string): string {
  return file.endsWith(".pdf") ? "application/pdf" : "text/html";
}

async function readCollectionId(): Promise<string | undefined> {
  const config = await readJson(configPath);
  if (!isRecord(config) || !Array.isArray(config.farms)) return undefined;
  const farm = config.farms.find((item) => isRecord(item) && item.id === FARM_ID);
  if (!isRecord(farm) || typeof farm.knowledgeCollectionId !== "string") return undefined;
  return farm.knowledgeCollectionId || undefined;
}

async function saveCollectionId(collectionId: string): Promise<void> {
  const config = await readJson(configPath);
  if (!isRecord(config) || !Array.isArray(config.farms)) throw new Error("farms.config.json is invalid");
  const farm = config.farms.find((item) => isRecord(item) && item.id === FARM_ID);
  if (!isRecord(farm)) throw new Error(`${FARM_ID} is missing from farms.config.json`);
  farm.knowledgeCollectionId = collectionId;
  await writeJson(configPath, config);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
