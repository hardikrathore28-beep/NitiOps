# Audit Verification Utility

A CLI tool to verify the cryptographic integrity of the `audit_events` ledger.

## Usage

```bash
# Verify the entire chain
npm start

# Verify (filtered report - requires global chain scan)
npm start -- --tenant <tenant_id>
```

## How it works

1.  Connects to the PostgreSQL database.
2.  Streams all `audit_events` ordered by `timestamp` and `event_id`.
3.  Verifies the Cryptographic Chain:
    *   Checks if `hash_prev` of event `N` matches `hash_this` of event `N-1`.
    *   Checks if `hash_this` of event `N` equals `SHA256(payload_hash + hash_prev)`.
4.  Reports `PASS` or `FAIL`.

## Limitation

Due to JSONB serialization differences between PostgreSQL and Node.js, this tool currently **trusts the stored `payload_hash`** represents the content, and verifies the **chain integrity** (`payload_hash` -> `hash_this` -> `next.hash_prev`). A mismatched `payload_hash` against the JSON content would require a Postgres-compatible JSON canonicalization library in JS.
