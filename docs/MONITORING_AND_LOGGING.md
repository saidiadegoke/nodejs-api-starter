# Monitoring and Logging

## How 500 errors are handled

1. **Controllers**  
   Most routes use `try/catch` and call `sendError(res, message, statusCode)`. If they don’t catch an error, it bubbles up.

2. **Global error handler** (`src/shared/middleware/error.middleware.js`)  
   - Runs for any unhandled error (including those that should be 500).  
   - Logs: `logger.error('Error occurred:', { message, stack, path, method })`.  
   - Sends: `statusCode = err.statusCode || 500`, body `{ success: false, message }`.  
   - So every 500 (and any uncaught error) is logged once with path and method, then a generic “Internal Server Error” style response is sent.

3. **Response helper**  
   `sendError(res, message, statusCode = 500, details)` always sends a JSON body; 500 is used when `statusCode` is not set elsewhere.

## Current logging (dashboard / real-time)

- **Logger** (`src/shared/utils/logger.js`)  
  - Writes to **stdout only** (`console.log` / `console.error` / etc.).  
  - No log files, no external service, no structured format by default.  
  - So: **not** stored in a way that’s directly dashboard-ready (no central log store, no query API).

- **Request logging** (`app.js`)  
  - On every request: `logger.info(\`${req.method} ${req.path} ${res.statusCode} - ${duration}ms\`)`.  
  - Again stdout only; no request ID, no JSON.  
  - So you **do** have “all requests” in logs, but only as plain text in the process output.

- **Errors**  
  - Handled errors: logged (or not) inside each controller.  
  - Unhandled errors: logged by the global error handler (message, stack, path, method) to stdout.  
  - So: **not** in a format or system that gives you “real-time what fails” or “health of app” without extra tooling.

**Summary:**  
500s are handled and logged to stdout; all requests are logged to stdout. There is **no** built-in dashboard, no central error store, and no request metrics API. To get “real-time what fails” and “health of app” you need to add one or more of:

- Structured logging (e.g. JSON) and a log pipeline (file → collector, or stdout → Docker/K8s → Datadog/CloudWatch/Logtail).
- A metrics/APM tool (e.g. Prometheus, Datadog) that scrapes or receives request/error metrics.
- Optional: request IDs and consistent error fields so logs can be grouped and searched.

## Monitoring all requests

- **Today:**  
  Every request is logged once on `res.finish` (method, path, status code, duration). So you **do** have “monitoring” in the sense that every request is logged; the gap is where logs go and how they’re queried (no dashboard or query API in the app itself).

- **To monitor properly (e.g. dashboard, alerts):**  
  1. Use **structured request logging** (e.g. JSON with method, path, statusCode, durationMs, requestId).  
  2. Send logs to a **log aggregator** (e.g. Datadog, AWS CloudWatch, Logtail, ELK) or write to a file that a collector reads.  
  3. Optionally add **metrics** (e.g. request count, error count, latency) to Prometheus/Datadog so you can graph “all requests” and “health” without parsing log lines.

## Recommended next steps (dashboard + health)

1. **Structured logger**  
   - Log JSON with: `level`, `timestamp`, `message`, `path`, `method`, `statusCode`, `durationMs`, `requestId`, `error` (for errors).  
   - Use `LOG_FORMAT=json` (or similar) so existing log pipelines can parse one line per event.

2. **Request ID**  
   - Generate a `requestId` per request (e.g. `X-Request-ID` or internal).  
   - Add it to every log line for that request so you can trace a request and its errors.

3. **Central logs**  
   - Keep stdout; add a log sink (file, or a transport to Datadog/Logtail/CloudWatch) so logs are stored and queryable.  
   - Then you can build dashboards (“errors in last hour”, “5xx by path”, “slow requests”) from log queries.

4. **Health endpoint**  
   - You already have `GET /health` (success + timestamp + env).  
   - Optionally extend it with: DB ping, cache ping, or dependency checks so “health” reflects real dependency status.

5. **Metrics (optional)**  
   - Add a `/metrics` (e.g. Prometheus) or send counters/timers to Datadog/StatsD so you can graph request rate, error rate, and latency without scraping logs.

With the structured logger and request logging added in code, logs become **dashboard-ready** as soon as they are shipped to any log or metrics backend.

---

## What’s implemented (dashboard-ready logs)

1. **Structured logger** (`src/shared/utils/logger.js`)
   - **LOG_FORMAT=json**: one JSON object per line (`level`, `timestamp`, `message`, plus any meta). Safe for Datadog, CloudWatch, Logtail, ELK, etc.
   - **Default**: human-readable `[LEVEL] timestamp: message` plus optional meta JSON.
   - **logger.request(meta)**: logs a request with `method`, `path`, `statusCode`, `durationMs`, `requestId` for monitoring.

2. **Request ID**
   - Every request gets `req.id` (from `X-Request-ID` header or a random id). Response includes `X-Request-ID`.
   - Errors and request logs include `requestId` so you can correlate a failing request with its log line.

3. **Request logging**
   - Each request is logged on finish with: `method`, `path`, `statusCode`, `durationMs`, `requestId` (via `logger.request(...)`).

4. **Error logging**
   - Global error handler logs: `message`, `stack`, `path`, `method`, `requestId`, `statusCode`.

5. **File persistence and rotation**
   - When **LOG_DIR** is set, logs are written to files in addition to stdout.
   - **Daily rotation**: one file per day (`app-YYYY-MM-DD.log`, `error-YYYY-MM-DD.log`). Date pattern configurable via **LOG_DATE_PATTERN** (default `YYYY-MM-DD`).
   - **Retention / deletion of old logs**: files older than **LOG_MAX_DAYS** are deleted automatically (default `14` days). Set to a number (e.g. `7`) or a string like `14d`.
   - **Files**:
     - `app-YYYY-MM-DD.log` – all levels (info, warn, error, debug, request).
     - `error-YYYY-MM-DD.log` – errors only.
   - If `LOG_DIR` is not set, behavior is unchanged: logs go to stdout only (no files, no rotation).

**Env vars**
- **LOG_FORMAT=json** – use JSON lines for all logs (for log aggregators and dashboards).
- **LOG_DEBUG=true** – enable debug logs in any environment.
- **LOG_DIR** – optional. Directory for log files (e.g. `logs` or `/var/log/smartstore-api`). When set, enables file transport with daily rotation and retention.
- **LOG_MAX_DAYS** – optional. Keep log files for this many days; older files are deleted (default `14`).
- **LOG_DATE_PATTERN** – optional. Date pattern for rotated filenames (default `YYYY-MM-DD`).
