import assert from "node:assert/strict";
import test from "node:test";
import { ApifyClient, type FetchLike } from "../src/server/adapters/apify.js";

function setup(read: () => Response | Promise<Response>) {
  let starts = 0;
  let reads = 0;
  const fetch: FetchLike = async (_url, init) => {
    if (init?.method === "POST") {
      starts += 1;
      return Response.json({ data: { id: "existing-run", status: "SUCCEEDED", defaultDatasetId: "existing-dataset", usageTotalUsd: 0.04 } });
    }
    reads += 1;
    return read();
  };
  return { client: new ApifyClient({ token: "test-placeholder", fetch }), counts: () => ({ starts, reads }) };
}

test("502 retries the same dataset without another paid actor run", async () => {
  let attempt = 0;
  const { client, counts } = setup(() => ++attempt === 1 ? new Response("temporary", { status: 502 }) : Response.json([{ title: "Example" }]));
  const result = await client.run({});
  assert.deepEqual(result.items, [{ title: "Example" }]);
  assert.equal(result.costUsd, 0.04);
  assert.deepEqual(counts(), { starts: 1, reads: 2 });
});

test("dataset authentication failure is not retried", async () => {
  const { client, counts } = setup(() => new Response("denied", { status: 401 }));
  await assert.rejects(client.run({}), /dataset Apify \(401\)/);
  assert.deepEqual(counts(), { starts: 1, reads: 1 });
});

test("connection failures stop after four reads and hide provider details", async () => {
  const { client, counts } = setup(() => { throw new Error("private-token-in-provider-error"); });
  await assert.rejects(client.run({}), (error: Error) => error.message.includes("quatro tentativas") && !error.message.includes("private-token"));
  assert.deepEqual(counts(), { starts: 1, reads: 4 });
});

test("truncated JSON retries the read", async () => {
  let attempt = 0;
  const { client, counts } = setup(() => ++attempt === 1 ? new Response("[") : Response.json([]));
  assert.deepEqual((await client.run({})).items, []);
  assert.deepEqual(counts(), { starts: 1, reads: 2 });
});
