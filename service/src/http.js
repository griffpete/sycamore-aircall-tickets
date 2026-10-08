const MAX_ATTEMPTS = 5;
const DEFAULT_WAIT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getRetryWaitMs(response) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    return Number(retryAfter) * 1000;
  }

  const resetAt = response.headers.get("x-ratelimit-reset");

  if (resetAt) {
    return Math.max(Number(resetAt) * 1000 - Date.now(), 1000);
  }

  return DEFAULT_WAIT_MS;
}

function parseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function requestJson(url, options, label) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const waitMs = getRetryWaitMs(response);
      console.log(`${label} was rate limited. Retrying in ${Math.ceil(waitMs / 1000)}s.`);
      await sleep(waitMs);
      continue;
    }

    const text = await response.text();
    const body = parseBody(text);

    if (!response.ok) {
      const error = new Error(`${label} failed with status ${response.status}: ${text}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
  }
}
